import { Shield, Lock, Key, User, RefreshCw, CheckCircle, AlertCircle, AlertTriangle, Terminal, ArrowRight, Fingerprint, Cpu, Activity } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useMemo } from "react";
import Layout from "../../layouts/Layout";

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

  const timestamp = useMemo(() => new Date().getTime(), []);

  return (
    <Layout securityStatus={isMaintenance ? 'alert' : 'protected'}>
      <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 min-h-screen relative overflow-hidden bg-background-primary" onKeyDown={onKeyDown}>
        
        {/* Terminal Header */}
        <div className="absolute top-0 left-0 w-full h-8 border-b border-border-tactical flex items-center justify-between px-4 bg-background-secondary/50 select-none">
           <div className="flex items-center gap-4">
              <span className="text-[10px] font-black tracking-widest text-accent-cyan flex items-center gap-2">
                 <Terminal size={12} /> TRUSTLINE_OS_v4.0
              </span>
              <div className="h-3 w-[1px] bg-border-tactical" />
              <span className="text-[9px] font-mono text-text-muted">ID: {timestamp}</span>
           </div>
           <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                 <div className={`h-1.5 w-1.5 rounded-full ${isOffline ? 'bg-accent-red' : 'bg-accent-green'} animate-pulse`} />
                 <span className="text-[9px] font-bold text-text-muted uppercase tracking-tighter">{isOffline ? 'GATEWAY_DISCONNECTED' : 'SYSTEM_READY'}</span>
              </div>
           </div>
        </div>

        <div className="w-full max-w-[420px] flex flex-col items-center z-10">
          {/* Main Access Panel */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full border-2 border-border-tactical bg-background-secondary shadow-2xl relative"
          >
            {/* Corner Brackets (Visual Polish) */}
            <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-accent-cyan" />
            <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-accent-cyan" />
            <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-accent-cyan" />
            <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-accent-cyan" />

            <div className="p-1 border-b border-border-tactical bg-background-accent/30 flex items-center justify-between px-6 py-2">
               <span className="text-[10px] font-black text-text-primary uppercase tracking-[0.2em]">Sovereign_Identity_Gateway</span>
               <Shield size={12} className="text-accent-cyan" />
            </div>

            <div className="p-8">
              <AnimatePresence mode="wait">
                {view === "HOME" && (
                  <motion.div 
                    key="home"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="space-y-6"
                  >
                    {isMaintenance ? (
                      <div className="text-center space-y-6 py-4">
                        <div className="h-12 w-12 border border-accent-amber/20 bg-accent-amber/5 flex items-center justify-center mx-auto rounded-sm">
                          <AlertTriangle size={24} className="text-accent-amber animate-pulse" />
                        </div>
                        <div className="space-y-1">
                          <h2 className="text-sm font-black text-text-primary uppercase tracking-widest">Maintenance Protocol Active</h2>
                          <p className="text-[11px] font-mono text-text-muted leading-relaxed">
                             [REASON]: SYNC_SEQUENCE_INITIALIZED<br/>
                             [STATUS]: OFFLINE
                          </p>
                        </div>
                        <button className="btn-tactical btn-tactical-secondary w-full py-3" onClick={() => window.location.reload()}>
                          RETRY_HANDSHAKE
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={onSubmit} className="space-y-6">
                        {isBootstrapMode && (
                          <div className="bg-accent-purple/5 border border-accent-purple/20 px-3 py-1.5 flex items-center gap-3">
                             <Terminal size={12} className="text-accent-purple" />
                             <span className="text-[9px] font-black text-accent-purple uppercase tracking-widest">Bootstrap_Mode_Enabled</span>
                          </div>
                        )}

                        <div className="space-y-0.5">
                          <h2 className="text-lg font-black text-text-primary uppercase tracking-tight">
                            {orgContext ? `JOINING_${orgContext.name.toUpperCase()}` : "IDENTITY_LOGIN"}
                          </h2>
                          <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest opacity-60">Authentication required for enclave access.</p>
                        </div>

                        {savedAccounts.length > 0 && !email && (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                               <div className="text-[9px] font-black text-text-muted uppercase tracking-[0.2em]">Authorized_Profiles</div>
                               <div className="h-px flex-1 bg-border-tactical" />
                            </div>
                            <div className="space-y-1.5">
                              {savedAccounts.map((acc) => (
                                <button 
                                  key={acc} 
                                  type="button" 
                                  className="w-full px-4 py-3 border border-border-tactical bg-background-primary/40 hover:bg-background-accent hover:border-accent-cyan/30 transition-all flex items-center gap-3 group/acc"
                                  onClick={() => onAccountSelect(acc)}
                                >
                                  <div className="h-6 w-6 border border-border-tactical flex items-center justify-center text-[10px] font-black text-text-muted group-hover/acc:text-accent-cyan transition-colors">
                                    {acc[0].toUpperCase()}
                                  </div>
                                  <div className="text-[11px] font-mono text-text-secondary group-hover/acc:text-text-primary transition-colors truncate flex-1 text-left">{acc}</div>
                                  <ArrowRight size={12} className="text-text-muted opacity-0 group-hover/acc:opacity-100 transition-all" />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="space-y-2">
                           <div className="flex justify-between items-end">
                              <label className="telemetry-label">Principal Email</label>
                              {isCapsLock && (
                                <span className="text-[8px] font-black text-accent-amber uppercase flex items-center gap-1">
                                  <AlertCircle size={10} /> CAPS_LOCK_ON
                                </span>
                              )}
                           </div>
                           <input
                            id="email-input"
                            className="input-tactical"
                            type="email"
                            value={email}
                            onChange={e => onEmailChange(e.target.value)}
                            placeholder="OPERATOR_EMAIL@DOMAIN.COM"
                            required autoComplete="off"
                            disabled={isOffline}
                          />
                        </div>

                        <button 
                          id="enter-btn" 
                          type="submit" 
                          className="btn-tactical btn-tactical-primary w-full py-3.5 group/btn shadow-[0_0_15px_rgba(6,182,212,0.1)]" 
                          disabled={isOffline}
                        >
                          INITIALIZE_HANDSHAKE <ArrowRight size={14} className="ml-2 group-hover/btn:translate-x-1 transition-transform" />
                        </button>

                        {email && savedAccounts.length > 0 && (
                          <button 
                            type="button" 
                            className="w-full text-[9px] font-black text-text-muted hover:text-text-primary uppercase tracking-[0.2em] transition-colors"
                            onClick={() => onEmailChange("")}
                          >
                            SELECT_DIFFERENT_PROFILE
                          </button>
                        )}

                        {/* Security Indicators Grid */}
                        <div className="grid grid-cols-2 gap-2 pt-4 border-t border-border-tactical">
                          {[
                            { icon: <Lock size={12} />,    label: "E2EE_ACTIVE" },
                            { icon: <Fingerprint size={12} />,  label: "FIDO2_SECURE" },
                            { icon: <Cpu size={12} />,     label: "TPM_ANCHORED" },
                            { icon: <Activity size={12} />,  label: "REALTIME_MON" },
                          ].map(b => (
                            <div key={b.label} className="flex items-center gap-2 text-[9px] font-black text-text-muted uppercase tracking-tighter">
                              <span className="text-accent-cyan opacity-40">{b.icon}</span>
                              {b.label}
                            </div>
                          ))}
                        </div>
                      </form>
                    )}
                  </motion.div>
                )}

                {view === "WAITING" && (
                  <motion.div 
                    key="waiting"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-center space-y-8"
                  >
                    <div className="relative h-16 w-16 mx-auto">
                       <div className="absolute inset-0 border border-accent-cyan/20 animate-pulse" />
                       <div className="h-full w-full bg-background-primary border border-border-tactical flex items-center justify-center shadow-inner">
                          {orgContext ? (
                             <span className="text-2xl font-black text-accent-cyan">{orgContext.initials}</span>
                          ) : (
                             <User size={24} className="text-accent-cyan" />
                          )}
                       </div>
                    </div>

                    <div className="space-y-1">
                       <h2 className="status-card-title text-sm font-black text-text-primary uppercase tracking-widest">Access request sent</h2>
                       <p className="text-[10px] font-mono text-text-muted leading-relaxed uppercase">
                          Awaiting organizational authorization for current node ID.
                       </p>
                    </div>

                    <div className="p-4 border border-border-tactical bg-background-primary/50 space-y-2">
                       <div className="text-[9px] font-black text-text-muted uppercase tracking-[0.2em]">Verification_Key</div>
                       <div className="access-code-value text-3xl font-black text-accent-cyan tracking-[0.3em] font-mono">{accessCode || "XXXX-XXXX"}</div>
                       <div className="text-[8px] font-mono text-text-muted opacity-40 truncate">{email}</div>
                    </div>

                    <div className="space-y-2">
                       <div className="flex justify-between text-[8px] font-black text-text-muted uppercase tracking-[0.3em]">
                          <span className={isCheckingApproval ? "text-accent-cyan animate-pulse" : ""}>{isCheckingApproval ? "SCANNING_STATUS..." : "STATUS:IDLE"}</span>
                          <span className="opacity-40">ENCLAVE_V4_RLS</span>
                       </div>
                       <div className="h-1 w-full bg-background-primary border border-border-tactical overflow-hidden">
                          <motion.div 
                            className="h-full bg-accent-cyan shadow-[0_0_8px_rgba(6,182,212,0.8)]" 
                            animate={{ x: isCheckingApproval ? ["-100%", "100%"] : "0%" }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                            style={{ width: isCheckingApproval ? "40%" : "0%" }}
                          />
                       </div>
                    </div>

                    <div className="flex flex-col gap-2">
                       <button className="btn-tactical btn-tactical-primary w-full py-3" onClick={onCheckApproval}>
                          <RefreshCw size={14} className={isCheckingApproval ? "animate-spin mr-2" : "mr-2"} /> REFRESH_STATUS
                       </button>
                       <button className="w-full py-2 text-[9px] font-black text-text-muted hover:text-text-primary uppercase tracking-[0.2em] transition-colors" onClick={onCancelRequest}>
                          CANCEL_REQUEST
                       </button>
                    </div>
                  </motion.div>
                )}

                {view === "REGISTER" && (
                  <motion.div 
                    key="register"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center space-y-8"
                  >
                     <div className="h-16 w-16 border border-accent-green/30 bg-accent-green/5 flex items-center justify-center mx-auto">
                        <CheckCircle size={32} className="text-accent-green animate-pulse" />
                     </div>

                     <div className="space-y-1">
                        <h2 className="text-sm font-black text-text-primary uppercase tracking-widest">Identity_Verified</h2>
                        <p className="text-[10px] font-mono text-text-muted leading-relaxed uppercase">
                           Connection authorized. Generate local cryptographic anchor to complete registration.
                        </p>
                     </div>

                     <div className="space-y-2">
                        <button className="btn-tactical btn-tactical-primary bg-accent-green text-background-primary w-full py-3.5" onClick={onRegister}>
                           <Lock size={14} className="mr-2" /> ANCHOR_SECURE_VAULT
                        </button>
                        <button className="w-full py-2 text-[9px] font-black text-text-muted hover:text-text-primary uppercase tracking-[0.2em] transition-colors" onClick={onCancelRequest}>
                           TERMINATE_SESSION
                        </button>
                     </div>

                     <div className="p-4 border border-border-tactical bg-background-primary/40 text-left space-y-2">
                        <div className="flex items-center gap-2 text-accent-cyan">
                           <Key size={12} />
                           <span className="text-[9px] font-black uppercase tracking-widest">Enclave_Provisioning</span>
                        </div>
                        <p className="text-[10px] font-mono text-text-muted leading-relaxed opacity-80">
                           A hardware-linked Ed25519 keypair will be generated locally. Private keys remain in the secure enclave.
                        </p>
                     </div>
                  </motion.div>
                )}

                {view === "LOADING" && (
                  <motion.div 
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center space-y-8 py-4"
                  >
                     <div className="relative h-20 w-20 mx-auto flex items-center justify-center">
                        <svg className="absolute inset-0 transform -rotate-90" viewBox="0 0 100 100">
                           <circle cx="50" cy="50" r="48" fill="none" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="1" />
                           <motion.circle 
                            cx="50" cy="50" r="48" 
                            fill="none" 
                            stroke="var(--color-accent-cyan)" 
                            strokeWidth="2" 
                            strokeDasharray="301"
                            animate={{ strokeDashoffset: [301, 0] }}
                            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                           />
                        </svg>
                        <Lock size={24} className="text-accent-cyan animate-pulse" />
                     </div>

                     <div className="space-y-4">
                        <h2 className="text-xs font-black text-text-primary uppercase tracking-[0.3em]">Processing_Payload</h2>
                        <div className="p-3 border border-border-tactical bg-background-primary font-mono">
                           <p className="text-[10px] text-accent-cyan uppercase tracking-widest font-bold">
                              {loadingStep || "INITIALIZING_ENCLAVE..."}
                           </p>
                        </div>
                     </div>

                     <div className="pt-4 border-t border-border-tactical text-left flex gap-3">
                        <Activity size={14} className="text-accent-cyan shrink-0" />
                        <span className="text-[9px] font-mono text-text-muted uppercase leading-snug">Handshake in progress. Secure identity anchors being verified. Do not interrupt transmission.</span>
                     </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Legal / Metadata Footer */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-8 w-full space-y-4"
          >
             <div className="flex items-center justify-between text-[9px] font-black text-text-muted uppercase tracking-[0.2em] px-1">
                <span>Enclave_v4.0.2</span>
                <span className="text-accent-green">Integrity_Verified</span>
             </div>
             
             <div className="text-[10px] font-mono text-text-muted opacity-40 text-center px-4 leading-relaxed">
                BY_CONTINUING, OPERATOR_AGREES_TO_THE<br/>
                <a href="#" className="text-text-primary hover:text-accent-cyan transition-colors underline decoration-border-tactical underline-offset-4 mx-1">TERMS_OF_SERVICE</a> 
                AND 
                <a href="#" className="text-text-primary hover:text-accent-cyan transition-colors underline decoration-border-tactical underline-offset-4 mx-1">PRIVACY_POLICY</a>.
             </div>
          </motion.div>
        </div>
      </div>
    </Layout>
  );
}

export default OnboardingScreen;
