import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { invoke } from "@tauri-apps/api/core";
import { Contact } from '../../types';
import * as vault from '../../infrastructure/vault';

function getInitials(value: string) {
  return value.trim().charAt(0).toUpperCase();
}

export function StoryViewer({ user, stories, onClose }: { user: Contact, stories: any[], onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [decryptedText, setDecryptedText] = useState("DECRYPTING_TUNNEL...");
  const currentStory = stories[index];

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!currentStory) return;
      const keyInfo = await vault.getStoryKey(user.id);
      if (!keyInfo) {
        if (active) setDecryptedText("ACCESS_RESTRICTED: KEY_UNAVAILABLE");
        return;
      }
      try {
        const pt = await invoke<string>("story_decrypt", {
            ciphertextB64: currentStory.ciphertext_b64,
            keyB64: keyInfo.key,
            nonceB64: keyInfo.nonce,
        });
        if (active) setDecryptedText(pt);
      } catch (err) {
        if (active) setDecryptedText("DATA_CORRUPTION: DECRYPT_FAIL");
      }
    })();
    return () => { active = false; };
  }, [currentStory, user.id]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (index < stories.length - 1) setIndex(index + 1);
      else onClose();
    }, 5000);
    return () => clearTimeout(timer);
  }, [index, stories.length, onClose]);

  return (
    <div className="flex flex-col items-center justify-center h-full w-full max-w-4xl mx-auto text-center px-6 relative">
       <div className="absolute top-10 left-0 right-0 px-10 flex gap-1 w-full max-w-2xl mx-auto">
          {stories.map((_, i) => (
            <div key={i} className={`flex-1 h-0.5 transition-all duration-300 ${i <= index ? 'bg-accent-cyan shadow-[0_0_8px_rgba(6,182,212,0.8)]' : 'bg-white/5'}`} />
          ))}
       </div>
       <div className="absolute top-16 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-background-secondary border border-border-tactical px-4 py-2 rounded-sm">
          <div className="h-8 w-8 bg-background-primary border border-border-tactical flex items-center justify-center text-accent-cyan font-mono font-bold text-sm">
             {getInitials(user.username || user.email)}
          </div>
          <div className="text-left">
             <div className="text-[10px] font-black text-text-primary tracking-widest uppercase">{user.username || user.email}</div>
             <div className="text-[8px] font-mono text-text-muted opacity-60 uppercase tracking-tighter">TIMESTAMP: {new Date(currentStory?.created_at).getTime()}</div>
          </div>
       </div>
       <motion.div 
         key={index}
         initial={{ opacity: 0, y: 10 }}
         animate={{ opacity: 1, y: 0 }}
         className="text-4xl md:text-6xl font-black text-text-primary leading-tight tracking-[0.05em] px-4 md:px-12 uppercase font-mono"
       >
          {decryptedText}
       </motion.div>
       <div className="mt-12">
          <span className="text-[10px] font-mono text-accent-cyan/40 animate-pulse tracking-[0.5em]">[ TRANSMISSION_IN_PROGRESS ]</span>
       </div>
    </div>
  );
}
