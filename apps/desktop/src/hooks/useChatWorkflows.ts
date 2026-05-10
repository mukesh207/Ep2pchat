import { useState, useEffect } from 'react';
import * as vault from '../infrastructure/vault';
import * as api from '../infrastructure/api';
import { useChatStore } from '../stores/useChatStore';
import { useUIStore } from '../stores/useUIStore';
import { useToast } from '../components/ui/Toast';
import { Contact } from '../types';

export function useChatWorkflows() {
  const { addToast } = useToast();
  const { setMessages, setActiveContact, setUnreadByContact, setHandshakeStatus } = useChatStore();
  const { isNarrowLayout, setIsSidebarOpen } = useUIStore();

  const [mutedContacts, setMutedContacts] = useState<Set<string>>(() => {
    const saved = localStorage.getItem("trustline.muted_contacts");
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  
  const [pinnedContacts, setPinnedContacts] = useState<Set<string>>(() => {
    const saved = localStorage.getItem("trustline.pinned_contacts");
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  useEffect(() => {
    localStorage.setItem("trustline.muted_contacts", JSON.stringify(Array.from(mutedContacts)));
  }, [mutedContacts]);

  useEffect(() => {
    localStorage.setItem("trustline.pinned_contacts", JSON.stringify(Array.from(pinnedContacts)));
  }, [pinnedContacts]);

  const handleMuteToggle = (contactId: string) => {
    setMutedContacts((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  };

  const handlePinToggle = (contactId: string) => {
    setPinnedContacts((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  };

  const startChat = async (contact: Contact) => {
    if (isNarrowLayout) setIsSidebarOpen(false);
    setHandshakeStatus("key_exchange");
    setActiveContact(contact);
    setUnreadByContact((prev: any) => ({ ...prev, [contact.id]: 0 }));

    try {
      const history = await vault.getMessages(contact.id);
      setMessages(history);
    } catch (err: any) {
      setMessages([]);
      addToast(err.message || "Failed to load history", "error");
    }

    try {
      const bundle = await api.getUserKeys(contact.id);
      contact.devices = bundle.devices;
      setHandshakeStatus("ratcheting");
    } catch (err: any) {
      addToast(err.message || "Failed to load keys", "error");
      setHandshakeStatus("idle");
    } finally {
      setTimeout(() => setHandshakeStatus("idle"), 800);
    }
  };

  return { mutedContacts, pinnedContacts, handleMuteToggle, handlePinToggle, startChat };
}
