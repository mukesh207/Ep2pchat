import { create } from 'zustand';
import { Contact, Message } from '../types';

interface ChatState {
  contacts: Contact[];
  activeContact: Contact | null;
  messages: Message[];
  unreadByContact: Record<string, number>;
  lastMessageByContact: Record<string, string>;
  typingByContact: Record<string, boolean>;
  presenceByContact: Record<string, "online" | "offline" | "away">;
  handshakeStatus: "idle" | "key_exchange" | "ratcheting";
  allStories: any[];

  setContacts: (contacts: Contact[]) => void;
  setActiveContact: (contact: Contact | null) => void;
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  setUnreadByContact: (unread: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => void;
  setLastMessageByContact: (last: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  setTypingByContact: (typing: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void;
  setPresenceByContact: (presence: Record<string, "online" | "offline" | "away"> | ((prev: Record<string, "online" | "offline" | "away">) => Record<string, "online" | "offline" | "away">)) => void;
  setHandshakeStatus: (status: "idle" | "key_exchange" | "ratcheting") => void;
  setAllStories: (stories: any[]) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  contacts: [],
  activeContact: null,
  messages: [],
  unreadByContact: {},
  lastMessageByContact: {},
  typingByContact: {},
  presenceByContact: {},
  handshakeStatus: "idle",
  allStories: [],

  setContacts: (contacts) => set({ contacts }),
  setActiveContact: (activeContact) => set({ activeContact }),
  setMessages: (messages) => set((state) => ({ 
    messages: typeof messages === 'function' ? messages(state.messages) : messages 
  })),
  setUnreadByContact: (unreadByContact) => set((state) => ({ 
    unreadByContact: typeof unreadByContact === 'function' ? unreadByContact(state.unreadByContact) : unreadByContact 
  })),
  setLastMessageByContact: (lastMessageByContact) => set((state) => ({ 
    lastMessageByContact: typeof lastMessageByContact === 'function' ? lastMessageByContact(state.lastMessageByContact) : lastMessageByContact 
  })),
  setTypingByContact: (typingByContact) => set((state) => ({ 
    typingByContact: typeof typingByContact === 'function' ? typingByContact(state.typingByContact) : typingByContact 
  })),
  setPresenceByContact: (presenceByContact) => set((state) => ({ 
    presenceByContact: typeof presenceByContact === 'function' ? presenceByContact(state.presenceByContact) : presenceByContact 
  })),
  setHandshakeStatus: (handshakeStatus) => set({ handshakeStatus }),
  setAllStories: (allStories) => set({ allStories }),
}));
