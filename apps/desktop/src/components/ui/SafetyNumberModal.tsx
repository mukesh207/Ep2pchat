import { useState } from "react";
import { Fingerprint, ShieldCheck, Copy, Check, X } from "lucide-react";
import { motion } from "framer-motion";

interface SafetyNumberModalProps {
  myIdentityKey: string;        // base64-encoded identity public key
  theirIdentityKey: string;     // base64-encoded identity public key
  contactName: string;
  onClose: () => void;
}

/**
 * Derive a 12-block Safety Number from two identity keys.
 * Uses the Signal-style approach: SHA-256(sorted(key_a, key_b)) → split into 12 × 5-digit blocks.
 */
async function deriveSafetyNumber(keyA: string, keyB: string): Promise<string[]> {
  const sorted = [keyA, keyB].sort();
  const combined = sorted.join("|");
  const encoder = new TextEncoder();
  const data = encoder.encode(combined);

  const hash1 = await crypto.subtle.digest("SHA-256", data);
  const hash2 = await crypto.subtle.digest("SHA-256", hash1);

  const bytes = new Uint8Array(hash2);
  const blocks: string[] = [];

  for (let i = 0; i < 12; i++) {
    const offset = (i * 2) % bytes.length;
    const value = (bytes[offset] << 8 | bytes[(offset + 1) % bytes.length]) % 100000;
    blocks.push(value.toString().padStart(5, "0"));
  }
  return blocks;
}

export default function SafetyNumberModal({
  myIdentityKey,
  theirIdentityKey,
  contactName,
  onClose,
}: SafetyNumberModalProps) {
  const [blocks, setBlocks] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);

  if (!blocks) {
    deriveSafetyNumber(myIdentityKey, theirIdentityKey).then(setBlocks);
  }

  const handleCopy = async () => {
    if (!blocks) return;
    const text = blocks.join(" ");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-overlay-tactical" onClick={onClose}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="modal-content-tactical max-w-[480px]" 
        onClick={e => e.stopPropagation()}
      >
        <header className="h-14 border-b border-border-tactical flex items-center justify-between px-6 bg-background-secondary/80 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <Fingerprint size={18} className="text-accent-purple" />
            <span className="text-[13px] font-semibold text-text-primary">Safety Verification</span>
          </div>
          <button className="h-8 w-8 rounded-lg flex items-center justify-center text-text-muted hover:text-accent-red transition-all" onClick={onClose}><X size={20} /></button>
        </header>

        <div className="p-8 space-y-8">
          <p className="text-[14px] text-text-secondary leading-relaxed font-medium">
            Compare this safety number with <strong className="text-accent-purple">{contactName}</strong> using
             an external trusted channel. If the numbers match exactly, your communication tunnel
             is end-to-end encrypted and tamper-proof.
          </p>

          <div className="bg-background-primary/40 border border-border-tactical rounded-2xl p-6 shadow-inner">
            {blocks ? (
              <div className="grid grid-cols-3 gap-y-4 gap-x-2">
                {blocks.map((block, i) => (
                  <div key={i} className="text-center font-mono text-[17px] font-bold text-text-primary tracking-widest bg-background-secondary/50 py-2 rounded-lg border border-white/5 shadow-sm">
                    {block}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-[12px] font-medium text-text-muted uppercase tracking-widest opacity-40">
                Computing entropy...
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-2 text-[11px] font-semibold text-accent-green uppercase tracking-wider bg-accent-green/5 py-2 rounded-xl border border-accent-green/10">
            <ShieldCheck size={14} />
            Mutual Identity Confirmation Required
          </div>
        </div>

        <footer className="p-6 border-t border-border-tactical bg-background-secondary/80 flex gap-3">
          <button 
            className="btn-tactical btn-tactical-secondary flex-1 font-semibold" 
            onClick={handleCopy} 
            disabled={!blocks}
          >
            {copied ? <Check size={16} className="text-accent-green" /> : <Copy size={16} />}
            {copied ? "Copied" : "Copy for comparison"}
          </button>
          <button className="btn-tactical btn-tactical-primary flex-1 font-semibold shadow-md" onClick={onClose}>
            Mark as Verified
          </button>
        </footer>
      </motion.div>
    </div>
  );
}
