import { Shield, Lock, Zap, Key, User, RefreshCw, CheckCircle } from "lucide-react";
import { ShaderAnimation } from "../ui/shader-lines";

type OnboardingProps = {
  view: "HOME" | "WAITING" | "REGISTER" | "LOADING";
  email: string;
  accessCode: string;
  isCheckingApproval: boolean;
  onEmailChange: (e: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onRegister: () => void;
  onBack: () => void;
  onCheckApproval: () => void;
};

function OnboardingScreen({
  view, email, accessCode, isCheckingApproval,
  onEmailChange, onSubmit, onRegister, onBack, onCheckApproval
}: OnboardingProps) {

  return (
    <div className="onboarding-bg">
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
            <form onSubmit={onSubmit}>
              <div className="onboarding-copy">
                <h1>Sign in to your workspace</h1>
                <p>Use your work email to request access or continue with your existing passkey.</p>
              </div>

              <div className="form-group">
                <label className="onboarding-form-label" htmlFor="email-input">
                  Work email
                </label>
                <input
                  id="email-input"
                  className="input"
                  type="email"
                  value={email}
                  onChange={e => onEmailChange(e.target.value)}
                  placeholder="name@company.com"
                  required autoComplete="off"
                />
              </div>

              <button id="enter-btn" type="submit" className="btn btn-primary btn-full">
                <Shield size={14} /> Continue
              </button>

              <div className="security-badges">
                {[
                  { icon: <Lock size={10} />,    label: "End-to-end encryption" },
                  { icon: <Shield size={10} />,  label: "Protected storage" },
                  { icon: <Zap size={10} />,     label: "Passkey sign-in" },
                  { icon: <Key size={10} />,     label: "Device trust" },
                ].map(b => (
                  <div key={b.label} className="security-badge">
                    <span style={{ color: "var(--accent-primary)" }}>{b.icon}</span>
                    {b.label}
                  </div>
                ))}
              </div>
            </form>
          )}

          {view === "WAITING" && (
            <div className="status-card">
              <div className="status-spinner-wrap">
                <svg className="status-spinner-svg" viewBox="0 0 56 56">
                  <circle cx="28" cy="28" r="24" fill="none" stroke="var(--accent-primary)"
                    strokeWidth="1" strokeDasharray="12 6" opacity="0.5" />
                  <circle cx="28" cy="4" r="3" fill="var(--accent-primary)" />
                </svg>
                <div className="status-spinner-icon"><User size={20} color="var(--accent-primary)" strokeWidth={1.5} /></div>
              </div>
              <div className="status-card-title">Access request sent</div>
              <div className="status-card-desc">
                Share this access code with your workspace admin. Trustline will keep checking for approval automatically.
              </div>
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
              <button id="back-btn" className="btn btn-ghost btn-full" onClick={onBack} style={{ marginTop: 20 }}>
                Back
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
                Generating encryption keys and registering your device…
              </div>
              <div className="boot-bar-wrap">
                <div className="boot-bar-label">
                  <span>Initializing</span>
                  <span style={{ color: "var(--accent-primary)", animation: "blink 1s infinite" }}>SYNC</span>
                </div>
                <div className="boot-bar-track"><div className="boot-bar-fill" style={{ animation: "boot-expand 3s ease-out forwards" }} /></div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="onboarding-footer">
        <span className="status-dot active" />
        Secure messaging, trusted devices, and protected team access.
      </div>
    </div>
  );
}

export default OnboardingScreen;
