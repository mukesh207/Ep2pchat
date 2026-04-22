import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  AlertTriangle,
  ChevronRight,
  LogOut,
  Menu,
  Search,
  Shield,
  Users,
  X,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import * as api from "./api";
import { destroySocket, socket, type WsMessage } from "./lib/socket";
import AuthFlow from "./components/auth/AuthFlow";
import ChatArena from "./components/chat/ChatArena";
import useChat from "./components/chat/useChat";
import * as vault from "./lib/vault";
import AdminView from "./features/admin/AdminView";
import { ToastProvider } from "./components/ui/Toast";
import type { Contact, Message, RootView, SessionState, LocalKeys } from "./types";
import "./App.css";

function getDisplayName(contact: Contact) {
  return contact.username || contact.email;
}

function getInitials(value: string) {
  return value.trim().charAt(0).toUpperCase();
}

const SIDEBAR_STORAGE_KEY = "trustline.sidebar.width";
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 420;
const SIDEBAR_DEFAULT_WIDTH = 280;

function clampSidebarWidth(value: number) {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, value));
}

function readSidebarWidth() {
  if (typeof window === "undefined") return SIDEBAR_DEFAULT_WIDTH;
  const rawValue = Number(window.localStorage.getItem(SIDEBAR_STORAGE_KEY));
  if (!Number.isFinite(rawValue)) return SIDEBAR_DEFAULT_WIDTH;
  return clampSidebarWidth(rawValue);
}

function getErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  return fallback;
}

