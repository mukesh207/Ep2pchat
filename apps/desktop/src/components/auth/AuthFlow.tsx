import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import * as api from "../../api";
import * as crypto from "../../lib/crypto";
import * as vault from "../../lib/vault";
import OnboardingScreen from "./OnboardingScreen";
import { useToast } from "../ui/Toast";

type View = "HOME" | "WAITING" | "REGISTER" | "LOADING";

export default function AuthFlow({
  onAuthenticated,
}: {
  onAuthenticated: (
    userId: string,
    orgId: string,
    deviceId: string,
    localKeys: any,
    isAdmin: boolean,
  ) => void;
}) {
  const { addToast } = useToast();
  const [view, setView] = useState<View>("HOME");
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [isCapsLock, setIsCapsLock] = useState(false);
  const [isBootstrapMode] = useState(() => api.canAttemptAdminBootstrap());
  const [isOffline, setIsOffline] = useState(false);
  const [isMaintenance, setIsMaintenance] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [savedAccounts, setSavedAccounts] = useState<string[]>([]);

  const [accessCode, setAccessCode] = useState("");
  const [isCheckingApproval, setIsCheckingApproval] = useState(false);

  const localKeys = useRef<any>(null);
  const myDeviceId = useRef<string | null>(null);

  useEffect(() => {
    // Check server health on mount
    const checkHealth = async () => {
      const ok = await api.checkServerHealth();
      setIsOffline(!ok);
    };
    void checkHealth();

    // Load saved accounts
    const saved = localStorage.getItem("trustline.saved_accounts");
    if (saved) {
      try {
        setSavedAccounts(JSON.parse(saved));
      } catch {
        setSavedAccounts([]);
      }
    }

    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  const saveAccount = (emailToSave: string) => {
    const next = Array.from(new Set([emailToSave, ...savedAccounts])).slice(0, 5);
    setSavedAccounts(next);
    localStorage.setItem("trustline.saved_accounts", JSON.stringify(next));
  };

  const handleCancelRequest = () => {
    setView("HOME");
    setEmail("");
    setUserId("");
    setAccessCode("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    setIsCapsLock(e.getModifierState("CapsLock"));
  };

  const decodeJwtClaims = (token: string): Record<string, unknown> | null => {
    try {
      const parts = token.split(".");
      if (parts.length < 2) return null;
      const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
      return JSON.parse(atob(padded));
    } catch {
      return null;
    }
  };

  const handleRequestAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsMaintenance(false);
    try {
      const res = await api.requestAccess(email);
      if (res.error === "MAINTENANCE_MODE") {
        setIsMaintenance(true);
        return;
      }
      if (res.error) throw new Error(res.error);
      setUserId(res.user_id);
      setAccessCode(res.access_code || "");
      if (res.status === "active") {
        // Try admin bootstrap first when a setup token is configured.
        if (api.canAttemptAdminBootstrap()) {
          try {
            const bootstrapRes = await api.adminBootstrap(email);
            if (bootstrapRes.token) {
              setView("LOADING");
              await completeSetup(bootstrapRes.token, res.user_id, bootstrapRes.org_id, true);
              return;
            }
          } catch {
            // Not the configured admin or bootstrap is unavailable — continue with passkey login.
          }
        }
        await handleLogin(email, res.user_id);
      } else {
        setView("WAITING");
      }
    } catch (err: any) {
      addToast(err.message || "We couldn't reach your workspace. Check the server connection and API base URL.", "error");
    }
  };

  const handleLogin = async (loginEmail: string, uid: string) => {
    setIsMaintenance(false);
    try {
      const res = await api.loginPasskey(loginEmail);
      if (res.error === "MAINTENANCE_MODE") {
        setIsMaintenance(true);
        return;
      }
      if (res.error) throw new Error(res.error);
      api.setToken(res.token); setUserId(uid);
      await invoke("set_session_jwt", { jwt: res.token }).catch(() => {});
      
      const savedKeys = await vault.getLocalKeys().catch(() => null);
      if (savedKeys) localKeys.current = savedKeys;
      const savedDevice = await vault.getDeviceId().catch(() => null);
      if (savedDevice) myDeviceId.current = savedDevice;

      if (!localKeys.current) setView("REGISTER"); else {
        saveAccount(loginEmail);
        const claims = decodeJwtClaims(api.getToken());
        onAuthenticated(uid, res.org_id, loginEmail, myDeviceId.current!, localKeys.current, Boolean((claims as any)?.is_admin));
      }
    } catch (err: any) {
      // "No passkeys found" is expected for first-time users — don't show as error
      if (err.message?.includes("No passkeys found") && uid) {
        setView("REGISTER");
      } else {
        addToast("Login failed: " + err.message, "error");
      }
    }
  };

  const completeSetup = async (token: string, uid: string, orgIdVal: string, adminFlag: boolean) => {
    api.setToken(token);
    setUserId(uid);
    await invoke("set_session_jwt", { jwt: token }).catch(() => {});

    setLoadingStep("Generating X25519 Identity Keys...");
    const keys = await crypto.generateKeys();
    localKeys.current = keys;
    
    setLoadingStep("Anchoring to hardware Secure Enclave...");
    try {
      await vault.saveLocalKeys(keys);
      const otpkPairs = keys.one_time_pre_keys.map((k: any) => ({
        key_id: k.key_id.toString(),
        private_key: Array.from(Uint8Array.from(atob(k.secret_key), c => c.charCodeAt(0)))
      }));
      await vault.storeOtpkBatch(otpkPairs);
    } catch (err) {
      console.error("Local vault save failed", err);
    }

    setLoadingStep("Syncing public keys with relay server...");
    const uploadRes = await api.uploadKeys({
      user_id: uid,
      org_id: orgIdVal,
      device_name: "Desktop App",
      identity_key: keys.identity_public,
      signed_pre_key: keys.signed_pre_key_public,
      signed_pre_key_sig: keys.signed_pre_key_signature,
      one_time_pre_keys: keys.one_time_pre_keys.map((k: any) => ({ key_id: k.key_id, public_key: k.public_key })),
    });
    if (uploadRes.error) throw new Error(uploadRes.error);

    myDeviceId.current = uploadRes.device_id;
    try { await vault.saveDeviceId(uploadRes.device_id); } catch {}

    saveAccount(email);
    // Call onAuthenticated directly with fresh values (React setState is async)
    onAuthenticated(uid, orgIdVal, email, uploadRes.device_id, keys, adminFlag);
  };

  const handleRegisterPasskey = async () => {
    if (!userId) return;
    setView("LOADING");
    try {
      // Try admin bootstrap first when a setup token is configured.
      if (api.canAttemptAdminBootstrap()) {
        try {
          const bootstrapRes = await api.adminBootstrap(email);
          if (bootstrapRes.token) {
            await completeSetup(bootstrapRes.token, userId, bootstrapRes.org_id, true);
            return;
          }
        } catch {
          // Not the configured admin or bootstrap is unavailable — continue with normal flow.
        }
      }

      // Normal WebAuthn flow for non-admin users
      const regRes = await api.registerPasskey(userId);
      if (regRes.error) throw new Error(regRes.error);

      const loginRes = await api.loginPasskey(email);
      if (loginRes.error) throw new Error(loginRes.error);

      await completeSetup(loginRes.token, userId, loginRes.org_id, Boolean((decodeJwtClaims(loginRes.token) as any)?.is_admin));
    } catch (err: any) {
      setView("REGISTER");
      addToast(err.message, "error");
    }
  };

  const checkApproval = async () => {
    setIsCheckingApproval(true);
    try {
      await handleLogin(email, userId);
    } catch (err: any) {
      if (!err.message?.includes("No passkeys found")) {
        addToast("Still pending approval...", "error");
      }
    } finally {
      setIsCheckingApproval(false);
    }
  };


  const handleAccountSelect = (selectedEmail: string) => {
    setEmail(selectedEmail);
    // Automatically trigger access request for the selected email
    void api.requestAccess(selectedEmail).then((res) => {
      if (res.error) throw new Error(res.error);
      setUserId(res.user_id);
      setAccessCode(res.access_code || "");
      if (res.status === "active") {
        void handleLogin(selectedEmail, res.user_id);
      } else {
        setView("WAITING");
      }
    }).catch(err => {
      addToast(err.message || "Failed to reach server for selected account.", "error");
    });
  };

  return (
    <OnboardingScreen
      view={view}
      email={email}
      accessCode={accessCode}
      isCheckingApproval={isCheckingApproval}
      onEmailChange={setEmail}
      onSubmit={handleRequestAccess}
      onRegister={handleRegisterPasskey}
      onCheckApproval={checkApproval}
      isCapsLock={isCapsLock}
      isBootstrapMode={isBootstrapMode}
      onKeyDown={handleKeyDown}
      isOffline={isOffline}
      isMaintenance={isMaintenance}
      loadingStep={loadingStep}
      savedAccounts={savedAccounts}
      onCancelRequest={handleCancelRequest}
      onAccountSelect={handleAccountSelect}
    />
  );
}
