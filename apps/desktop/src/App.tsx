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
  Settings,
  Shield,
  X,
  Monitor,
  Smartphone,
  BellOff,
  Pin,
  Trash2,
  Loader2,
  FileUp,
  Building2,
  Plus,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import * as api from "./api";
import { destroySocket, socket, type WsMessage } from "./lib/socket";
import AuthFlow from "./components/auth/AuthFlow";
import OnboardingWizard from "./components/auth/OnboardingWizard";
import ChatArena from "./components/chat/ChatArena";
import useChat from "./components/chat/useChat";
import * as vault from "./lib/vault";
import AdminView from "./features/admin/AdminView";
import { ToastProvider, useToast } from "./components/ui/Toast";
import { ConfirmProvider } from "./components/ui/ConfirmDialog";
import { ContextMenu } from "./components/ui/ContextMenu";
import IdentityModal from "./components/chat/IdentityModal";
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
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AppInternal />
      </ConfirmProvider>
    </ToastProvider>
  );
}

function AppInternal() {
  const { addToast } = useToast();
  const [rootView, setRootView] = useState<RootView>("AUTH");
  const [session, setSession] = useState<SessionState | null>(null);
  const [workspaceError, setWorkspaceError] = useState("");

  const [editUsername, setEditUsername] = useState("");
  const [editDepartment, setEditDepartment] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [allStories, setAllStories] = useState<any[]>([]);
  const [activeStoryUser, setActiveStoryUser] = useState<Contact | null>(null);
  const [isPostingStory, setIsPostingStory] = useState(false);
  const [showStoryCreator, setShowStoryCreator] = useState(false);
  const [storyText, setStoryStoryText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isHandshaking, setIsHandshaking] = useState(false);
  const [unreadByContact, setUnreadByContact] = useState<Record<string, number>>({});
  const [lastMessageByContact, setLastMessageByContact] = useState<Record<string, string>>({});
  const [typingByContact, setTypingByContact] = useState<Record<string, boolean>>({});
  const [presenceByContact, setPresenceByContact] = useState<Record<string, "online" | "offline" | "away">>({});
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showUserSettings, setShowUserSettings] = useState(false);
  const [showIdentityModal, setShowIdentityModal] = useState(false);
  const [myDevices, setMyDevices] = useState<any[]>([]);
  const [isRevokingDevice, setIsRevokingDevice] = useState<string | null>(null);
  const [mutedContacts, setMutedContacts] = useState<Set<string>>(() => {
    const saved = localStorage.getItem("trustline.muted_contacts");
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [pinnedContacts, setPinnedContacts] = useState<Set<string>>(() => {
    const saved = localStorage.getItem("trustline.pinned_contacts");
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [sidebarWidthPx, setSidebarWidthPx] = useState<number>(readSidebarWidth);
  const [isNarrowLayout, setIsNarrowLayout] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 900px)").matches : false,
  );

  const [branding, setBranding] = useState<{ primary_color: string; workspace_name: string }>({
    primary_color: "#6e56cf",
    workspace_name: "",
  });

  const applyBranding = (color: string) => {
    if (!color) return;
    document.documentElement.style.setProperty("--accent-primary", color);
  };

  useEffect(() => {
    applyBranding(branding.primary_color);
  }, [branding.primary_color]);

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
    window.addEventListener("mousemove", (handleMouseMove as any));
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", (handleMouseMove as any));
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
      if (msg.type === "PRESENCE_UPDATE") {
        setPresenceByContact((prev) => ({
          ...prev,
          [msg.payload.user_id as string]: msg.payload.status as any,
        }));
      }
      if (msg.type === "DEVICE_REVOKED") {
        handleDeviceRevoked(msg.payload);
      }
      if (msg.type === "NUKE_VAULT") {
        void handleLogout();
        setWorkspaceError("This device has been remotely wiped by an administrator.");
      }
      if (msg.type === "STORY_KEY_SHARE") {
        handlersRef.current.handleStoryKeyShare(msg.payload);
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
        setTimeout(() => handleAuthenticated(e2eUserId, e2eOrgId, "e2e@trustline.test", e2eDeviceId, {} as LocalKeys, "ADMIN"), 100);
      }
    }
  }, []);

  useEffect(() => {
    if (showUserSettings) {
      void refreshMyDevices();
      setEditUsername(session?.username || "");
      setEditDepartment(session?.department || "");
    }
  }, [showUserSettings, session]);

  const refreshStories = async () => {
    if (rootView !== "CHAT" || !session) return;
    try {
      const res = await api.fetchStories();
      setAllStories(res.stories || []);
    } catch {}
  };

  useEffect(() => {
    if (rootView === "CHAT") {
      void refreshStories();
      const interval = setInterval(refreshStories, 60000);
      return () => clearInterval(interval);
    }
  }, [rootView, session]);

  const loadWorkspace = async (userId: string) => {
    const [usersRes, myDevicesRes, settingsRes] = await Promise.all([
      api.getUsers(),
      api.getMyDevices().catch(() => ({ devices: [] })),
      api.getOrgSettings().catch(() => null),
    ]);

    const users: Contact[] = (usersRes.users || []).filter((u: Contact) => u.id !== userId);
    setContacts(users);
    setMyDevices(myDevicesRes.devices || []);
    
    if (settingsRes?.branding) {
      setBranding(settingsRes.branding);
    }

    const initialPresence: Record<string, "online" | "offline" | "away"> = {};
    users.forEach(u => {
      if (u.presence_status) {
        initialPresence[u.id] = u.presence_status;
      }
    });
    setPresenceByContact(initialPresence);

    const currentDevice = (myDevicesRes.devices || []).find((d: any) => d.is_active);
    if (currentDevice?.id) {
      myDeviceId.current = currentDevice.id;
      await vault.saveDeviceId(currentDevice.id).catch(() => {});
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
    void (async () => {
      setWorkspaceError("");
      setSession({ userId, orgId, email, role, username, department });
      localKeys.current = keys;
      myDeviceId.current = deviceId;
      socket.connect(api.getToken(), deviceId);

      try {
        await loadWorkspace(userId);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to load workspace contacts.";
        setWorkspaceError(message);
      }

      // If user has no username set yet, it's their first time — show onboarding.
      setRootView(username ? "CHAT" : "ONBOARDING");
    })();
  };

  useEffect(() => {
    if (rootView !== "CHAT" || !session) return;
    const interval = setInterval(async () => {
      try {
        const [uRes, dRes] = await Promise.all([
          api.getUsers(),
          api.getMyDevices().catch(() => ({ devices: [] })),
        ]);
        const users: Contact[] = (uRes.users || []).filter((u: Contact) => u.id !== session.userId);
        setContacts(users);
        setMyDevices(dRes.devices || []);
      } catch {}
    }, 30000);
    return () => clearInterval(interval);
  }, [rootView, session]);

  useEffect(() => {
    localStorage.setItem("trustline.muted_contacts", JSON.stringify(Array.from(mutedContacts)));
  }, [mutedContacts]);

  useEffect(() => {
    localStorage.setItem("trustline.pinned_contacts", JSON.stringify(Array.from(pinnedContacts)));
  }, [pinnedContacts]);

  const refreshMyDevices = async () => {
    try {
      const res = await api.getMyDevices();
      setMyDevices(res.devices || []);
    } catch {}
  };

  const handleRevokeOwnDevice = async (deviceId: string) => {
    setIsRevokingDevice(deviceId);
    try {
      await api.revokeOwnDevice(deviceId);
      await refreshMyDevices();
    } finally {
      setIsRevokingDevice(null);
    }
  };

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

  const handleRevocation = () => {
    handleDeviceRevoked({ device_id: myDeviceId.current ?? undefined });
  };

  const handleSaveProfile = async () => {
    setIsSavingProfile(true);
    try {
      await api.updateProfile({
        username: editUsername,
        department: editDepartment,
      });
      setSession((prev) => prev ? { ...prev, username: editUsername, department: editDepartment } : null);
      addToast("Profile updated successfully", "success");
    } catch (err: any) {
      addToast("Failed to update profile: " + err.message, "error");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePresenceChange = async (status: "online" | "away" | "offline") => {
    try {
      await api.updateProfile({ presence_status: status });
      // Update local presence for self
      if (session?.userId) {
        setPresenceByContact((prev) => ({ ...prev, [session.userId]: status }));
      }
      addToast(`Status updated to ${status}`, "success");
    } catch (err: any) {
      addToast("Failed to update presence: " + err.message, "error");
    }
  };

  const handlePostStory = async (text: string) => {
    if (!text.trim() || !session) return;
    setIsPostingStory(true);
    try {
        const storyKey = window.crypto.getRandomValues(new Uint8Array(32));
        const storyKeyB64 = btoa(String.fromCharCode(...storyKey));
        
        // 1. Encrypt story content locally
        const [ciphertextB64, nonceB64] = await invoke<[string, string]>("story_encrypt", {
            plaintext: text,
            keyB64: storyKeyB64
        });
        
        // 2. Upload to server
        await api.uploadStory(ciphertextB64, nonceB64);

        // 3. Share key with ALL active contacts via silent system messages
        const sharePromises = contacts.map(async (contact) => {
           const target = contact.devices?.[0];
           if (!target) return;
           
           const sessionJson = await vault.getRatchetSession(contact.id);
           if (!sessionJson) return; // No active session, skipping

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
        setStoryStoryText("");
        void refreshStories();
    } catch (err: any) {
        addToast("Failed to post story: " + err.message, "error");
    } finally {
        setIsPostingStory(false);
    }
  };

  const handleLogout = async () => {
    destroySocket();
    await api.logout().catch(() => {});
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
    setMyDevices([]);
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
      const history = await vault.getMessages(contact.id);
      setMessages(history);
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

  const groupedContacts = useMemo(() => {
    const filtered = contacts.filter((c) =>
      `${c.email} ${c.username || ""}`.toLowerCase().includes(searchQuery.toLowerCase()),
    );
    
    const pinned = filtered.filter(c => pinnedContacts.has(c.id));
    const unpinned = filtered.filter(c => !pinnedContacts.has(c.id));

    const departments: Record<string, Contact[]> = {};
    unpinned.forEach(c => {
      const dept = c.department || "General";
      if (!departments[dept]) departments[dept] = [];
      departments[dept].push(c);
    });

    return {
      pinned,
      departments: Object.entries(departments).sort(([a], [b]) => a.localeCompare(b))
    };
  }, [contacts, searchQuery, pinnedContacts]);

  const renderContact = (c: Contact) => (
    <ContextMenu
      key={c.id}
      items={[
        {
          label: "View Identity Details",
          icon: <Shield size={12} />,
          onClick: () => {
            setActiveContact(c);
            setShowIdentityModal(true);
          },
        },
        {
          label: pinnedContacts.has(c.id) ? "Unpin from Top" : "Pin to Top",
          icon: <Pin size={12} />,
          onClick: () => handlePinToggle(c.id),
        },
        {
          label: mutedContacts.has(c.id) ? "Unmute Notifications" : "Mute Notifications",
          icon: <BellOff size={12} />,
          onClick: () => handleMuteToggle(c.id),
        },
        {
          label: "Clear Conversation",
          icon: <Trash2 size={12} />,
          variant: "danger",
          onClick: () => {
            console.log("Clear requested for", c.id);
          },
        },
      ]}
    >
      <div
        id={`contact-${c.id}`}
        className={`contact-item${activeContact?.id === c.id ? " active" : ""}`}
        onClick={() => void startChat(c)}
      >
        <div className="avatar" style={{ position: "relative" }}>
          {getInitials(getDisplayName(c))}
          {presenceByContact[c.id] === "online" && (
            <div style={{ position: "absolute", bottom: 0, right: 0, width: 10, height: 10, borderRadius: "50%", backgroundColor: "var(--success)" }} />
          )}
          {presenceByContact[c.id] === "away" && (
            <div style={{ position: "absolute", bottom: 0, right: 0, width: 10, height: 10, borderRadius: "50%", backgroundColor: "var(--warning)" }} />
          )}
          {presenceByContact[c.id] === "offline" && (
            <div style={{ position: "absolute", bottom: 0, right: 0, width: 10, height: 10, borderRadius: "50%", backgroundColor: "var(--text-muted)", border: "2px solid var(--surface-2)" }} />
          )}
          {pinnedContacts.has(c.id) && (
            <div style={{ position: "absolute", top: -4, right: -4, background: "var(--bg-app)", borderRadius: "50%", padding: 2 }}>
              <Pin size={8} fill="var(--accent-primary)" color="var(--accent-primary)" />
            </div>
          )}
        </div>
        <div className="contact-item-info">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div className="contact-item-email">{getDisplayName(c)}</div>
            {mutedContacts.has(c.id) && <BellOff size={10} style={{ opacity: 0.4 }} />}
          </div>
          <div className="contact-item-sub">{typingByContact[c.id] ? "Typing..." : (lastMessageByContact[c.id] || c.email)}</div>
        </div>
        {(unreadByContact[c.id] || 0) > 0 ? (
          <span className="unread-pill">{unreadByContact[c.id]}</span>
        ) : (
          <ChevronRight size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        )}
      </div>
    </ContextMenu>
  );

  if (rootView === "AUTH") {
    return (
        <div className="app-container">
          {workspaceError && (
            <div className="workspace-alert" style={{ margin: 12 }}>
              <AlertTriangle size={12} />
              {workspaceError}
            </div>
          )}
          <AuthFlow onAuthenticated={handleAuthenticated} />
        </div>
    );
  }

  if (rootView === "ADMIN") {
    return (
          <AdminView
            role={session?.role || "USER"}
            currentDeviceId={myDeviceId.current}
            onRevocation={handleRevocation}
            onBack={() => setRootView(session ? "CHAT" : "AUTH")}
          />
    );
  }

  if (rootView === "ONBOARDING" && session) {
    return (
      <OnboardingWizard
        email={session.email}
        onComplete={(username, department) => {
          setSession(prev => prev ? { ...prev, username, department } : null);
          setRootView("CHAT");
        }}
      />
    );
  }

  return (
        <div className="app-container">
          <header className="top-bar">
            <div className="top-bar-left">
              <button
                id="sidebar-toggle-btn"
                className="btn btn-ghost btn-sm sidebar-toggle-btn"
                onClick={() => {
                  if (!isNarrowLayout) return;
                  setIsSidebarOpen((prev: boolean) => !prev);
                }}
                aria-label={isSidebarOpen ? "Close contacts sidebar" : "Open contacts sidebar"}
                aria-expanded={isSidebarOpen}
              >
                {isSidebarOpen ? <X size={13} /> : <Menu size={13} />}
                Contacts
              </button>

              <div className="top-bar-logo">
                <Shield size={16} strokeWidth={1.5} /> {branding.workspace_name || "TRUSTLINE"}
                {!branding.workspace_name && <span className="top-bar-version">Desktop</span>}
              </div>
            </div>

            <div className="top-bar-meta">
              <div className="meta-item active-status">
                <span className="status-dot active" /> Protected
              </div>
              {session?.role === "ADMIN" ? (
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

              <div className="sidebar-stories-ring" style={{ padding: '12px 16px', display: 'flex', gap: 12, overflowX: 'auto', borderBottom: '1px solid var(--border)', scrollbarWidth: 'none' }}>
                   <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', flexShrink: 0 }} onClick={() => setShowStoryCreator(true)}>
                      <div className="avatar" style={{ border: '2px dashed var(--border)', background: 'transparent' }}>
                         <Plus size={14} />
                      </div>
                      <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Your Story</span>
                   </div>
                   {Array.from(new Set(allStories.map(s => s.user_id))).map(uid => {
                      const contact = contacts.find(c => c.id === uid);
                      if (!contact) return null;
                      return (
                        <div key={uid} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', flexShrink: 0 }} onClick={() => setActiveStoryUser(contact)}>
                          <div className="avatar" style={{ border: '2px solid var(--accent-primary)', padding: 2, background: 'var(--bg-app)' }}>
                             <div className="avatar" style={{ margin: 0, width: '100%', height: '100%' }}>{getInitials(getDisplayName(contact))}</div>
                          </div>
                          <span style={{ fontSize: '0.6rem' }}>{getDisplayName(contact).split(' ')[0]}</span>
                        </div>
                      );
                   })}
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
                {groupedContacts.pinned.length > 0 && (
                   <div className="sidebar-group">
                     <div className="sidebar-group-header">PINNED</div>
                     {groupedContacts.pinned.map(renderContact)}
                   </div>
                )}

                {groupedContacts.departments.map(([dept, people]) => (
                  <div key={dept} className="sidebar-group">
                    <div className="sidebar-group-header">
                        <Building2 size={10} />
                        {dept.toUpperCase()}
                    </div>
                    {people.map(renderContact)}
                  </div>
                ))}
                {contacts.length === 0 && <div className="empty-contacts">No people found.</div>}
              </div>

              <div className="sidebar-footer">
                <div className="user-profile-summary">
                  <div className="avatar" style={{ position: 'relative' }}>
                    {getInitials(session?.email || "U")}
                    {session?.userId && presenceByContact[session.userId] && (
                       <div style={{ 
                         position: "absolute", 
                         bottom: 0, 
                         right: 0, 
                         width: 8, 
                         height: 8, 
                         borderRadius: "50%", 
                         backgroundColor: presenceByContact[session.userId] === 'online' ? 'var(--success)' : presenceByContact[session.userId] === 'away' ? 'var(--warning)' : 'var(--text-muted)',
                         border: '2px solid var(--bg-app)'
                       }} />
                    )}
                  </div>
                  <div className="user-info">
                    <div className="user-email">{session?.username || session?.email}</div>
                    <div className="user-status-text">{session?.department || "Verified Device"}</div>
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowUserSettings(true)}>
                  <Settings size={14} />
                </button>
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
              workspaceName={branding.workspace_name || "Secure Workspace"}
              typingByContact={typingByContact}
              presenceByContact={presenceByContact}
              localKeys={localKeys}
              userId={session?.userId || null}
              setLastMessageByContact={setLastMessageByContact}
              showContactDetail={() => setShowIdentityModal(true)}
              isNarrowLayout={isNarrowLayout}
              onRequestOpenSidebar={() => setIsSidebarOpen(true)}
            />
          </div>

          {showUserSettings && (
            <div className="modal-overlay" onClick={() => setShowUserSettings(false)}>
              <div className="modal-content" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <span className="modal-title">Privacy & Security</span>
                  <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowUserSettings(false)}>
                    <X size={14} />
                  </button>
                </div>
                <div className="modal-body" style={{ padding: "20px 0" }}>

                  <div style={{ marginBottom: 32, borderBottom: '1px solid var(--border)', paddingBottom: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                      <Building2 size={14} color="var(--accent-primary)" />
                      <h4 style={{ fontSize: "0.9rem", fontWeight: 600 }}>Profile & Identity</h4>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div className="form-group">
                        <label className="label" style={{ fontSize: '0.7rem', marginBottom: 4, display: 'block' }}>Display Username</label>
                        <input 
                          className="input" 
                          value={editUsername} 
                          onChange={e => setEditUsername(e.target.value)}
                          placeholder="e.g. Satoshi"
                        />
                      </div>
                      
                      <div className="form-group">
                        <label className="label" style={{ fontSize: '0.7rem', marginBottom: 4, display: 'block' }}>Department / Team</label>
                        <input 
                          className="input" 
                          value={editDepartment} 
                          onChange={e => setEditDepartment(e.target.value)}
                          placeholder="e.g. Engineering"
                        />
                      </div>

                      <div className="form-group">
                        <label className="label" style={{ fontSize: '0.7rem', marginBottom: 8, display: 'block' }}>Current Status</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {(['online', 'away', 'offline'] as const).map(status => (
                            <button
                              key={status}
                              className={`btn btn-sm ${presenceByContact[session?.userId || ""] === status ? 'btn-primary' : 'btn-ghost'}`}
                              style={{ flex: 1, textTransform: 'capitalize', fontSize: '0.65rem' }}
                              onClick={() => void handlePresenceChange(status)}
                            >
                              <div style={{ 
                                width: 6, 
                                height: 6, 
                                borderRadius: '50%', 
                                background: status === 'online' ? 'var(--success)' : status === 'away' ? 'var(--warning)' : 'var(--text-muted)',
                                marginRight: 6
                              }} />
                              {status}
                            </button>
                          ))}
                        </div>
                      </div>

                      <button 
                        className="btn btn-primary btn-sm" 
                        style={{ marginTop: 8, justifyContent: 'center' }}
                        onClick={handleSaveProfile}
                        disabled={isSavingProfile}
                      >
                        {isSavingProfile ? <Loader2 size={12} className="spin" /> : "Save Profile Details"}
                      </button>
                    </div>
                  </div>
                  
                  <div style={{ marginBottom: 32 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <Monitor size={14} color="var(--accent-primary)" />
                      <h4 style={{ fontSize: "0.9rem", fontWeight: 600 }}>Active Sessions</h4>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {myDevices.map(d => (
                        <div key={d.id} className="panel" style={{ padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {d.device_name?.toLowerCase().includes('mobile') ? <Smartphone size={16} /> : <Monitor size={16} />}
                            <div>
                              <div style={{ fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                                {d.device_name || "Unknown Device"}
                                {d.id === myDeviceId.current && <span style={{ color: 'var(--accent-teal)', fontSize: '0.6rem' }}>(Current)</span>}
                              </div>
                              <div className="text-muted" style={{ fontSize: '0.65rem' }}>
                                Registered {new Date(d.created_at).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                          {d.id !== myDeviceId.current && (
                            <button 
                              className="btn btn-ghost btn-sm" 
                              style={{ color: 'var(--accent-danger)', fontSize: '0.65rem' }}
                              onClick={() => void handleRevokeOwnDevice(d.id)}
                              disabled={isRevokingDevice === d.id}
                            >
                              {isRevokingDevice === d.id ? <Loader2 size={10} className="spin" /> : "Revoke"}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginBottom: 32, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
                    <h4 style={{ fontSize: "0.9rem", marginBottom: 8, fontWeight: 600 }}>Data Portability</h4>
                    <p className="text-muted" style={{ fontSize: "0.8rem", marginBottom: 12 }}>
                      Export your locally stored chat history as a JSON file, or restore data from a previous export.
                    </p>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ flex: 1, justifyContent: "center" }}
                        onClick={async () => {
                          try {
                            const data = await vault.exportVaultData();
                            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `trustline-export-${new Date().toISOString().split('T')[0]}.json`;
                            a.click();
                            URL.revokeObjectURL(url);
                            void api.logSecurityEvent("DATA_EXPORT", { message_count: data.length });
                          } catch (err) {
                            console.error("Export failed", err);
                          }
                        }}
                      >
                        Export Vault (.json)
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ flex: 1, justifyContent: "center" }}
                        onClick={() => {
                          const input = document.createElement("input");
                          input.type = "file";
                          input.accept = ".json";
                          input.onchange = async (e: any) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = async (re) => {
                              try {
                                const data = JSON.parse(re.target?.result as string);
                                await vault.importVaultData(data);
                                addToast(`Successfully imported ${data.length} messages.`, "success");
                                void api.logSecurityEvent("VAULT_RESTORE", { message_count: data.length });
                                setShowUserSettings(false);
                                if (activeContact) void startChat(activeContact);
                              } catch (err) {
                                addToast("Failed to import vault data. Invalid file format.", "error");
                              }
                            };
                            reader.readAsText(file);
                          };
                          input.click();
                        }}
                      >
                        <FileUp size={12} /> Import Vault
                      </button>
                    </div>
                  </div>

                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                    <h4 style={{ fontSize: "0.9rem", marginBottom: 8, color: "var(--accent-danger)", fontWeight: 600 }}>Danger Zone</h4>
                    <button
                      className="btn btn-danger btn-sm"
                      style={{ width: "100%", justifyContent: "center" }}
                      onClick={() => {
                        setShowUserSettings(false);
                        void handleLogout();
                      }}
                    >
                      <LogOut size={12} /> Sign out and Clear Session
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {showIdentityModal && activeContact && localKeys.current && (
            <IdentityModal
              contact={activeContact}
              localKeys={localKeys.current}
              onClose={() => setShowIdentityModal(false)}
            />
          )}

          {showStoryCreator && (
            <div className="modal-overlay" style={{ zIndex: 200 }}>
              <div className="modal-content" style={{ maxWidth: 400, padding: 24, background: 'var(--bg-void)', border: '1px solid var(--accent-primary)' }}>
                <h3 style={{ marginBottom: 16 }}>Create Status Update</h3>
                <textarea 
                  className="input" 
                  style={{ minHeight: 120, fontSize: '1.2rem', textAlign: 'center', background: 'var(--surface-1)' }}
                  placeholder="What's on your mind?"
                  value={storyText}
                  onChange={e => setStoryStoryText(e.target.value)}
                />
                <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
                   <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowStoryCreator(false)}>Cancel</button>
                   <button className="btn btn-primary" style={{ flex: 2 }} onClick={() => void handlePostStory(storyText)} disabled={isPostingStory}>
                      {isPostingStory ? <Loader2 size={14} className="spin" /> : "Post Story"}
                   </button>
                </div>
              </div>
            </div>
          )}

          {activeStoryUser && (
            <div className="modal-overlay" style={{ zIndex: 300, background: 'rgba(0,0,0,0.9)' }}>
               <div style={{ position: 'absolute', top: 20, right: 20 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setActiveStoryUser(null)}><X size={24} /></button>
               </div>
               <StoryViewer 
                  user={activeStoryUser} 
                  stories={allStories.filter(s => s.user_id === activeStoryUser.id)} 
                  onClose={() => setActiveStoryUser(null)}
               />
            </div>
          )}
        </div>
  );
}

function StoryViewer({ user, stories, onClose }: { user: Contact, stories: any[], onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [decryptedText, setDecryptedText] = useState("Decrypting...");
  const currentStory = stories[index];

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!currentStory) return;
      const keyInfo = await vault.getStoryKey(user.id);
      if (!keyInfo) {
        if (active) setDecryptedText("Locked: No story key received yet.");
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
        console.error("Story decryption failed", err);
        if (active) setDecryptedText("Failed to decrypt story.");
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
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%', maxWidth: 500, margin: '0 auto', color: 'white', textAlign: 'center' }}>
       <div style={{ display: 'flex', gap: 4, width: '100%', position: 'absolute', top: 60, padding: '0 20px' }}>
          {stories.map((_, i) => (
            <div key={i} style={{ flex: 1, height: 2, background: i <= index ? 'var(--accent-primary)' : 'rgba(255,255,255,0.2)' }} />
          ))}
       </div>
       <div style={{ marginBottom: 32, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="avatar" style={{ width: 40, height: 40 }}>{getInitials(user.username || user.email)}</div>
          <div style={{ textAlign: 'left' }}>
             <div style={{ fontWeight: 600 }}>{user.username || user.email}</div>
             <div style={{ fontSize: '0.7rem', opacity: 0.7 }}>{new Date(currentStory?.created_at).toLocaleString()}</div>
          </div>
       </div>
       <div style={{ fontSize: '2rem', lineHeight: 1.4, padding: '0 20px' }}>
          {decryptedText}
       </div>
    </div>
  );
}

