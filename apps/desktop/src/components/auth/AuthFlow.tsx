import { useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import * as api from "../../api";
import * as crypto from "../../lib/crypto";
import * as vault from "../../lib/vault";
import OnboardingScreen from "./OnboardingScreen";

type View = "HOME" | "WAITING" | "REGISTER";

export default function AuthFlow({
  onAuthenticated,
  onAdminAccess,
  onDemoMode,
}: {
  onAuthenticated: (
    userId: string,
    orgId: string,
    deviceId: string,
    localKeys: any,
    isAdmin: boolean,
  ) => void;
  onAdminAccess: () => void;
  onDemoMode: () => void;
}) {
  const [view, setView] = useState<View>("HOME");
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [orgId, setOrgId] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [isCheckingApproval, setIsCheckingApproval] = useState(false);
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const localKeys = useRef<any>(null);
  const myDeviceId = useRef<string | null>(null);

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
    e.preventDefault(); setError("");
    try {
      const res = await api.requestAccess(email);
      if (res.error) throw new Error(res.error);
      setUserId(res.user_id);
      setAccessCode(res.access_code || "");
      if (res.status === "active") await handleLogin(email, res.user_id);
      else setView("WAITING");
    } catch (err: any) {
      setError(err.message || "We couldn't reach your workspace. Check the server connection and API base URL.");
    }
  };

  const handleLogin = async (loginEmail: string, uid: string) => {
    try {
      const res = await api.loginPasskey(loginEmail);
      if (res.error) throw new Error(res.error);
      api.setToken(res.token); setUserId(uid); setOrgId(res.org_id);
      await invoke("set_session_jwt", { jwt: res.token }).catch(() => {});
      const claims = decodeJwtClaims(res.token);
      setIsAdmin(Boolean((claims as any)?.is_admin));
      
      const savedKeys = await vault.getLocalKeys().catch(() => null);
      if (savedKeys) localKeys.current = savedKeys;
      const savedDevice = await vault.getDeviceId().catch(() => null);
      if (savedDevice) myDeviceId.current = savedDevice;

      if (!localKeys.current) setView("REGISTER"); else startSession();
    } catch (err: any) {
      setError("Login failed. " + err.message);
      if (err.message?.includes("No passkeys found") && uid) setView("REGISTER");
    }
  };

  const handleRegisterPasskey = async () => {
    if (!userId || !orgId) return; setError("");
    try {
      const keys = await crypto.generateKeys(); localKeys.current = keys;
      try { await vault.saveLocalKeys(keys); } catch {}
      const uploadRes = await api.uploadKeys({
        user_id: userId, org_id: orgId, device_name: "Desktop App",
        identity_key: keys.identity_public, signed_pre_key: keys.signed_pre_key_public,
        signed_pre_key_sig: keys.signed_pre_key_signature,
        one_time_pre_keys: keys.one_time_pre_keys.map((k: any) => ({ key_id: k.key_id, public_key: k.public_key })),
      });
      if (uploadRes.error) throw new Error(uploadRes.error);
      myDeviceId.current = uploadRes.device_id;
      try { await vault.saveDeviceId(uploadRes.device_id); } catch {}
      const res = await api.registerPasskey(userId);
      if (res.error) throw new Error(res.error);
      startSession();
    } catch (err: any) { setError(err.message); }
  };

  const checkApproval = async () => {
    setIsCheckingApproval(true);
    try {
      await handleLogin(email, userId);
    } catch (err: any) {
      if (!err.message?.includes("No passkeys found")) {
        setError("Still pending approval...");
      }
    } finally {
      setIsCheckingApproval(false);
    }
  };

  const startSession = () => {
    if (!myDeviceId.current) {
      setError("Device identity missing. Please register this device again.");
      setView("REGISTER");
      return;
    }
    onAuthenticated(userId, orgId, myDeviceId.current, localKeys.current, isAdmin);
  };

  return (
    <OnboardingScreen
      view={view}
      email={email}
      error={error}
      accessCode={accessCode}
      isCheckingApproval={isCheckingApproval}
      onEmailChange={setEmail}
      onSubmit={handleRequestAccess}
      onRegister={handleRegisterPasskey}
      onBack={() => setView("HOME")}
      onCheckApproval={checkApproval}
      onAdminAccess={onAdminAccess}
      onDemoMode={onDemoMode}
    />
  );
}
