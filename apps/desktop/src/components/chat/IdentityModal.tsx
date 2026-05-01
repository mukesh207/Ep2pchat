import { useEffect, useState } from "react";
import { Shield, X, Copy, Check, Info } from "lucide-react";
import type { Contact, LocalKeys } from "../../types";

interface IdentityModalProps {
  contact: Contact;
  localKeys: LocalKeys;
  onClose: () => void;
}

export default function IdentityModal({ contact, localKeys, onClose }: IdentityModalProps) {
  const [fingerprint, setFingerprint] = useState<string>("Calculating...");
  const [copied, setCopied] = useState(false);

  const calculateFingerprint = async () => {
    // A simplified safety number/fingerprint: 
    // sort both identity keys and hash them together.
    const keys = [
      localKeys.identity_public,
      contact.devices?.[0]?.identity_key || ""
    ].sort();
    
    if (!keys[1]) {
      setFingerprint("RECIPIENT_KEYS_MISSING");
      return;
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(keys.join("|"));
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    
    // Convert to readable blocks of 5 digits (Signal style) or hex
    const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    const blocks = hex.match(/.{1,4}/g)?.join(' ') || hex;
    setFingerprint(blocks.substring(0, 44)); // reasonable length
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Shield size={18} color="var(--accent-teal)" />
            <span className="modal-title">Identity Verification</span>
          </div>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose}><X size={14} /></button>
        </div>

        <div className="modal-body" style={{ padding: '24px 0' }}>
          <div style={{ marginBottom: 24, textAlign: 'center' }}>
            <div className="avatar" style={{ margin: '0 auto 12px', width: 48, height: 48, fontSize: '1.2rem' }}>
              {(contact.username || contact.email).charAt(0).toUpperCase()}
            </div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{contact.username || contact.email}</h3>
            <p className="text-muted" style={{ fontSize: '0.75rem' }}>{contact.id}</p>
          </div>

          <div style={{ background: 'var(--surface-1)', padding: 16, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
            <label className="label" style={{ fontSize: '0.65rem', marginBottom: 8, display: 'block', opacity: 0.7 }}>
              VERIFICATION FINGERPRINT
            </label>
            <div style={{ 
              fontFamily: 'var(--font-mono)', 
              fontSize: '0.9rem', 
              letterSpacing: '0.05em', 
              color: 'var(--accent-primary)',
              wordBreak: 'break-all',
              textAlign: 'center',
              padding: '8px 0'
            }}>
              {fingerprint}
            </div>
            <button 
              className="btn btn-ghost btn-sm" 
              style={{ width: '100%', justifyContent: 'center', marginTop: 12, fontSize: '0.7rem' }}
              onClick={handleCopy}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? "Copied Fingerprint" : "Copy for comparison"}
            </button>
          </div>

          <div style={{ marginTop: 24, display: 'flex', gap: 12, alignItems: 'flex-start', padding: 12, background: 'rgba(110, 86, 207, 0.05)', borderRadius: 'var(--radius-sm)' }}>
            <Info size={16} color="var(--accent-primary)" style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              To verify the security of this end-to-end encrypted connection, compare the fingerprint above with the one on <strong>{contact.username || contact.email}</strong>'s device. 
              If the codes match, no one can intercept your conversation.
            </p>
          </div>
        </div>

        <div className="modal-footer" style={{ borderTop: '1px solid var(--border)', paddingTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary btn-sm" onClick={onClose}>
            Mark as Verified
          </button>
        </div>
      </div>
    </div>
  );
}