export default function App() {
  const [rootView, setRootView] = useState<RootView>("AUTH");
  const [session, setSession] = useState<SessionState | null>(null);
  const [workspaceError, setWorkspaceError] = useState("");

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isHandshaking, setIsHandshaking] = useState(false);
  const [unreadByContact, setUnreadByContact] = useState<Record<string, number>>({});
  const [lastMessageByContact, setLastMessageByContact] = useState<Record<string, string>>({});
  const [typingByContact, setTypingByContact] = useState<Record<string, boolean>>({});
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [sidebarWidthPx, setSidebarWidthPx] = useState<number>(readSidebarWidth);
  const [isNarrowLayout, setIsNarrowLayout] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 900px)").matches : false,
  );

  const localKeys = useRef<LocalKeys | null>(null);
  const myDeviceId = useRef<string | null>(null);
  const activeContactId = useRef<string | null>(null);
  const sidebarResizeState = useRef<{ startX: number; startWidth: number } | null>(null);

  const chatHandlers = useChat({
    localKeys,
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
    setIsSidebarOpen(false);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(max-width: 900px)");
    const updateLayout = () => {
      const isNarrow = mediaQuery.matches;
      setIsNarrowLayout(isNarrow);
      if (isNarrow) setIsSidebarOpen(false);
    };

    updateLayout();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateLayout);
      return () => mediaQuery.removeEventListener("change", updateLayout);
    }
    mediaQuery.addListener(updateLayout);
    return () => mediaQuery.removeListener(updateLayout);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(clampSidebarWidth(sidebarWidthPx)));
  }, [sidebarWidthPx]);

  useEffect(() => {
    if (!isNarrowLayout || !isSidebarOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsSidebarOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isNarrowLayout, isSidebarOpen]);

  useEffect(() => {
    if (!isResizingSidebar) return;

    const handleMouseMove = (event: MouseEvent) => {
      const state = sidebarResizeState.current;
      if (!state) return;
      const delta = event.clientX - state.startX;
      setSidebarWidthPx(clampSidebarWidth(state.startWidth + delta));
    };

    const handleMouseUp = () => {
      sidebarResizeState.current = null;
      setIsResizingSidebar(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizingSidebar]);

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

    const params = new URLSearchParams(window.location.search);
    const token = params.get("e2e_token");
    if (token) api.setToken(token);
    
    if (params.get("e2e_autologin") === "true") {
      const e2eUserId = params.get("e2e_user_id");
      const e2eOrgId = params.get("e2e_org_id");
      const e2eDeviceId = params.get("e2e_device_id");
      if (e2eUserId && e2eOrgId && e2eDeviceId && token) {
        setTimeout(() => handleAuthenticated(e2eUserId, e2eOrgId, e2eDeviceId, {} as LocalKeys, true), 100);
      }
    }
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

  // Auto-refresh contacts every 30 seconds
  useEffect(() => {
    if (rootView !== "CHAT" || !session) return;
    const interval = setInterval(async () => {
      try {
        const res = await api.getUsers();
        const users: Contact[] = (res.users || []).filter((u: Contact) => u.id !== session.userId);
        setContacts(users);
      } catch {}
    }, 30000);
    return () => clearInterval(interval);
  }, [rootView, session]);

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
    setRootView("AUTH");
    setIsSidebarOpen(false);
  };

  const startChat = async (contact: Contact) => {
    if (isNarrowLayout) setIsSidebarOpen(false);
    setIsHandshaking(true);
    setActiveContact(contact);
    setUnreadByContact((prev) => ({ ...prev, [contact.id]: 0 }));

    setWorkspaceError("");

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
    } catch (err: unknown) {
      setMessages([]);
      setWorkspaceError(getErrorMessage(err, "Failed to load local message history."));
    }

    try {
      const bundle = await api.getUserKeys(contact.id);
      contact.devices = bundle.devices;
    } catch (err: unknown) {
      setWorkspaceError(getErrorMessage(err, "Failed to load recipient encryption keys."));
    } finally {
      setIsHandshaking(false);
    }
  };

  const handleSidebarResizeStart = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (isNarrowLayout) return;
    event.preventDefault();
    sidebarResizeState.current = { startX: event.clientX, startWidth: sidebarWidthPx };
    setIsResizingSidebar(true);
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
      <ToastProvider>
        {workspaceError && (
          <div className="workspace-alert" style={{ margin: 12 }}>
            <AlertTriangle size={12} />
            {workspaceError}
          </div>
        )}
        <AuthFlow
          onAuthenticated={handleAuthenticated}
        />
      </ToastProvider>
    );
  }

  if (rootView === "ADMIN") {
    return (
      <ToastProvider>
        <AdminView
          isAdmin={Boolean(session?.isAdmin)}
          currentDeviceId={myDeviceId.current}
          onRevocation={handleRevocation}
          onBack={() => setRootView(session ? "CHAT" : "AUTH")}
        />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
    <div className="app-container">
      <header className="top-bar">
        <div className="top-bar-left">
          <button
            id="sidebar-toggle-btn"
            className="btn btn-ghost btn-sm sidebar-toggle-btn"
            onClick={() => {
              if (!isNarrowLayout) return;
              setIsSidebarOpen((prev) => !prev);
            }}
            aria-label={isSidebarOpen ? "Close contacts sidebar" : "Open contacts sidebar"}
            aria-expanded={isSidebarOpen}
          >
            {isSidebarOpen ? <X size={13} /> : <Menu size={13} />}
            Contacts
          </button>

          <div className="top-bar-logo">
            <Shield size={16} strokeWidth={1.5} /> TRUSTLINE
            <span className="top-bar-version">Desktop</span>
          </div>
        </div>

        <div className="top-bar-meta">
          <div className="meta-item active-status">
            <span className="status-dot active" /> Protected
          </div>
          <div className="meta-item">
            <Users size={10} /> {contacts.length} contacts
          </div>
          {session?.isAdmin ? (
            <button id="admin-btn" className="btn btn-admin" onClick={() => setRootView("ADMIN")}>
              <Shield size={13} /> Admin Console
            </button>
          ) : null}
          <button id="logout-btn" className="btn btn-ghost btn-sm" onClick={handleLogout}>
            <LogOut size={12} /> Sign out
          </button>
        </div>
      </header>

      <div
        className={`app-body${isNarrowLayout ? " narrow" : ""}${isSidebarOpen ? " sidebar-open" : ""}`}
        style={{ "--sidebar-current-w": `${sidebarWidthPx}px` } as CSSProperties}
      >
        {isNarrowLayout && isSidebarOpen ? (
          <button
            id="sidebar-backdrop"
            className="sidebar-backdrop"
            aria-label="Close contacts sidebar"
            onClick={() => setIsSidebarOpen(false)}
          />
        ) : null}

        <aside className={`sidebar${isNarrowLayout ? " sidebar-drawer" : ""}${isSidebarOpen ? " open" : ""}`}>
          {workspaceError && (
            <div className="workspace-alert">
              <AlertTriangle size={12} />
              {workspaceError}
            </div>
          )}

          <div className="sidebar-section-header">
            <span className="sidebar-section-title">People</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-chat-meta)", color: "var(--accent-primary)" }}>
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
                onClick={() => void startChat(c)}
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

        {!isNarrowLayout ? (
          <div
            className={`sidebar-resizer${isResizingSidebar ? " active" : ""}`}
            id="sidebar-resizer"
            role="separator"
            aria-label="Resize sidebar"
            aria-orientation="vertical"
            aria-valuemin={SIDEBAR_MIN_WIDTH}
            aria-valuemax={SIDEBAR_MAX_WIDTH}
            aria-valuenow={Math.round(sidebarWidthPx)}
            onMouseDown={handleSidebarResizeStart}
          />
        ) : null}

        <ChatArena
          activeContact={activeContact}
          setActiveContact={setActiveContact}
          isHandshaking={isHandshaking}
          messages={messages}
          setMessages={setMessages}
          workspaceName="Secure Workspace"
          typingByContact={typingByContact}
          localKeys={localKeys}
          userId={session?.userId || null}
          setLastMessageByContact={setLastMessageByContact}
          showContactDetail={() => {}}
          isNarrowLayout={isNarrowLayout}
          onRequestOpenSidebar={() => setIsSidebarOpen(true)}
        />
      </div>
    </div>
    </ToastProvider>
  );
}
