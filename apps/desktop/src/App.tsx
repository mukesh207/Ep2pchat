import { useState, useEffect, useRef } from "react";
import {
  Shield, Search, Send, LogOut, Users, ClipboardList,
  Settings, CheckCircle, AlertTriangle, Lock, Zap,
  ChevronRight, User, Activity, XCircle, ShieldOff,
  Cpu, Key, Eye, MessageSquare, RefreshCw,
} from "lucide-react";
import * as api from "./api";
import * as crypto from "./lib/crypto";
import * as vault from "./lib/vault";
import { socket, WsMessage } from "./lib/socket";
import "./App.css";
import StatusTicker from "./components/StatusTicker";
import EncryptionSpinner from "./components/EncryptionSpinner";

/* ── Types ─────────────────────────────────────────────────── */
type View = "HOME" | "WAITING" | "REGISTER" | "DASHBOARD" | "ADMIN" | "CHAT";

interface Message {
  id: string;
  sender: string;
  text: string;
  timestamp: string;
  is_me: boolean;
}

interface Contact {
  id: string;
  email: string;
  status?: string;
  device_count?: number;
  devices?: any[];
}

/* ── Demo Data ─────────────────────────────────────────────── */
const DEMO_CONTACTS: Contact[] = [
  { id: "1", email: "alice@blacksite.io",   status: "active", device_count: 2,
    devices: [{ device_id: "d1", identity_key: "", signed_pre_key: "", one_time_pre_key: null }] },
  { id: "2", email: "charlie@blacksite.io", status: "active", device_count: 1,
    devices: [{ device_id: "d2", identity_key: "", signed_pre_key: "", one_time_pre_key: null }] },
  { id: "3", email: "ops-admin@nexacore.dev", status: "active", device_count: 3,
    devices: [{ device_id: "d3", identity_key: "", signed_pre_key: "", one_time_pre_key: null }] },
  { id: "4", email: "sec@archivist.net",    status: "active", device_count: 1,
    devices: [{ device_id: "d4", identity_key: "", signed_pre_key: "", one_time_pre_key: null }] },
];

const DEMO_MESSAGES: Record<string, Message[]> = {
  "1": [
    { id: "m1", sender: "them", text: "Authentication layer is live. X3DH confirmed on all nodes.", timestamp: new Date(Date.now() - 8 * 60000).toISOString(), is_me: false },
    { id: "m2", sender: "me",   text: "Acknowledged. RLS policies enforced on pgvault-01. Zero exposure.", timestamp: new Date(Date.now() - 6 * 60000).toISOString(), is_me: true  },
    { id: "m3", sender: "them", text: "OPK bundle refreshed. 50 new one-time keys uploaded to keyserver.", timestamp: new Date(Date.now() - 4 * 60000).toISOString(), is_me: false },
    { id: "m4", sender: "me",   text: "Copy that. Stand by — rotating signed pre-key in 24h window.", timestamp: new Date(Date.now() - 2 * 60000).toISOString(), is_me: true  },
    { id: "m5", sender: "them", text: "All comms remain zero-knowledge. Server-side blindness verified.", timestamp: new Date(Date.now() - 30000).toISOString(), is_me: false },
  ],
  "2": [
    { id: "m6", sender: "me",   text: "Deploy window confirmed: 0200 UTC. Infra team is on standby.", timestamp: new Date(Date.now() - 20 * 60000).toISOString(), is_me: true  },
    { id: "m7", sender: "them", text: "Traefik wildcard cert renewed. Prod stack is ready for `docker compose up`.", timestamp: new Date(Date.now() - 15 * 60000).toISOString(), is_me: false },
  ],
};

