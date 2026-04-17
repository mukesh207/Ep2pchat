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
  document.getElementById("root")!.innerHTML = `<div style="padding:80px;color:white;text-align:center;font-family:sans-serif;"><h2>Confirming Secure Hardware Passkey...</h2><p style="color:#888;">Please touch your fingerprint reader or security key when prompted by your browser.</p></div>`;
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
            document.getElementById("root")!.innerHTML = `<div style="padding:80px;color:#00ffaa;text-align:center;font-family:sans-serif;"><h2>Passkey Securely Transferred!</h2><p>You can close this tab and return to the Trustline app.</p></div>`;
          })
          .catch(e => {
            document.getElementById("root")!.innerHTML = `<div style="padding:80px;color:#ff5555;text-align:center;font-family:sans-serif;"><h2>Passkey Canceled / Failed</h2><p>${e.message}</p></div>`;
            fetch(`http://127.0.0.1:${port}`, { method: "POST", body: JSON.stringify({ error: e.message }) });
          });
      } catch (e: any) {
        document.getElementById("root")!.innerHTML = `Error: ${e.message}`;
      }
    });
  }
} else {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  );
}
