import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronRight,
  LogOut,
  Search,
  Shield,
  ShieldOff,
  Users,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import * as api from "./api";
import { destroySocket, socket, type WsMessage } from "./lib/socket";
import AuthFlow from "./components/auth/AuthFlow";
import ChatArena from "./components/chat/ChatArena";
import useChat from "./components/chat/useChat";
import * as vault from "./lib/vault";
import AdminView from "./features/admin/AdminView";
import type { Contact, Message, RootView, SessionState, LocalKeys } from "./types";
import "./App.css";

const SHOW_DEV_TOOLS = import.meta.env.DEV;

const DEMO_CONTACTS: Contact[] = [
  {
    id: "1",
    username: "alice",
    email: "alice@blacksite.io",
    status: "active",
    device_count: 1,
    devices: [{ device_id: "demo-device-1", identity_key: "", signed_pre_key: "", signed_pre_key_signature: "", one_time_pre_key: null }],
  },
  {
    id: "2",
    username: "charlie",
    email: "charlie@blacksite.io",
    status: "active",
    device_count: 1,
    devices: [{ device_id: "demo-device-2", identity_key: "", signed_pre_key: "", signed_pre_key_signature: "", one_time_pre_key: null }],
  },
];

const DEMO_MESSAGES: Record<string, Message[]> = {
  "1": [
    {
      id: "m1",
      sender: "them",
      text: "Authentication layer is live. X3DH confirmed on all nodes.",
      timestamp: new Date(Date.now() - 8 * 60000).toISOString(),
      is_me: false,
      status: "received",
    },
    {
      id: "m2",
      sender: "me",
      text: "Acknowledged. RLS policies enforced.",
      timestamp: new Date(Date.now() - 6 * 60000).toISOString(),
      is_me: true,
      status: "read",
    },
  ],
};

function getDisplayName(contact: Contact) {
  return contact.username || contact.email;
}

function getInitials(value: string) {
  return value.trim().charAt(0).toUpperCase();
}

