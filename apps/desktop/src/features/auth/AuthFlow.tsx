import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import * as api from "../../infrastructure/api";
import * as crypto from "../../infrastructure/crypto";
import * as vault from "../../infrastructure/vault";
import OnboardingScreen from "./OnboardingScreen";
import { useToast } from "../../components/ui/Toast";
import { handleError } from "../../utils/errors";

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
      const challengeRes = await api.loginChallenge(loginEmail);
      const { challenge, devices, user_id } = challengeRes;
      
      const savedKeys = await vault.getLocalKeys().catch(() => null);
      const savedDevice = await vault.getDeviceId().catch(() => null);

      if (savedKeys && savedDevice) {
        // We have local keys and a device ID — check if it's in the server list
        const match = devices.find((d: any) => d.id === savedDevice);
        if (match) {
          // Sign challenge and verify
          setLoadingStep("Signing security challenge...");
          const signature = await invoke<string>("sign_login_challenge", {
            identitySecretB64: savedKeys.identity_secret,
            challengeB64: challenge
          });
          
          const verifyRes = await api.loginVerify({
            user_id: user_id,
            device_id: savedDevice,
            signature,
            challenge
          });

          api.setToken(verifyRes.token);
          await invoke("set_session_jwt", { jwt: verifyRes.token }).catch(() => {});
          localKeys.current = savedKeys;
          myDeviceId.current = savedDevice;
          saveAccount(loginEmail);
          const claims = decodeJwtClaims(verifyRes.token);
          onAuthenticated(user_id, verifyRes.org_id, loginEmail, savedDevice, savedKeys, (claims as any)?.role || "USER", verifyRes.username, verifyRes.department);
          return;
        }
      }

      // No match or no local keys — we need to register this device
      if (uid) {
        setUserId(uid);
        setView("REGISTER");
      }
    } catch (err) {
      const appErr = handleError(err, "handleLogin");
      if (appErr.message === "MAINTENANCE_MODE") {
        setIsMaintenance(true);
      } else {
        addToast(appErr.getFriendlyMessage(), "error");
      }
    }
  };

  const completeSetup = async (token: string, uid: string, orgIdVal: string, roleVal: string, username?: string, department?: string, deviceIdVal?: string) => {
    api.setToken(token);
    setUserId(uid);
    await invoke("set_session_jwt", { jwt: token }).catch(() => {});

    // Use existing keys if we have them, otherwise generate new ones
    let keys = await vault.getLocalKeys().catch(() => null);
    if (!keys) {
      setLoadingStep("Generating X25519 Identity Keys...");
      keys = await crypto.generateKeys();
      await vault.saveLocalKeys(keys);
    }
    localKeys.current = keys;
    
    setLoadingStep("Finalizing secure vault...");
    try {
      const otpkPairs = keys.one_time_pre_keys.map((k: any) => ({
        key_id: k.key_id.toString(),
        private_key: Array.from(Uint8Array.from(atob(k.secret_key), c => c.charCodeAt(0)))
      }));
      await vault.storeOtpkBatch(otpkPairs);
    } catch (err) {
      const appErr = handleError(err, "completeSetup:vault");
      throw new Error(`Failed to save keys to local secure vault: ${appErr.message}`);
    }

    myDeviceId.current = deviceIdVal || null;
    if (deviceIdVal) {
      await vault.saveDeviceId(deviceIdVal);
    }

    saveAccount(email);
    onAuthenticated(uid, orgIdVal, email, deviceIdVal || "TEMP", keys, roleVal, username, department);
  };

  const handleRegisterDevice = async () => {
    if (!userId || !accessCode) {
      addToast("Missing access code. Please request access again.", "error");
      return;
    }
    setView("LOADING");
    try {
      // 1. Generate keys locally
      setLoadingStep("Generating cryptographic identity...");
      const keys = await crypto.generateKeys();
      
      // 2. Register device with server using access code
      setLoadingStep("Registering device with organization...");
      const regRes = await api.registerDevice({
        email,
        access_code: accessCode,
        device_name: "Desktop App",
        identity_key: keys.identity_public,
        signed_pre_key: keys.signed_pre_key_public,
        signed_pre_key_sig: keys.signed_pre_key_signature
      });

      // 3. Save everything locally
      await vault.saveLocalKeys(keys);
      await vault.saveDeviceId(regRes.device_id);
      
      const otpkPairs = keys.one_time_pre_keys.map((k: any) => ({
        key_id: k.key_id.toString(),
        private_key: Array.from(Uint8Array.from(atob(k.secret_key), c => c.charCodeAt(0)))
      }));
      await vault.storeOtpkBatch(otpkPairs);

      api.setToken(regRes.token);
      await invoke("set_session_jwt", { jwt: regRes.token }).catch(() => {});
      
      localKeys.current = keys;
      myDeviceId.current = regRes.device_id;
      saveAccount(email);
      
      const claims = decodeJwtClaims(regRes.token);
      onAuthenticated(userId, regRes.org_id, email, regRes.device_id, keys, (claims as any)?.role || "USER", regRes.username, regRes.department);
    } catch (err) {
      const appErr = handleError(err, "handleRegisterDevice");
      console.error("Registration failed:", appErr);
      setView("REGISTER");
      addToast(appErr.getFriendlyMessage(), "error");
    }
  };

  const checkApproval = async () => {
    setIsCheckingApproval(true);
    try {
      const res = await api.requestAccess(email);
      if (res.status === "active") {
        await handleLogin(email, res.user_id);
      } else {
        addToast("Still pending approval...", "info");
      }
    } catch (err: any) {
      addToast("Failed to check approval status.", "error");
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
      onRegister={handleRegisterDevice}
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