/* ═══════════════════════════════════════════════════════════ */
/*  ROOT COMPONENT                                             */
/* ═══════════════════════════════════════════════════════════ */
function App() {
  const [email, setEmail]         = useState("");
  const [view, setView]           = useState<View>("HOME");
  const [userId, setUserId]       = useState<string | null>(null);
  const [orgId, setOrgId]         = useState<string | null>(null);
  const [error, setError]         = useState("");
  const [isDemo, setIsDemo]       = useState(false);

  const [contacts, setContacts]           = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery]     = useState("");
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const [messages, setMessages]           = useState<Message[]>([]);
  const [inputText, setInputText]         = useState("");
  const [isHandshaking, setIsHandshaking] = useState(false);

  const localKeys  = useRef<crypto.KeyBundle | null>(null);
  const myDeviceId = useRef<string | null>(null);
  const feedEnd    = useRef<HTMLDivElement>(null);

  /* ── Init ─────────────────────────────────────────────────── */
  useEffect(() => {
    (async () => {
      try {
        const keys = await vault.getLocalKeys();
        if (keys) {
          localKeys.current = {
            identity_public: keys.identity_public, identity_secret: keys.identity_secret,
            signed_pre_key_public: keys.signed_pre_key_public, signed_pre_key_secret: keys.signed_pre_key_secret,
            signed_pre_key_signature: keys.signed_pre_key_signature, one_time_pre_keys: [],
          };
        }
      } catch { /* vault not available in browser demo */ }
    })();

    try {
      socket.onMessage((msg: WsMessage) => {
        if (msg.type === "MESSAGE_RECEIVE") handleIncomingMessage(msg.payload);
      });
    } catch { /* ws not available in browser demo */ }
  }, []);

  useEffect(() => {
    feedEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ── Demo Mode ────────────────────────────────────────────── */
  const enterDemoMode = () => {
    setIsDemo(true);
    setEmail("operator@trustline.io");
    setContacts(DEMO_CONTACTS);
    setView("DASHBOARD");
  };

  /* ── Incoming decrypt ─────────────────────────────────────── */
  const handleIncomingMessage = async (payload: any) => {
    if (!localKeys.current) return;
    try {
      const plaintext = await crypto.bobDecrypt(
        localKeys.current.identity_secret, localKeys.current.signed_pre_key_secret, null,
        payload.sender_identity_key, payload.ephemeral_public_key, payload.ciphertext, payload.nonce
      );
      const newMsg: Message = {
        id: payload.message_id, sender: payload.sender_device_id,
        text: plaintext, timestamp: payload.timestamp, is_me: false,
      };
      try { await vault.saveMessage(newMsg); } catch {}
      setMessages(prev => [...prev, newMsg]);
    } catch {}
  };

  /* ── Auth flows ───────────────────────────────────────────── */
  const handleRequestAccess = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    try {
      const res = await api.requestAccess(email);
      if (res.error) throw new Error(res.error);
      setUserId(res.user_id);
      if (res.status === "active") await handleLogin(email, res.user_id);
      else setView("WAITING");
    } catch (err: any) { setError(err.message || "Backend unreachable — use Demo Mode"); }
  };

  const handleLogin = async (loginEmail: string, uid: string) => {
    try {
      const res = await api.loginPasskey(loginEmail);
      if (res.error) throw new Error(res.error);
      api.setToken(res.token); setUserId(uid); setOrgId(res.org_id);
      if (!localKeys.current) setView("REGISTER"); else startSession();
    } catch (err: any) {
      setError("Login failed. " + err.message);
      if (err.message?.includes("No passkeys found") && uid) setView("REGISTER");
    }
  };

  const handleRegisterPasskey = async () => {
    if (!userId || !orgId) return; setError("");
    try {
      const keys = await crypto.generateKeys(); localKeys.current = keys;
      try { await vault.saveLocalKeys(keys); } catch {}
      const uploadRes = await api.uploadKeys({
        user_id: userId, org_id: orgId, device_name: "Desktop App",
        identity_key: keys.identity_public, signed_pre_key: keys.signed_pre_key_public,
        signed_pre_key_sig: keys.signed_pre_key_signature,
        one_time_pre_keys: keys.one_time_pre_keys.map((k: any) => ({ key_id: k.key_id, public_key: k.public_key })),
      });
      if (uploadRes.error) throw new Error(uploadRes.error);
      myDeviceId.current = uploadRes.device_id;
      const res = await api.registerPasskey(userId);
      if (res.error) throw new Error(res.error);
      startSession();
    } catch (err: any) { setError(err.message); }
  };

  const startSession = async () => {
    try { socket.connect(api.getToken()); } catch {}
    try { const res = await api.getUsers(); if (res.users) setContacts(res.users); } catch {}
    setView("DASHBOARD");
  };

  /* ── Chat ─────────────────────────────────────────────────── */
  const startChat = async (contact: Contact) => {
    setIsHandshaking(true); setActiveContact(contact); setView("CHAT");

    if (isDemo) {
      setTimeout(() => {
        setMessages(DEMO_MESSAGES[contact.id] || []);
        setIsHandshaking(false);
      }, 1100);
      return;
    }

    try {
      const history = await vault.getMessages(contact.id) as any[];
      setMessages(history.map(m => ({
        id: m.id, sender: m.is_me ? "me" : m.sender_id,
        text: m.content, timestamp: m.timestamp, is_me: m.is_me
      })));
    } catch {}
    try {
      const res = await api.getUserKeys(contact.id);
      contact.devices = res.devices;
      setTimeout(() => setIsHandshaking(false), 900);
    } catch { setError("Failed to fetch contact keys"); setIsHandshaking(false); }
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !activeContact) return;

    const myMsg: Message = {
      id: `msg-${Date.now()}`, sender: "me", text: inputText,
      timestamp: new Date().toISOString(), is_me: true,
    };

    if (isDemo) {
      setMessages(prev => [...prev, myMsg]);
      setInputText("");
      // Simulate a canned reply in demo mode
      const replies = [
        "Copy. Transmission received — end-to-end encryption confirmed.",
        "Roger that. All metadata purged from relay nodes.",
        "Acknowledged. Double ratchet ratcheted forward.",
        "Understood. Pre-key bundle refreshed on keyserver.",
        "Affirmative. Forward secrecy maintained.",
      ];
      const replyIdx = Math.floor(Math.random() * replies.length);
      setTimeout(() => {
        setMessages(prev => [...prev, {
          id: `reply-${Date.now()}`, sender: "them",
          text: replies[replyIdx],
          timestamp: new Date().toISOString(), is_me: false,
        }]);
      }, 900 + Math.random() * 600);
      return;
    }

    if (!localKeys.current) return;
    const targetDevice = activeContact.devices?.[0];
    if (!targetDevice) return;
    try {
      const [ephemeralPk, payload] = await crypto.aliceEncrypt(
        localKeys.current.identity_secret, targetDevice.identity_key,
        targetDevice.signed_pre_key, targetDevice.one_time_pre_key?.public_key || null, inputText
      );
      socket.send("MESSAGE_SEND", {
        recipient_device_id: targetDevice.device_id, ciphertext: payload.ciphertext,
        ephemeral_public_key: ephemeralPk, nonce: payload.nonce,
      });
      try { await vault.saveMessage(myMsg); } catch {}
      setMessages(prev => [...prev, myMsg]); setInputText("");
    } catch {}
  };

  const filteredContacts = contacts.filter(c =>
    c.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  /* ── Routing ──────────────────────────────────────────────── */
  if (view === "HOME" || view === "WAITING" || view === "REGISTER") {
    return (
      <OnboardingScreen
        view={view} email={email} error={error}
        onEmailChange={setEmail} onSubmit={handleRequestAccess}
        onRegister={handleRegisterPasskey} onBack={() => setView("HOME")}
        onAdminAccess={() => setView("ADMIN")} onDemoMode={enterDemoMode}
      />
    );
  }

  if (view === "ADMIN") return <AdminPanel onBack={() => setView("HOME")} />;

  /* ── Dashboard / Chat ─────────────────────────────────────── */
  return (
    <div className="app-container">

      {/* ── TOP BAR ────────────────────────────────────────── */}
      <header className="top-bar">
        <div className="top-bar-logo">
          <Shield size={16} strokeWidth={1.5} />
          TRUSTLINE
          <span className="top-bar-version">v0.1 · E2EE</span>
          {isDemo && (
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: "0.58rem",
              background: "rgba(240,165,0,0.12)", border: "1px solid var(--accent-primary)",
              color: "var(--accent-primary)", padding: "2px 7px", letterSpacing: "0.1em"
            }}>DEMO</span>
          )}
        </div>

        <StatusTicker />

        <div className="top-bar-meta">
          <div className="meta-item active-status">
            <span className="status-dot active" />
            SECURE
          </div>
          <div className="meta-item">
            <Activity size={10} />
            {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
          <div className="meta-item">
            <Users size={10} />
            {contacts.length} NODES
          </div>
        </div>
      </header>

      {/* ── BODY ───────────────────────────────────────────── */}
      <div className="app-body">

        {/* ── SIDEBAR ────────────────────────────────────── */}
        <aside className="sidebar">
          <div className="sidebar-section-header">
            <span className="sidebar-section-title">CONTACTS</span>
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
                placeholder="Search identities..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="contact-list">
            {filteredContacts.map((c, i) => (
              <div
                key={c.id}
                id={`contact-${c.id}`}
                className={`contact-item${activeContact?.id === c.id ? " active" : ""}`}
                style={{ animationDelay: `${i * 0.05}s` }}
                onClick={() => startChat(c)}
              >
                <div className="avatar">{c.email[0].toUpperCase()}</div>
                <div className="contact-item-info">
                  <div className="contact-item-email">{c.email}</div>
                  <div className="contact-item-sub">
                    <Lock size={9} style={{ display: "inline", marginRight: 3, verticalAlign: "middle" }} />
                    {(DEMO_MESSAGES[c.id]?.length ?? 0) > 0
                      ? `${DEMO_MESSAGES[c.id]?.length} messages`
                      : "E2EE CHANNEL"}
                  </div>
                </div>
                {activeContact?.id === c.id
                  ? <span className="status-dot active" />
                  : <ChevronRight size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                }
              </div>
            ))}
            {filteredContacts.length === 0 && (
              <div className="empty-contacts">NO IDENTITIES FOUND</div>
            )}
          </div>

          {/* System Stats Strip (HUD-style) */}
          <div className="sidebar-stats">
            <div className="stat-item">
              <span className="hud-label">SESSIONS</span>
              <span className="hud-value">{contacts.length}</span>
            </div>
            <div className="stat-divider" />
            <div className="stat-item">
              <span className="hud-label">CIPHER</span>
              <span className="hud-value" style={{ fontSize: "0.65rem" }}>XC20P</span>
            </div>
            <div className="stat-divider" />
            <div className="stat-item">
              <span className="hud-label">KEYS</span>
              <span className="hud-value" style={{ color: "var(--accent-teal)" }}>OK</span>
            </div>
          </div>

          {/* Footer */}
          <div className="sidebar-footer">
            <div className="avatar" style={{ width: 30, height: 30, fontSize: "0.7rem" }}>
              {email ? email[0].toUpperCase() : "U"}
            </div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-email">{email || "Unknown"}</div>
              <div className="sidebar-user-status">
                <span className="status-dot active" />
                VAULT OPEN
              </div>
            </div>
            <button
              id="logout-btn"
              className="btn btn-ghost btn-sm"
              title="Sign out"
              onClick={() => { setView("HOME"); setContacts([]); setActiveContact(null); setMessages([]); setIsDemo(false); }}
            >
              <LogOut size={12} />
            </button>
          </div>
        </aside>

        {/* ── CHAT ARENA ─────────────────────────────────── */}
        <main className="chat-arena">
          {activeContact ? (
            <>
              {/* Chat Header */}
              <header className="chat-header" id="chat-header">
                <div className="chat-header-info">
                  <div className="avatar" style={{ width: 30, height: 30, fontSize: "0.72rem", flexShrink: 0 }}>
                    {activeContact.email[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="chat-header-name">{activeContact.email}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.58rem", color: "var(--text-muted)" }}>
                      {activeContact.device_count ?? 1} DEVICE{(activeContact.device_count ?? 1) !== 1 ? "S" : ""} REGISTERED
                    </div>
                  </div>
                  {isHandshaking ? (
                    <span className="chat-header-handshaking">
                      <Zap size={11} /> ESTABLISHING SECURE CHANNEL...
                    </span>
                  ) : (
                    <span className="chat-header-enc-badge">
                      <Shield size={10} strokeWidth={2} /> E2E ENCRYPTED
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    fontFamily: "var(--font-mono)", fontSize: "0.6rem",
                    color: "var(--text-muted)", textAlign: "right", lineHeight: 1.6
                  }}>
                    <div>CURVE25519</div>
                    <div style={{ color: "var(--accent-teal)" }}>XCHACHA20-POLY1305</div>
                  </div>
                  <button
                    id="close-chat-btn"
                    className="btn btn-ghost btn-sm"
                    onClick={() => { setActiveContact(null); setView("DASHBOARD"); setMessages([]); }}
                  >
                    <XCircle size={12} /> CLOSE
                  </button>
                </div>
              </header>

              {/* Messages or spinner */}
              {isHandshaking ? (
                <EncryptionSpinner />
              ) : (
                <div className="messages-feed" id="messages-feed">
                  {/* Session info banner */}
                  <div className="session-banner">
                    <Shield size={11} />
                    SESSION SECURED — X3DH HANDSHAKE COMPLETE · FORWARD SECRECY ACTIVE
                  </div>

                  {messages.map((m) => (
                    <div
                      key={m.id}
                      id={`msg-${m.id}`}
                      className={`message-bubble ${m.is_me || m.sender === "me" ? "me" : "them"}`}
                    >
                      <div className="bubble-content">{m.text}</div>
                      <div className="message-meta">
                        {m.is_me || m.sender === "me" ? (
                          <><CheckCircle size={8} style={{ color: "var(--accent-success)" }} /> SENT · ENCRYPTED</>
                        ) : (
                          <><Lock size={8} style={{ color: "var(--accent-teal)" }} /> RECEIVED · DECRYPTED</>
                        )}
                        &nbsp;·&nbsp;
                        {new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  ))}

                  {messages.length === 0 && (
                    <div className="chat-empty-state">
                      <MessageSquare size={24} strokeWidth={1} style={{ color: "var(--text-muted)" }} />
                      <div>SECURE CHANNEL OPEN</div>
                      <div style={{ color: "var(--text-muted)", fontSize: "0.65rem" }}>
                        SEND THE FIRST ENCRYPTED MESSAGE
                      </div>
                    </div>
                  )}
                  <div ref={feedEnd} />
                </div>
              )}

              {/* Composer */}
              {!isHandshaking && (
                <div className="composer">
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    fontFamily: "var(--font-mono)", fontSize: "0.6rem",
                    color: "var(--accent-primary)", flexShrink: 0
                  }}>
                    <Lock size={11} />
                    E2EE
                  </div>
                  <div className="composer-input-wrap">
                    <input
                      id="message-input"
                      className="input"
                      placeholder="Compose encrypted message..."
                      value={inputText}
                      onChange={e => setInputText(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && sendMessage()}
                      autoComplete="off"
                    />
                    <span className="composer-key-hint">↵</span>
                  </div>
                  <button
                    id="send-btn"
                    className="btn btn-primary"
                    onClick={sendMessage}
                    disabled={!inputText.trim()}
                  >
                    <Send size={13} /> TRANSMIT
                  </button>
                </div>
              )}
            </>
          ) : (
            <EmptyState />
          )}
        </main>

      </div>
    </div>
  );
}

/* ─── Empty Chat State ─────────────────────────────────────── */
function EmptyState() {
  return (
    <div className="empty-state" id="empty-state">
      {/* Decorative hex grid */}
      <svg width="120" height="100" viewBox="0 0 120 100" style={{ opacity: 0.08, position: "absolute" }}>
        {[0, 1, 2].flatMap(row =>
          [0, 1, 2, 3].map(col => {
            const x = col * 32 + (row % 2) * 16;
            const y = row * 28;
            const pts = Array.from({ length: 6 }, (_, i) => {
              const a = (Math.PI / 180) * (60 * i - 30);
              return `${x + 14 * Math.cos(a)},${y + 14 * Math.sin(a)}`;
            }).join(" ");
            return <polygon key={`${row}-${col}`} points={pts} fill="none" stroke="#f0a500" strokeWidth="0.5" />;
          })
        )}
      </svg>

      <div className="empty-state-icon">
        <Shield size={32} strokeWidth={1} />
      </div>
      <h3>SECURE VAULT READY</h3>
      <p>
        Select a verified identity from the contact<br />
        roster to initiate a zero-knowledge<br />
        encrypted conversation.
      </p>
      <div style={{
        display: "flex", gap: 20, marginTop: 8,
      }}>
        {[
          { icon: <Key size={11} />, label: "X3DH" },
          { icon: <RefreshCw size={11} />, label: "DBL-RATCHET" },
          { icon: <Cpu size={11} />, label: "LIBSODIUM" },
        ].map(b => (
          <div key={b.label} style={{
            display: "flex", alignItems: "center", gap: 5,
            fontFamily: "var(--font-mono)", fontSize: "0.6rem",
            color: "var(--text-muted)",
          }}>
            <span style={{ color: "var(--accent-primary)" }}>{b.icon}</span>
            {b.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  ONBOARDING SCREEN                                          */
/* ═══════════════════════════════════════════════════════════ */
interface OnboardingProps {
  view: "HOME" | "WAITING" | "REGISTER";
  email: string; error: string;
  onEmailChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onRegister: () => void;
  onBack: () => void;
  onAdminAccess: () => void;
  onDemoMode: () => void;
}

function OnboardingScreen({
  view, email, error, onEmailChange, onSubmit, onRegister, onBack, onAdminAccess, onDemoMode
}: OnboardingProps) {


  return (
    <div className="onboarding-bg">
      {/* Ambient corner brackets */}
      {(["tl","tr","bl","br"] as const).map(pos => (
        <div key={pos} className={`corner-frame corner-frame-${pos}`} />
      ))}

      {/* Binary noise background */}
      <div className="binary-bg" aria-hidden="true">
        {Array(300).fill("0 1").join("  ")}
      </div>

      {/* Radial glow */}
      <div className="onboarding-glow" />

      {/* Card */}
      <div className="onboarding-card">
        <div className="bracket-tl" /><div className="bracket-tr" />
        <div className="bracket-bl" /><div className="bracket-br" />

        {/* Logo */}
        <div className="onboarding-logo">
          <div className="onboarding-hex-icon">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ display: "block" }}>
              <polygon
                points="24,3 44,13 44,35 24,45 4,35 4,13"
                fill="rgba(240,165,0,0.08)"
                stroke="var(--accent-primary)" strokeWidth="1.5"
              />
              <path d="M16 24l6 6 10-12" stroke="var(--accent-primary)" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="onboarding-logo-text">TRUSTLINE</div>
          <div className="onboarding-logo-sub">ENTERPRISE E2EE MESSAGING PLATFORM</div>
        </div>

        {/* Error */}
        {error && (
          <div className="error-banner">
            <AlertTriangle size={13} />{error}
          </div>
        )}

        {/* ── HOME ── */}
        {view === "HOME" && (
          <form onSubmit={onSubmit}>
            <div className="form-group">
              <label className="onboarding-form-label" htmlFor="email-input">
                CORPORATE IDENTITY
              </label>
              <input
                id="email-input"
                className="input"
                type="email"
                value={email}
                onChange={e => onEmailChange(e.target.value)}
                placeholder="operator@organization.com"
                required autoComplete="off"
              />
            </div>

            <button id="enter-btn" type="submit" className="btn btn-primary btn-full">
              <Shield size={14} /> REQUEST SECURE ACCESS
            </button>

            <div className="onboarding-divider"><span>OR</span></div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                id="demo-btn"
                type="button"
                className="btn btn-teal btn-full"
                onClick={onDemoMode}
              >
                <Eye size={13} /> DEMO MODE
              </button>
              <button
                id="admin-btn"
                type="button"
                className="btn btn-danger btn-full"
                onClick={onAdminAccess}
              >
                <ShieldOff size={13} /> ADMIN
              </button>
            </div>

            {/* Security badges */}
            <div className="security-badges">
              {[
                { icon: <Lock size={10} />,    label: "E2EE" },
                { icon: <Shield size={10} />,  label: "ZERO-KNOWLEDGE" },
                { icon: <Zap size={10} />,     label: "FIDO2 / PASSKEY" },
                { icon: <Key size={10} />,     label: "X3DH" },
              ].map(b => (
                <div key={b.label} className="security-badge">
                  <span style={{ color: "var(--accent-primary)" }}>{b.icon}</span>
                  {b.label}
                </div>
              ))}
            </div>
          </form>
        )}

        {/* ── WAITING ── */}
        {view === "WAITING" && (
          <div className="status-card">
            <div className="status-spinner-wrap">
              <svg className="status-spinner-svg" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r="24" fill="none" stroke="var(--accent-primary)"
                  strokeWidth="1" strokeDasharray="12 6" opacity="0.5" />
                <circle cx="28" cy="4" r="3" fill="var(--accent-primary)" />
              </svg>
              <div className="status-spinner-icon"><User size={20} color="var(--accent-primary)" strokeWidth={1.5} /></div>
            </div>
            <div className="status-card-title">IDENTITY PENDING APPROVAL</div>
            <div className="status-card-desc">
              Access request transmitted.<br />
              A Tenant Administrator must authorize<br />your identity before vault access is granted.
            </div>
            <div className="boot-bar-wrap">
              <div className="boot-bar-label">
                <span>AWAITING ADMIN AUTHORIZATION</span>
                <span style={{ color: "var(--accent-primary)", animation: "blink 1s infinite" }}>●●●</span>
              </div>
              <div className="boot-bar-track"><div className="boot-bar-fill" style={{ width: "60%", animation: "none" }} /></div>
            </div>
            <button id="back-btn" className="btn btn-ghost btn-full" onClick={onBack} style={{ marginTop: 20 }}>
              BACK
            </button>
          </div>
        )}

        {/* ── REGISTER ── */}
        {view === "REGISTER" && (
          <div className="status-card">
            <div style={{ margin: "0 auto 20px", color: "var(--accent-success)", display: "flex", justifyContent: "center" }}>
              <CheckCircle size={40} strokeWidth={1.5} style={{ filter: "drop-shadow(0 0 10px var(--accent-success))" }} />
            </div>
            <div className="status-card-title" style={{ color: "var(--accent-success)" }}>ACCESS APPROVED</div>
            <div className="status-card-desc">
              Identity verified by tenant administrator.<br />
              Generating cryptographic key material<br />via libsodium X25519 primitives.
            </div>
            <div className="boot-bar-wrap">
              <div className="boot-bar-label">
                <span>GENERATING IDENTITY KEYPAIR</span>
                <span style={{ color: "var(--accent-teal)" }}>READY</span>
              </div>
              <div className="boot-bar-track"><div className="boot-bar-fill" /></div>
            </div>
            <button id="init-vault-btn" className="btn btn-primary btn-full" onClick={onRegister}>
              <Lock size={14} /> INITIALIZE SECURE VAULT
            </button>
          </div>
        )}
      </div>

      {/* Footer tagline */}
      <div className="onboarding-footer">
        <span className="status-dot active" />
        ZERO-KNOWLEDGE · SERVER-SIDE BLINDNESS ENFORCED · TENANT-ISOLATED RLS
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  ADMIN PANEL                                                */
/* ═══════════════════════════════════════════════════════════ */
type AdminTab = "PENDING" | "USERS" | "LOGS" | "SETTINGS";

function AdminPanel({ onBack }: { onBack: () => void }) {
  const [tab, setTab]   = useState<AdminTab>("PENDING");
  const [data, setData] = useState<any[]>([]);

  const fetchData = async () => {
    try {
      if (tab === "PENDING")  { const r = await api.getPendingUsers(); setData(r.users || []); }
      if (tab === "USERS")    { const r = await api.getAllUsers();     setData(r.users || []); }
      if (tab === "LOGS")     { const r = await api.getAuditLogs();   setData(r.logs  || []); }
      if (tab === "SETTINGS") setData([]);
    } catch { setData([]); }
  };

  useEffect(() => { fetchData(); }, [tab]);

  const handleApprove = async (id: string) => {
    try { await api.approveUser(id); fetchData(); } catch {}
  };

  const NAV: { key: AdminTab; label: string; icon: React.ReactNode; color?: string }[] = [
    { key: "PENDING",  label: "PENDING",   icon: <AlertTriangle size={13} />, color: "var(--accent-warn)" },
    { key: "USERS",    label: "ROSTER",    icon: <Users         size={13} /> },
    { key: "LOGS",     label: "AUDIT LOG", icon: <ClipboardList size={13} /> },
    { key: "SETTINGS", label: "POLICIES",  icon: <Settings      size={13} /> },
  ];

  return (
    <div className="admin-wrap">
      <header className="admin-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ShieldOff size={15} color="var(--accent-danger)" strokeWidth={1.5} />
          <span className="admin-header-title">IT ADMIN CONSOLE</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.57rem", color: "var(--text-muted)", letterSpacing: "0.08em" }}>
            ⚠ UNAUTHORIZED ACCESS IS A FEDERAL CRIME
          </span>
        </div>
        <button id="admin-exit-btn" className="btn btn-ghost btn-sm" onClick={onBack}>
          <LogOut size={12} /> EXIT
        </button>
      </header>

      <div className="admin-body">
        <nav className="admin-nav">
          {NAV.map(item => (
            <div
              key={item.key}
              id={`admin-nav-${item.key.toLowerCase()}`}
              className={`admin-nav-item${tab === item.key ? " active" : ""}`}
              onClick={() => setTab(item.key)}
            >
              {item.icon}{item.label}
            </div>
          ))}
        </nav>

        <div className="admin-content">
          {/* PENDING */}
          {tab === "PENDING" && (
            <>
              <div className="section-header">
                <AlertTriangle size={14} color="var(--accent-warn)" />
                <span className="section-header-title">PENDING APPROVALS</span>
                {data.length > 0 && <span className="section-header-count">{data.length}</span>}
              </div>
              {data.length === 0 ? (
                <div className="admin-empty">NO PENDING ACCESS REQUESTS</div>
              ) : (
                <table className="admin-table">
                  <thead><tr><th>IDENTITY</th><th>STATUS</th><th>ACTION</th></tr></thead>
                  <tbody>{data.map(u => (
                    <tr key={u.id}>
                      <td><div className="user-cell"><div className="avatar" style={{ width: 26, height: 26, fontSize: "0.65rem" }}>{u.email[0].toUpperCase()}</div>{u.email}</div></td>
                      <td><span className="status-badge pending">PENDING</span></td>
                      <td><button id={`approve-${u.id}`} className="btn btn-teal btn-sm" onClick={() => handleApprove(u.id)}><CheckCircle size={11} /> APPROVE</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </>
          )}

          {/* USERS */}
          {tab === "USERS" && (
            <>
              <div className="section-header">
                <Users size={14} color="var(--accent-primary)" />
                <span className="section-header-title">IDENTITY ROSTER</span>
                <span className="section-header-count">{data.length}</span>
              </div>
              {data.length === 0 ? (
                <div className="admin-empty">NO REGISTERED IDENTITIES</div>
              ) : (
                <table className="admin-table">
                  <thead><tr><th>IDENTITY</th><th>DEVICES</th><th>STATUS</th><th>ACTION</th></tr></thead>
                  <tbody>{data.map(u => (
                    <tr key={u.id}>
                      <td><div className="user-cell"><div className="avatar" style={{ width: 26, height: 26, fontSize: "0.65rem" }}>{u.email[0].toUpperCase()}</div>{u.email}</div></td>
                      <td><span className="mono-cell">{u.device_count || 0}</span></td>
                      <td><span className={`status-badge ${u.status}`}>{u.status?.toUpperCase()}</span></td>
                      <td><button id={`revoke-${u.id}`} className="btn btn-danger btn-sm"><XCircle size={11} /> REVOKE</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </>
          )}

          {/* LOGS */}
          {tab === "LOGS" && (
            <>
              <div className="section-header">
                <ClipboardList size={14} color="var(--accent-teal)" />
                <span className="section-header-title">AUDIT LOG</span>
              </div>
              {data.length === 0 ? (
                <div className="admin-empty">NO AUDIT EVENTS RECORDED</div>
              ) : (
                <div className="log-list">{data.map(l => (
                  <div key={l.id} className="log-entry">
                    <div className="log-entry-header">
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--accent-primary)" }}>{l.action}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.62rem", color: "var(--text-muted)" }}>{new Date(l.created_at).toLocaleString()}</span>
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: 6 }}>
                      ACTOR: <span style={{ color: "var(--text-primary)" }}>{l.actor_email || "SYSTEM"}</span>
                    </div>
                    <pre className="log-pre">{JSON.stringify(l.details, null, 2)}</pre>
                  </div>
                ))}</div>
              )}
            </>
          )}

          {/* SETTINGS */}
          {tab === "SETTINGS" && (
            <>
              <div className="section-header">
                <Settings size={14} color="var(--text-secondary)" />
                <span className="section-header-title">OPERATIONAL POLICIES</span>
              </div>
              <div className="settings-grid">
                <div className="settings-card">
                  <div className="settings-card-label">DATA RETENTION POLICY</div>
                  <select className="settings-select">
                    <option>Forever</option>
                    <option>30 Days (Standard)</option>
                    <option>7 Days (Strict)</option>
                    <option>24 Hours (Ephemeral)</option>
                  </select>
                  <div className="settings-card-hint">AUTOMATED PURGE OF ENCRYPTED METADATA FROM SERVER STORAGE</div>
                </div>

                <div className="settings-card">
                  <div className="settings-card-label">IDENTITY REGISTRATION</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <input type="checkbox" defaultChecked id="reg-toggle" style={{ accentColor: "var(--accent-primary)", width: 14, height: 14 }} />
                    <label htmlFor="reg-toggle" style={{ fontSize: "0.85rem" }}>Allow new identity access requests</label>
                  </div>
                </div>

                <div className="settings-card">
                  <div className="settings-card-label">NATS JETSTREAM STATUS</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="status-dot warn" />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--accent-warn)" }}>NOT CONNECTED</span>
                  </div>
                  <div className="settings-card-hint">HORIZONTAL SCALING DISABLED — START DOCKER COMPOSE TO ENABLE</div>
                </div>
              </div>

              <div className="hud-divider" style={{ margin: "16px 0" }} />
              <div style={{ display: "flex", gap: 10 }}>
                <button id="wipe-vault-btn" className="btn btn-danger" onClick={async () => {
                  if (confirm("⚠ WIPE LOCAL VAULT? This destroys all local keys and message history. Cannot be undone.")) {
                    localStorage.clear();
                    try { const v = await vault.initVault(); await v.execute("DELETE FROM local_keys"); await v.execute("DELETE FROM messages"); } catch {}
                    window.location.reload();
                  }
                }}>
                  <ShieldOff size={13} /> WIPE LOCAL VAULT
                </button>
                <button id="save-policies-btn" className="btn btn-teal">
                  <CheckCircle size={13} /> SAVE POLICIES
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
