import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import * as api from "../../api";
import * as crypto from "../../lib/crypto";
import * as vault from "../../lib/vault";
import OnboardingScreen from "./OnboardingScreen";
import { useToast } from "../ui/Toast";
import { handleError } from "../../lib/errors";

type View = "HOME" | "WAITING" | "REGISTER" | "LOADING";
export default function AuthFlow({
  onAuthenticated,
}: {
  onAuthenticated: (
    userId: string,
    orgId: string,
    email: string,
    deviceId: string,
    localKeys: any,
    role: string,
    username?: string,
    department?: string,
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
      setUserId(res.user_id);
      setAccessCode(res.access_code || "");
      if (res.status === "active") {
        // Try admin bootstrap first when a setup token is configured.
        if (api.canAttemptAdminBootstrap()) {
          let bootstrapRes = null;
          try {
            bootstrapRes = await api.adminBootstrap(email);
          } catch {
            // Not the configured admin or bootstrap is unavailable — fall through to passkey
          }

          if (bootstrapRes && bootstrapRes.token) {
            setView("LOADING");
            // Check if this admin already has keys in the vault (returning admin session)
            const savedKeys = await vault.getLocalKeys().catch(() => null);
            const savedDevice = await vault.getDeviceId().catch(() => null);
            if (savedKeys && savedDevice) {
              // Returning admin: restore the session directly without re-generating keys
              setLoadingStep("Restoring secure session...");
              api.setToken(bootstrapRes.token);
              await invoke("set_session_jwt", { jwt: bootstrapRes.token }).catch(() => {});
              localKeys.current = savedKeys;
              myDeviceId.current = savedDevice;
              saveAccount(email);
              onAuthenticated(res.user_id, bootstrapRes.org_id, email, savedDevice, savedKeys, "ADMIN", bootstrapRes.username, bootstrapRes.department);
            } else {
              // First-time admin: run full key generation and device registration
              await completeSetup(bootstrapRes.token, res.user_id, bootstrapRes.org_id, "ADMIN", bootstrapRes.username, bootstrapRes.department);
            }
            return;
          }
        }
        await handleLogin(email, res.user_id);
      } else {
        setView("WAITING");
      }
    } catch (err) {
      const appErr = handleError(err, "handleRequestAccess");
      if (appErr.message === "MAINTENANCE_MODE") {
          setIsMaintenance(true);
      } else {
          addToast(appErr.getFriendlyMessage(), "error");
      }
    }
  };

  const handleLogin = async (loginEmail: string, uid: string) => {
    setIsMaintenance(false);
    try {
      const res = await api.loginPasskey(loginEmail);
      api.setToken(res.token); setUserId(uid);
      await invoke("set_session_jwt", { jwt: res.token }).catch(() => {});
      
      const savedKeys = await vault.getLocalKeys().catch(() => null);
      if (savedKeys) localKeys.current = savedKeys;
      const savedDevice = await vault.getDeviceId().catch(() => null);
      if (savedDevice) myDeviceId.current = savedDevice;

      if (!localKeys.current) {
        setView("LOADING");
        const claims = decodeJwtClaims(res.token);
        await completeSetup(res.token, uid, res.org_id, (claims as any)?.role || "USER", res.username, res.department);
      } else {
        saveAccount(loginEmail);
        const claims = decodeJwtClaims(api.getToken());
        onAuthenticated(uid, res.org_id, loginEmail, myDeviceId.current!, localKeys.current, (claims as any)?.role || "USER", res.username, res.department);
      }
    } catch (err) {
      const appErr = handleError(err, "handleLogin");
      // "No passkeys found" is expected for first-time users — don't show as error
      if (appErr.message?.includes("No passkeys found") && uid) {
        setView("REGISTER");
      } else if (appErr.message === "MAINTENANCE_MODE") {
        setIsMaintenance(true);
      } else {
        addToast(appErr.getFriendlyMessage(), "error");
      }
    }
  };

  const completeSetup = async (token: string, uid: string, orgIdVal: string, roleVal: string, username?: string, department?: string) => {
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
      const appErr = handleError(err, "completeSetup:vault");
      throw new Error(`Failed to save keys to local secure vault: ${appErr.message}`);
    }

    setLoadingStep("Syncing public keys with relay server...");
    try {
      const uploadRes = await api.uploadKeys({
        user_id: uid,
        org_id: orgIdVal,
        device_name: "Desktop App",
        identity_key: keys.identity_public,
        signed_pre_key: keys.signed_pre_key_public,
        signed_pre_key_sig: keys.signed_pre_key_signature,
        one_time_pre_keys: keys.one_time_pre_keys.map((k: any) => ({ key_id: k.key_id, public_key: k.public_key })),
      });

      myDeviceId.current = uploadRes.device_id;
      try { await vault.saveDeviceId(uploadRes.device_id); } catch {}

      saveAccount(email);
      // Call onAuthenticated directly with fresh values (React setState is async)
      onAuthenticated(uid, orgIdVal, email, uploadRes.device_id, keys, roleVal, username, department);
    } catch (err) {
      const appErr = handleError(err, "completeSetup:api");
      throw new Error(`Sync failed: ${appErr.message}`);
    }
  };

  const handleRegisterPasskey = async () => {
    if (!userId) return;
    setView("LOADING");
    try {
      // Try admin bootstrap first when a setup token is configured.
      if (api.canAttemptAdminBootstrap()) {
        let bootstrapRes = null;
        try {
          bootstrapRes = await api.adminBootstrap(email);
        } catch {
          // Not the configured admin or bootstrap is unavailable
        }

        if (bootstrapRes && bootstrapRes.token) {
          // Check if this admin already has keys in the vault (returning admin session)
          const savedKeys = await vault.getLocalKeys().catch(() => null);
          const savedDevice = await vault.getDeviceId().catch(() => null);
          if (savedKeys && savedDevice) {
            setLoadingStep("Restoring secure session...");
            api.setToken(bootstrapRes.token);
            await invoke("set_session_jwt", { jwt: bootstrapRes.token }).catch(() => {});
            localKeys.current = savedKeys;
            myDeviceId.current = savedDevice;
            saveAccount(email);
            onAuthenticated(userId, bootstrapRes.org_id, email, savedDevice, savedKeys, "ADMIN", bootstrapRes.username, bootstrapRes.department);
          } else {
            await completeSetup(bootstrapRes.token, userId, bootstrapRes.org_id, "ADMIN", bootstrapRes.username, bootstrapRes.department);
          }
          return;
        }
      }

      // Normal WebAuthn flow for non-admin users
      await api.registerPasskey(userId);
      const loginRes = await api.loginPasskey(email);

      const claims = decodeJwtClaims(loginRes.token);
      await completeSetup(loginRes.token, userId, loginRes.org_id, (claims as any)?.role || "USER", loginRes.username, loginRes.department);
    } catch (err) {
      const appErr = handleError(err, "handleRegisterPasskey");
      console.error("Register/Login flow failed:", appErr);
      setView("REGISTER");
      addToast(appErr.getFriendlyMessage(), "error");
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
