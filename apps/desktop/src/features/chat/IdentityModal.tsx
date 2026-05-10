import { useEffect, useState } from "react";
import { Shield, X, Copy, Check, Terminal } from "lucide-react";
import { motion } from "framer-motion";
import type { Contact, LocalKeys } from "../../types";

interface IdentityModalProps {
  contact: Contact;
  localKeys: LocalKeys;
  onClose: () => void;
}

export default function IdentityModal({ contact, localKeys, onClose }: IdentityModalProps) {
  const [fingerprint, setFingerprint] = useState<string>("CALCULATING_ANCHOR...");
  const [copied, setCopied] = useState(false);

  const calculateFingerprint = async () => {
    const keys = [
      localKeys.identity_public,
      contact.devices?.[0]?.identity_key || ""
    ].sort();
    
    if (!keys[1]) {
      setFingerprint("RECIPIENT_KEYS_UNAVAILABLE");
      return;
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(keys.join("|"));
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    
    const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    const blocks = hex.match(/.{1,4}/g)?.join(' ') || hex;
    setFingerprint(blocks.substring(0, 44)); 
  };

  useEffect(() => {
    void calculateFingerprint();
  }, [contact, localKeys]);

  const handleCopy = () => {
    void navigator.clipboard.writeText(fingerprint);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-overlay-tactical" onClick={onClose}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="modal-content-tactical max-w-[480px] border-2 border-border-tactical shadow-[0_0_50px_rgba(0,0,0,0.6)]" 
        onClick={e => e.stopPropagation()}
      >
        <header className="h-10 border-b border-border-tactical flex items-center justify-between px-4 bg-background-accent/50">
          <div className="flex items-center gap-3">
            <Shield size={14} className="text-accent-cyan" />
            <span className="text-[10px] font-black text-text-primary uppercase tracking-[0.2em]">Identity_Verification_Protocol</span>
          </div>
          <button className="p-1 text-text-muted hover:text-accent-red transition-all" onClick={onClose}><X size={16} /></button>
        </header>

        <div className="p-6 space-y-6">
          <div className="flex items-center gap-4 p-4 border border-border-tactical bg-background-primary/40 relative overflow-hidden group">
             <div className="absolute top-0 right-0 p-1 px-1.5 text-[7px] font-black text-accent-cyan bg-accent-cyan/10 border-l border-b border-border-tactical uppercase">Node_Metadata</div>
             <div className="h-12 w-12 border border-border-tactical bg-background-secondary flex items-center justify-center text-xl font-black text-accent-cyan shadow-inner shrink-0">
                {(contact.username || contact.email).charAt(0).toUpperCase()}
             </div>
             <div className="min-w-0">
                <h3 className="text-[13px] font-black text-text-primary uppercase tracking-tight truncate">{contact.username || "ANONYMOUS_NODE"}</h3>
                <div className="flex items-center gap-3 mt-1">
                   <span className="text-[9px] font-mono text-text-muted opacity-40 uppercase truncate">UID: {contact.id.slice(0, 16)}...</span>
                </div>
             </div>
          </div>

          <div className="p-5 bg-background-primary/60 border border-border-tactical space-y-4 shadow-inner relative">
            <div className="flex justify-between items-center px-0.5">
              <label className="telemetry-label text-accent-cyan">Cryptographic_Safety_Fingerprint</label>
              <div className="flex items-center gap-2 px-1.5 py-0.5 bg-accent-green/5 border border-accent-green/20">
                <div className="h-1 w-1 bg-accent-green animate-pulse" />
                <span className="text-[8px] font-black text-accent-green uppercase">Tunnel_Live</span>
              </div>
            </div>
            
            <div className="font-mono text-[11px] text-accent-cyan leading-relaxed break-all text-center tracking-[0.2em] bg-background-secondary/80 p-4 border border-border-tactical shadow-inner select-all">
              {fingerprint}
            </div>

            <button 
              className="btn-tactical btn-tactical-secondary w-full py-2.5 group hover:border-accent-cyan/30"
              onClick={handleCopy}
            >
              {copied ? <Check size={14} className="text-accent-green" /> : <Copy size={14} className="group-hover:text-accent-cyan" />}
              <span className={copied ? "text-accent-green" : ""}>{copied ? "TRANSMISSION_COPIED" : "COPY_FOR_MANUAL_VERIFICATION"}</span>
            </button>
          </div>

          <div className="flex gap-4 p-4 bg-background-accent/30 border border-border-tactical rounded-sm">
            <Terminal size={20} className="text-accent-cyan shrink-0 opacity-40" />
            <p className="text-[10px] font-mono text-text-muted leading-relaxed uppercase">
              [SYSTEM_NOTICE]: To ensure uncompromised security, cross-reference this hash with the operator at <strong className="text-text-primary">{contact.username || contact.email}</strong>. 
              If the hexadecimal chains align, the end-to-end encrypted link is integrity-confirmed.
            </p>
          </div>
        </div>

        <footer className="p-4 border-t border-border-tactical bg-background-accent/50 flex justify-end gap-2">
          <button className="btn-tactical btn-tactical-secondary px-4" onClick={onClose}>
            Abort
          </button>
          <button className="btn-tactical btn-tactical-primary px-6 shadow-[0_0_15px_rgba(6,182,212,0.1)] border-accent-cyan" onClick={onClose}>
            CONFIRM_VERIFICATION
          </button>
        </footer>
      </motion.div>
    </div>
  );
}
