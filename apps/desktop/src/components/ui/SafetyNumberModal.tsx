import { useState } from "react";
import { Fingerprint, ShieldCheck, Copy, Check } from "lucide-react";

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
  // Sort keys so both parties compute the same number regardless of order
  const sorted = [keyA, keyB].sort();
  const combined = sorted.join("|");

  const encoder = new TextEncoder();
  const data = encoder.encode(combined);

  // Double hash for extra security (Signal protocol style)
  const hash1 = await crypto.subtle.digest("SHA-256", data);
  const hash2 = await crypto.subtle.digest("SHA-256", hash1);

  const bytes = new Uint8Array(hash2);
  const blocks: string[] = [];

  // Generate 12 blocks of 5 digits each from the hash bytes
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

  // Compute on first render
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
    <>
      <div className="safety-number-backdrop" onClick={onClose} />
      <div className="safety-number-modal" role="dialog" aria-modal="true">
        <div className="safety-number-header">
          <Fingerprint size={18} />
          <span className="safety-number-title">Safety Number Verification</span>
        </div>

        <div className="safety-number-body">
          <p className="safety-number-explanation">
            Compare this safety number with <strong style={{ color: "var(--accent-primary)" }}>{contactName}</strong> using
            a trusted channel (in person, phone call, or video). If the numbers match, your conversation
            is end-to-end encrypted and no one is intercepting your messages.
          </p>

          {blocks ? (
            <div className="safety-number-grid" id="safety-number-display">
              {blocks.map((block, i) => (
                <span key={i}>{block}</span>
              ))}
            </div>
          ) : (
            <div className="safety-number-grid" style={{ color: "var(--text-muted)" }}>
              Computing...
            </div>
          )}

          <p className="safety-number-match-label">
            <ShieldCheck size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />
            Both parties should see the same number
          </p>
        </div>

        <div className="safety-number-actions">
          <button className="btn btn-ghost btn-sm" onClick={handleCopy} disabled={!blocks}>
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy Number"}
          </button>
          <button className="btn btn-teal btn-sm" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </>
  );
}
