import { useState } from 'react';
import { invoke } from "@tauri-apps/api/core";
import * as api from "../../infrastructure/api";
import * as vault from "../../infrastructure/vault";
import { socket } from "../../infrastructure/socket";
import { useAuthStore } from "../../stores/useAuthStore";
import { useChatStore } from "../../stores/useChatStore";
import { useToast } from "../../components/ui/Toast";
import { Contact } from "../../types";

export function useStoryWorkflows() {
  const { addToast } = useToast();
  const { session } = useAuthStore();
  const { contacts, setAllStories } = useChatStore();
  const [isPostingStory, setIsPostingStory] = useState(false);
  const [showStoryCreator, setShowStoryCreator] = useState(false);
  const [storyText, setStoryText] = useState("");

  const refreshStories = async () => {
    try {
      const res = await api.fetchStories();
      setAllStories(res.stories || []);
    } catch {}
  };

  const handlePostStory = async (text: string) => {
    if (!text.trim() || !session) return;
    setIsPostingStory(true);
    try {
        const storyKey = window.crypto.getRandomValues(new Uint8Array(32));
        const storyKeyB64 = btoa(String.fromCharCode(...storyKey));
        
        const [ciphertextB64, nonceB64] = await invoke<[string, string]>("story_encrypt", {
            plaintext: text,
            keyB64: storyKeyB64
        });
        
        await api.uploadStory(ciphertextB64, nonceB64);

        const sharePromises = contacts.map(async (contact: Contact) => {
           const target = contact.devices?.[0];
           if (!target) return;
           
           const sessionJson = await vault.getRatchetSession(contact.id);
           if (!sessionJson) return;

           const { header, ciphertext } = await invoke<any>("ratchet_encrypt", {
               sessionJson,
               plaintext: JSON.stringify({ type: "STORY_KEY", key: storyKeyB64, nonce: nonceB64 }),
               associatedData: contact.id
           });
           
           socket.send("STORY_KEY_SHARE", {
               recipient_device_id: target.device_id,
               ciphertext,
               header
           });
        });

        await Promise.all(sharePromises);
        
        addToast("Story posted successfully!", "success");
        setShowStoryCreator(false);
        setStoryText("");
        void refreshStories();
    } catch (err: any) {
        addToast("Failed to post story: " + err.message, "error");
    } finally {
        setIsPostingStory(false);
    }
  };

  return { isPostingStory, showStoryCreator, setShowStoryCreator, storyText, setStoryText, handlePostStory, refreshStories };
}