export default function App() {
  const [rootView, setRootView] = useState<RootView>("AUTH");
  const [session, setSession] = useState<SessionState | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [workspaceError, setWorkspaceError] = useState("");

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isHandshaking, setIsHandshaking] = useState(false);
  const [unreadByContact, setUnreadByContact] = useState<Record<string, number>>({});
  const [lastMessageByContact, setLastMessageByContact] = useState<Record<string, string>>({});
  const [typingByContact, setTypingByContact] = useState<Record<string, boolean>>({});

  const localKeys = useRef<LocalKeys | null>(null);
  const myDeviceId = useRef<string | null>(null);
  const activeContactId = useRef<string | null>(null);

  const chatHandlers = useChat({
    localKeys,
    userId: session?.userId,
    activeContactId,
    setMessages,
    setLastMessageByContact,
    setTypingByContact,
    setUnreadByContact,
  });
  const handlersRef = useRef(chatHandlers);
  handlersRef.current = chatHandlers;

  useEffect(() => {
    activeContactId.current = activeContact?.id ?? null;
  }, [activeContact]);

  const handleDeviceRevoked = (payload: { device_id?: string }) => {
    if (!payload?.device_id || payload.device_id !== myDeviceId.current) return;
    destroySocket();
    invoke("clear_vault_session").catch(() => {});
    api.setToken("");
    localKeys.current = null;
    myDeviceId.current = null;
    setWorkspaceError("This device has been revoked. Sign in again on an active device to continue.");
    setSession(null);
    setRootView("AUTH");
    setContacts([]);
    setActiveContact(null);
    setMessages([]);
    setIsDemo(false);
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
      if (msg.type === "DEVICE_REVOKED") {
        handleDeviceRevoked(msg.payload);
      }
    });
  }, []);

  const loadWorkspace = async (userId: string) => {
    const [usersRes, myDevicesRes] = await Promise.all([
      api.getUsers(),
      api.getMyDevices().catch(() => ({ devices: [] })),
    ]);

    const users: Contact[] = (usersRes.users || []).filter((u: Contact) => u.id !== userId);
    setContacts(users);

    const currentDevice = (myDevicesRes.devices || []).find((d: any) => d.is_active);
    if (currentDevice?.id) {
      myDeviceId.current = currentDevice.id;
      await vault.saveDeviceId(currentDevice.id).catch(() => {});
    }
  };

  const handleAuthenticated = (
    userId: string,
    orgId: string,
    deviceId: string,
    keys: LocalKeys,
    isAdmin: boolean,
  ) => {
    void (async () => {
      setWorkspaceError("");
      setIsDemo(false);
      setSession({ userId, orgId, isAdmin });
      localKeys.current = keys;
      myDeviceId.current = deviceId;
      socket.connect(api.getToken(), deviceId);

      try {
        await loadWorkspace(userId);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to load workspace contacts.";
        setWorkspaceError(message);
      }

      setRootView("CHAT");
    })();
  };

  const handleRevocation = () => {
    handleDeviceRevoked({ device_id: myDeviceId.current ?? undefined });
  };

  const handleLogout = async () => {
    destroySocket();
    await invoke("clear_vault_session").catch(() => {});
    api.setToken("");
    localKeys.current = null;
    myDeviceId.current = null;
    setSession(null);
    setContacts([]);
    setActiveContact(null);
    setMessages([]);
    setUnreadByContact({});
    setLastMessageByContact({});
    setTypingByContact({});
    setIsDemo(false);
    setRootView("AUTH");
  };

  const startChat = async (contact: Contact) => {
    setIsHandshaking(true);
    setActiveContact(contact);
    setUnreadByContact((prev) => ({ ...prev, [contact.id]: 0 }));

    if (isDemo) {
      setTimeout(() => {
        setMessages(DEMO_MESSAGES[contact.id] || []);
        setIsHandshaking(false);
      }, 300);
      return;
    }

    try {
      const history = (await vault.getMessages(contact.id)) as any[];
      setMessages(
        history.map((m) => ({
          id: m.id,
          sender: m.is_me ? "me" : m.sender_id,
          text: m.content,
          timestamp: m.timestamp,
          is_me: m.is_me,
          status: m.message_status,
        })),
      );

      const bundle = await api.getUserKeys(contact.id);
      contact.devices = bundle.devices;
    } catch (err: any) {
      setWorkspaceError(err?.message || "Failed to open conversation.");
    } finally {
      setIsHandshaking(false);
    }
  };

  const filteredContacts = useMemo(
    () =>
      contacts.filter((c) =>
        `${c.email} ${c.username || ""}`.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [contacts, searchQuery],
  );

  if (rootView === "AUTH") {
    return (
      <>
        {workspaceError && (
          <div className="workspace-alert" style={{ margin: 12 }}>
            <AlertTriangle size={12} />
            {workspaceError}
          </div>
        )}
        <AuthFlow
          onAuthenticated={handleAuthenticated}
          onAdminAccess={() => setRootView("ADMIN")}
          onDemoMode={() => {
            setWorkspaceError("");
            setIsDemo(true);
            setSession({ userId: "demo-user", orgId: "demo-org", isAdmin: true });
            localKeys.current = {
              identity_public: "",
              identity_secret: "",
              signed_pre_key_public: "",
              signed_pre_key_secret: "",
              signed_pre_key_signature: "",
            };
            myDeviceId.current = "demo-device";
            setContacts(DEMO_CONTACTS);
            setRootView("CHAT");
          }}
        />
      </>
    );
  }

  if (rootView === "ADMIN") {
    return (
      <AdminView
        isAdmin={Boolean(session?.isAdmin)}
        currentDeviceId={myDeviceId.current}
        onRevocation={handleRevocation}
        onBack={() => setRootView(session ? "CHAT" : "AUTH")}
      />
    );
  }

  return (
    <div className="app-container">
      <header className="top-bar">
        <div className="top-bar-logo">
          <Shield size={16} strokeWidth={1.5} /> TRUSTLINE
          <span className="top-bar-version">Desktop</span>
          {isDemo && SHOW_DEV_TOOLS && <span className="top-bar-badge">Sample Workspace</span>}
        </div>

        <div className="top-bar-meta">
          <div className="meta-item active-status">
            <span className="status-dot active" /> Protected
          </div>
          <div className="meta-item">
            <Users size={10} /> {contacts.length} contacts
          </div>
          {session?.isAdmin ? (
            <button className="btn btn-ghost btn-sm" onClick={() => setRootView("ADMIN")}>
              <ShieldOff size={12} /> Admin
            </button>
          ) : null}
          <button id="logout-btn" className="btn btn-ghost btn-sm" onClick={handleLogout}>
            <LogOut size={12} /> Sign out
          </button>
        </div>
      </header>

      <div className="app-body">
        <aside className="sidebar">
          {workspaceError && (
            <div className="workspace-alert">
              <AlertTriangle size={12} />
              {workspaceError}
            </div>
          )}

          <div className="sidebar-section-header">
            <span className="sidebar-section-title">People</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.62rem", color: "var(--accent-primary)" }}>
              {filteredContacts.length}
            </span>
          </div>

          <div className="sidebar-search">
            <div className="search-wrap">
              <Search className="search-icon" size={14} />
              <input
                id="contact-search"
                className="input"
                placeholder="Search people"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="contact-list">
            {filteredContacts.map((c) => (
              <div
                key={c.id}
                id={`contact-${c.id}`}
                className={`contact-item${activeContact?.id === c.id ? " active" : ""}`}
                onClick={() => startChat(c)}
              >
                <div className="avatar">{getInitials(getDisplayName(c))}</div>
                <div className="contact-item-info">
                  <div className="contact-item-email">{getDisplayName(c)}</div>
                  <div className="contact-item-sub">{typingByContact[c.id] ? "Typing..." : (lastMessageByContact[c.id] || c.email)}</div>
                </div>
                {(unreadByContact[c.id] || 0) > 0 ? (
                  <span className="unread-pill">{unreadByContact[c.id]}</span>
                ) : (
                  <ChevronRight size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                )}
              </div>
            ))}
            {filteredContacts.length === 0 && <div className="empty-contacts">No people found.</div>}
          </div>
        </aside>

        <ChatArena
          activeContact={activeContact}
          setActiveContact={setActiveContact}
          isHandshaking={isHandshaking}
          messages={messages}
          setMessages={setMessages}
          workspaceName="Secure Workspace"
          typingByContact={typingByContact}
          isDemo={isDemo}
          localKeys={localKeys}
          userId={session?.userId || null}
          setLastMessageByContact={setLastMessageByContact}
          showContactDetail={() => {}}
        />
      </div>
    </div>
  );
}
