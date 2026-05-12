import { useEffect, useRef } from 'react';
import { invoke } from "@tauri-apps/api/core";
import * as api from '../infrastructure/api';
import { socket, destroySocket, type WsMessage } from '../infrastructure/socket';
import * as vault from '../infrastructure/vault';
import { useAuthStore } from '../stores/useAuthStore';
import { useChatStore } from '../stores/useChatStore';
import { useUIStore } from '../stores/useUIStore';
import { useToast } from '../components/ui/Toast';
import useChat from '../features/chat/useChat';
import { Contact, LocalKeys } from '../types';

export function useAppInitialization() {
  const { addToast } = useToast();
  const { session, setSession, localKeys, setLocalKeys, setMyDeviceId, logout: storeLogout } = useAuthStore();
  const { setContacts, setPresenceByContact, setMessages, setLastMessageByContact, setTypingByContact, setUnreadByContact } = useChatStore();
  const { setRootView, triggerAdminRefresh } = useUIStore();
  
  const activeContactId = useRef<string | null>(null);
  const localKeysRef = useRef<LocalKeys | null>(null);

  const chatHandlers = useChat({
    localKeys: localKeysRef,
    userId: session?.userId ?? null,
    activeContactId,
    setMessages,
    setLastMessageByContact,
    setTypingByContact,
    setUnreadByContact,
  });

  const handlersRef = useRef(chatHandlers);
  handlersRef.current = chatHandlers;

  useEffect(() => {
    localKeysRef.current = localKeys;
  }, [localKeys]);

  const loadWorkspace = async (userId: string) => {
    try {
      const [usersRes, myDevicesRes] = await Promise.all([
        api.getUsers(),
        api.getMyDevices().catch(() => ({ devices: [] })),
        api.getOrgSettings().catch(() => null),
      ]);

      const users: Contact[] = (usersRes.users || []).filter((u: Contact) => u.id !== userId);
      setContacts(users);
      
      const initialPresence: Record<string, "online" | "offline" | "away"> = {};
      users.forEach(u => {
        if (u.presence_status) {
          initialPresence[u.id] = u.presence_status as any;
        }
      });
      setPresenceByContact(initialPresence);

      const currentDevice = (myDevicesRes.devices || []).find((d: any) => d.is_active);
      if (currentDevice?.id) {
        setMyDeviceId(currentDevice.id);
        await vault.saveDeviceId(currentDevice.id).catch(() => {});
      }
    } catch (err: any) {
      addToast(err.message || "Failed to load workspace", "error");
    }
  };

  const handleAuthenticated = (
    userId: string,
    orgId: string,
    email: string,
    deviceId: string,
    keys: LocalKeys,
    role: string,
    username?: string,
    department?: string,
  ) => {
    setSession({ userId, orgId, email, role, username, department });
    setLocalKeys(keys);
    setMyDeviceId(deviceId);
    socket.connect(api.getToken(), deviceId);

    void loadWorkspace(userId);
    setRootView(username ? "CHAT" : "ONBOARDING");
  };

  const handleLogout = async (confirm: any) => {
    const confirmed = await confirm({
      title: "Terminate Session",
      message: "Are you sure you want to log out? All active E2EE tunnels will be severed and the local vault session will be cleared.",
      confirmLabel: "Terminate Session",
      variant: "danger",
    });
    if (!confirmed) return;

    destroySocket();
    await api.logout().catch(() => {});
    await invoke("clear_vault_session").catch(() => {});
    api.setToken("");
    storeLogout();
    setContacts([]);
    setMessages([]);
    setRootView("AUTH");
  };

  useEffect(() => {
    socket.onMessage((msg: WsMessage) => {
      if (msg.type === "MESSAGE_RECEIVE") {
        handlersRef.current.handleIncomingMessage(msg.payload);
      }
      if (msg.type === "MESSAGE_STATUS") {
        handlersRef.current.handleMessageStatus(msg.payload);
      }
      if (msg.type === "MESSAGE_CONFIRM") {
        handlersRef.current.handleMessageConfirm(msg.payload);
      }
      if (msg.type === "TYPING_EVENT") {
        handlersRef.current.handleTypingEvent(msg.payload);
      }
      if (msg.type === "PRESENCE_UPDATE") {
        setPresenceByContact((prev: any) => ({
          ...prev,
          [msg.payload.user_id as string]: msg.payload.status as any,
        }));
      }
      if (msg.type === "ADMISSION_REQUEST") {
        addToast(`New admission request from ${msg.payload.email}`, "info");
        triggerAdminRefresh();
      }
      if (msg.type === "STORY_KEY_SHARE") {
        handlersRef.current.handleStoryKeyShare(msg.payload);
      }
    });
  }, []);

  return { handleAuthenticated, handleLogout };
}
