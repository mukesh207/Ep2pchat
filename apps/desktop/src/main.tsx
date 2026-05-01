import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";

const params = new URLSearchParams(window.location.search);
if (params.get("bridge") === "true") {
  const port = params.get("port");
  const c = params.get("c");
  const mode = params.get("mode");

  const root = document.getElementById("root")!;
  root.innerHTML = `
    <div class="onboarding-bg">
      <div class="onboarding-glow"></div>
      <div class="onboarding-card">
        <div class="bracket-tl"></div><div class="bracket-tr"></div>
        <div class="bracket-bl"></div><div class="bracket-br"></div>

        <div class="onboarding-logo" style="margin-bottom: 40px">
          <div class="onboarding-logo-text">TRUSTLINE</div>
          <div class="onboarding-logo-sub">Security Bridge</div>
        </div>

        <div id="bridge-status" class="status-card">
          <div class="status-spinner-wrap">
            <svg class="status-spinner-svg" viewBox="0 0 56 56">
              <circle cx="28" cy="28" r="24" fill="none" stroke="var(--accent-primary)"
                strokeWidth="1" strokeDasharray="12 6" opacity="0.5" />
              <circle cx="28" cy="4" r="3" fill="var(--accent-primary)" />
            </svg>
            <div class="status-spinner-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </div>
          </div>
          <div class="status-card-title">Confirming Hardware Passkey</div>
          <div class="status-card-desc">
            Please touch your fingerprint reader or security key when prompted by your browser to secure your session.
          </div>
        </div>
      </div>
      <div class="onboarding-footer" style="justify-content: center">
        Hardware-anchored authentication in progress...
      </div>
    </div>
  `;

  if (port && c) {
    import('@simplewebauthn/browser').then(({ startRegistration, startAuthentication }) => {
      try {
        const beginData = JSON.parse(atob(c));
        const authPromise = mode === "login"
          ? startAuthentication({ optionsJSON: beginData })
          : startRegistration({ optionsJSON: beginData });

        authPromise
          .then(async cred => {
            await fetch(`http://127.0.0.1:${port}`, { method: "POST", body: JSON.stringify(cred) });
            document.getElementById("bridge-status")!.innerHTML = `
              <div style="margin: 0 auto 20px; color: var(--accent-success); display: flex; justify-content: center;">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="filter: drop-shadow(0 0 10px var(--accent-success))">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              <div class="status-card-title" style="color: var(--accent-success)">Passkey Securely Transferred</div>
              <div class="status-card-desc">Your session is now cryptographically bound. You can close this tab and return to the Trustline app.</div>
            `;
          })
          .catch(e => {
            document.getElementById("bridge-status")!.innerHTML = `
              <div style="margin: 0 auto 20px; color: var(--accent-danger); display: flex; justify-content: center;">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="15" y1="9" x2="9" y2="15"></line>
                  <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
              </div>
              <div class="status-card-title" style="color: var(--accent-danger)">Authentication Canceled</div>
              <div class="status-card-desc">${e.message}</div>
              <button class="btn btn-ghost btn-full" style="margin-top: 20px" onclick="window.close()">Close Tab</button>
            `;
            fetch(`http://127.0.0.1:${port}`, { method: "POST", body: JSON.stringify({ error: e.message }) });
          });
      } catch (e: any) {
        document.getElementById("root")!.innerHTML = `Error: ${e.message}`;
      }
    });
  }
} else {  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  );
}
