import { Shield, Lock, Zap, Key, User, RefreshCw, CheckCircle, Info, AlertCircle, ExternalLink, WifiOff, AlertTriangle } from "lucide-react";
import { ShaderAnimation } from "../ui/shader-lines";
import { useMemo } from "react";

// Declared in vite.config.ts
declare const __APP_VERSION__: string;

type OnboardingProps = {
  view: "HOME" | "WAITING" | "REGISTER" | "LOADING";
  email: string;
  accessCode: string;
  isCheckingApproval: boolean;
  onEmailChange: (e: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onRegister: () => void;
  onCheckApproval: () => void;
  isCapsLock: boolean;
  isBootstrapMode: boolean;
  onKeyDown: (e: React.KeyboardEvent) => void;
  isOffline: boolean;
  isMaintenance: boolean;
  loadingStep: string;
  savedAccounts: string[];
  onCancelRequest: () => void;
  onAccountSelect: (email: string) => void;
};

function OnboardingScreen({
  view, email, accessCode, isCheckingApproval,
  onEmailChange, onSubmit, onRegister, onCheckApproval,
  isCapsLock, isBootstrapMode, onKeyDown,
  isOffline, isMaintenance, loadingStep, savedAccounts, onCancelRequest, onAccountSelect
}: OnboardingProps) {
  const orgContext = useMemo(() => {
    if (!email.includes("@")) return null;
    const domain = email.split("@")[1];
    if (!domain || !domain.includes(".")) return null;
    
    const name = domain.split(".")[0]
      .replace(/-/g, " ")
      .split(" ")
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    
    return { name, domain, initials: name.charAt(0).toUpperCase() };
  }, [email]);

  return (
    <div className="onboarding-bg" onKeyDown={onKeyDown}>
      <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", zIndex: 0, opacity: 0.6 }}>
        <ShaderAnimation />
      </div>
      {/* Ambient corner brackets */}
      {(["tl","tr","bl","br"] as const).map(pos => (
        <div key={pos} className={`corner-frame corner-frame-${pos}`} />
      ))}

      <div className="binary-bg" aria-hidden="true">
        {Array(300).fill("0 1").join("  ")}
      </div>

      <div className="onboarding-glow" />

      <div className="onboarding-card">
        <div className="bracket-tl" /><div className="bracket-tr" />
        <div className="bracket-bl" /><div className="bracket-br" />

        <div className="onboarding-logo">
          <div className="onboarding-hex-icon">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ display: "block" }}>
              <polygon
                points="24,3 44,13 44,35 24,45 4,35 4,13"
                fill="rgba(240,165,0,0.08)"
                stroke="var(--accent-primary)" strokeWidth="1.5"
              />
              <path d="M16 24l6 6 10-12" stroke="var(--accent-primary)" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="onboarding-logo-text">TRUSTLINE</div>
          <div className="onboarding-logo-sub">Private messaging for teams that need security by default</div>
        </div>


        <div className={`onboarding-view-transition ${view}`}>
          {view === "HOME" && (
            isMaintenance ? (
                <div className="status-card" style={{ animation: 'fadeSlideIn 0.3s ease' }}>
                  <div style={{ margin: "0 auto 20px", color: "var(--accent-warning)", display: "flex", justifyContent: "center" }}>
                    <AlertTriangle size={40} strokeWidth={1.5} />
                  </div>
                  <div className="status-card-title">Maintenance Mode</div>
                  <div className="status-card-desc">
                    Your organization workspace is currently undergoing scheduled maintenance. 
                    Access is temporarily restricted to administrators only.
                  </div>
                  <button className="btn btn-ghost btn-full" onClick={() => window.location.reload()} style={{ marginTop: 12 }}>
                    <RefreshCw size={14} /> Try again later
                  </button>
                </div>
              ) : (
            <form onSubmit={onSubmit}>
              {isBootstrapMode && (
                <div className="bootstrap-badge">
                  <Zap size={10} fill="var(--accent-primary)" />
                  SYSTEM INITIALIZATION MODE
                </div>
              )}

              {isOffline && (
                <div className="offline-warning">
                  <WifiOff size={14} />
                  <span>Server unreachable. Check your connection.</span>
                </div>
              )}
              
              <div className="onboarding-copy">
                <h1>{orgContext ? `Sign in to ${orgContext.name}` : "Sign in to your workspace"}</h1>
                <p>Use your work email to request access or continue with your existing passkey.</p>
              </div>

              {savedAccounts.length > 0 && !email && (
                <div className="saved-accounts">
                  <div className="saved-accounts-label">RECENT ACCOUNTS</div>
                  <div className="saved-accounts-list">
                    {savedAccounts.map((acc) => (
                      <button 
                        key={acc} 
                        type="button" 
                        className="saved-account-item"
                        onClick={() => onAccountSelect(acc)}
                      >
                        <div className="avatar-preview" style={{ width: 28, height: 28, fontSize: '0.75rem' }}>
                          {acc.charAt(0).toUpperCase()}
                        </div>
                        <div className="saved-account-info">
                          <div className="saved-account-email">{acc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="form-group">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <label className="onboarding-form-label" htmlFor="email-input">
                    Work email
                  </label>
                  {isCapsLock && (
                    <span className="caps-lock-warning">
                      <AlertCircle size={10} /> CAPS LOCK ON
                    </span>
                  )}
                </div>
                <input
                  id="email-input"
                  className="input"
                  type="email"
                  value={email}
                  onChange={e => onEmailChange(e.target.value)}
                  placeholder="name@company.com"
                  required autoComplete="off"
                  disabled={isOffline}
                />
              </div>

              <button id="enter-btn" type="submit" className="btn btn-primary btn-full" disabled={isOffline}>
                <Shield size={14} /> Continue
              </button>

              <div className="security-badges">
                {[
                  { icon: <Lock size={10} />,    label: "End-to-end encryption" },
                  { icon: <Shield size={10} />,  label: "Protected storage" },
                  { icon: <Zap size={10} />,     label: "Passkey sign-in", tooltip: "Trustline uses hardware-bound FIDO2 passkeys (Biometrics/TPM) instead of vulnerable passwords." },
                  { icon: <Key size={10} />,     label: "Device trust" },
                ].map(b => (
                  <div key={b.label} className="security-badge" title={b.tooltip}>
                    <span style={{ color: "var(--accent-primary)" }}>{b.icon}</span>
                    {b.label}
                    {b.tooltip && <Info size={8} style={{ marginLeft: 4, opacity: 0.5 }} />}
                  </div>
                ))}
              </div>
            </form>
            )
          )}

          {view === "WAITING" && (
            <div className="status-card">
              <div className="status-spinner-wrap">
                <svg className="status-spinner-svg" viewBox="0 0 56 56">
                  <circle cx="28" cy="28" r="24" fill="none" stroke="var(--accent-primary)"
                    strokeWidth="1" strokeDasharray="12 6" opacity="0.5" />
                  <circle cx="28" cy="4" r="3" fill="var(--accent-primary)" />
                </svg>
                <div className="status-spinner-icon">
                  {orgContext ? (
                    <div className="avatar-preview">{orgContext.initials}</div>
                  ) : (
                    <User size={20} color="var(--accent-primary)" strokeWidth={1.5} />
                  )}
                </div>
              </div>
              <div className="status-card-title">Access request sent</div>
              <div className="status-card-desc">
                Share this access code with your workspace admin. Trustline will keep checking for approval automatically.
              </div>
              
              {orgContext && (
                <div style={{ marginTop: 12 }}>
                  <a 
                    href={`mailto:admin@${orgContext.domain}?subject=Trustline Access Request: ${accessCode}`} 
                    className="contact-admin-link"
                  >
                    <ExternalLink size={10} /> Contact organization administrator
                  </a>
                </div>
              )}
              <div className="access-code-card">
                <div className="access-code-label">Access code</div>
                <div className="access-code-value">{accessCode || "WAIT-ROOM"}</div>
                <div className="access-code-hint">{email}</div>
              </div>
              <div className="boot-bar-wrap">
                <div className="boot-bar-label">
                  <span>{isCheckingApproval ? "Checking approval status" : "Awaiting approval"}</span>
                  <span style={{ color: "var(--accent-primary)", animation: "blink 1s infinite" }}>
                    {isCheckingApproval ? "SYNC" : "●●●"}
                  </span>
                </div>
                <div className="boot-bar-track"><div className="boot-bar-fill" style={{ width: "60%", animation: "none" }} /></div>
              </div>
              <button id="refresh-status-btn" className="btn btn-primary btn-full" onClick={onCheckApproval}>
                <RefreshCw size={14} /> Check approval
              </button>
              
              <div className="recovery-hint">
                Lost your passkey? Contact your organization administrator to reset your account access.
              </div>

              <button id="back-btn" className="btn btn-ghost btn-full" onClick={onCancelRequest} style={{ marginTop: 12 }}>
                Cancel & Start Over
              </button>
            </div>
          )}

          {view === "REGISTER" && (
            <div className="status-card">
              <div style={{ margin: "0 auto 20px", color: "var(--accent-success)", display: "flex", justifyContent: "center" }}>
                <CheckCircle size={40} strokeWidth={1.5} style={{ filter: "drop-shadow(0 0 10px var(--accent-success))" }} />
              </div>
              <div className="status-card-title" style={{ color: "var(--accent-success)" }}>Access approved</div>
              <div className="status-card-desc">
                Finish setup to register this device and create your encrypted workspace.
              </div>
              <div className="boot-bar-wrap">
                <div className="boot-bar-label">
                  <span>Device setup</span>
                  <span style={{ color: "var(--accent-teal)" }}>Ready</span>
                </div>
                <div className="boot-bar-track"><div className="boot-bar-fill" /></div>
              </div>
              <button id="init-vault-btn" className="btn btn-primary btn-full" onClick={onRegister}>
                <Lock size={14} /> Finish setup
              </button>
              
              <div className="recovery-hint">
                Registration requires a hardware security module (TPM/Secure Enclave) or a FIDO2 security key.
              </div>
            </div>
          )}

          {view === "LOADING" && (
            <div className="status-card">
              <div className="setup-loading-spinner">
                <svg viewBox="0 0 56 56" width="56" height="56">
                  <circle cx="28" cy="28" r="24" fill="none" stroke="var(--accent-primary)"
                    strokeWidth="1.5" strokeDasharray="16 8" opacity="0.4"
                    style={{ animation: "rotate-slow 3s linear infinite" }} />
                  <circle cx="28" cy="28" r="16" fill="none" stroke="var(--accent-teal)"
                    strokeWidth="1" strokeDasharray="10 6" opacity="0.5"
                    style={{ animation: "rotate-slow 2s linear infinite reverse" }} />
                </svg>
                <div className="setup-loading-icon">
                  <Lock size={18} color="var(--accent-primary)" strokeWidth={1.5} />
                </div>
              </div>
              <div className="status-card-title">Setting up your workspace</div>
              <div className="status-card-desc">
                {loadingStep || "Generating encryption keys and registering your device…"}
              </div>
              <div className="boot-bar-wrap">
                <div className="boot-bar-label">
                  <span>Initializing</span>
                  <span style={{ color: "var(--accent-primary)", animation: "blink 1s infinite" }}>SYNC</span>
                </div>
                <div className="boot-bar-track"><div className="boot-bar-fill" style={{ animation: "boot-expand 3s ease-out forwards" }} /></div>
              </div>

              <div className="interruption-warning">
                <AlertCircle size={12} />
                DO NOT CLOSE APP OR TURN OFF DEVICE
              </div>
            </div>
          )}
        </div>

        <div className="onboarding-legal">
          By continuing, you agree to our <a href="#">Terms</a> and <a href="#">Privacy Policy</a>
          <ExternalLink size={8} style={{ marginLeft: 4, verticalAlign: 'middle' }} />
        </div>
      </div>

      <div className="onboarding-footer">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="status-dot active" />
          <span>Secure messaging, trusted devices, and protected team access.</span>
        </div>
        <div className="app-version">v{__APP_VERSION__}</div>
      </div>
    </div>
  );
}

export default OnboardingScreen;
