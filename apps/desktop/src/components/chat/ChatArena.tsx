import { useState, useRef, useEffect } from "react";
import { Search, Send, Shield, Zap, CheckCircle, Lock, MessageSquare, XCircle } from "lucide-react";
import { socket } from "../../lib/socket";
import EncryptionSpinner from "../EncryptionSpinner";
import * as crypto from "../../lib/crypto";
import * as vault from "../../lib/vault";

export default function ChatArena({
  activeContact,
  setActiveContact,
  isHandshaking,
  messages,
  setMessages,
  workspaceName,
  typingByContact,
  isDemo,
  localKeys,
  setLastMessageByContact,
  showContactDetail
}: any) {
  const [inputText, setInputText] = useState("");
  const [messageSearch, setMessageSearch] = useState("");
  const typingTimeout = useRef<number | null>(null);
  const feedEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    feedEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!inputText.trim() || !activeContact) return;

    const myMsg = {
      id: `msg-${Date.now()}`, sender: "me", text: inputText,
      timestamp: new Date().toISOString(), is_me: true, status: "sending",
    };

    if (isDemo) {
      setMessages((prev: any) => [...prev, myMsg]);
      setInputText("");
      setTimeout(() => {
        setMessages((prev: any) => [...prev, {
          id: `reply-${Date.now()}`, sender: "them",
          text: "Acknowledged. End-to-end encryption maintained.",
          timestamp: new Date().toISOString(), is_me: false,
        }]);
      }, 900);
      return;
    }

    if (!localKeys.current) return;
    const targetDevice = activeContact.devices?.[0];
    if (!targetDevice) return;

    try {
      let ephemeralPk: string | undefined;
      let sessionJson = await vault.getRatchetSession(activeContact.id).catch(() => null);

      if (!sessionJson) {
        const x3dh = await crypto.aliceX3dh(
          localKeys.current.identity_secret,
          targetDevice.identity_key,
          targetDevice.signed_pre_key,
          targetDevice.one_time_pre_key?.public_key ?? null,
        );
        ephemeralPk = x3dh.ephemeral_pk_b64;
        sessionJson = await crypto.ratchetInitSender(
          x3dh.shared_secret_b64,
          targetDevice.signed_pre_key,
        );
      }

      const result = await crypto.ratchetEncrypt(sessionJson, inputText, activeContact.id);
      await vault.saveRatchetSession(activeContact.id, result.new_session_json).catch(() => {});

      socket.send("MESSAGE_SEND", {
        temp_id: myMsg.id,
        recipient_device_id: targetDevice.device_id,
        ciphertext: result.ciphertext,
        ephemeral_public_key: ephemeralPk ?? null,
        header: result.header,
      });

      try {
        await vault.saveMessage({
          ...myMsg,
          conversation_id: activeContact.id,
          recipient_id: activeContact.id,
          timestamp: myMsg.timestamp,
          temp_id: myMsg.id,
          message_status: "sending",
        });
      } catch {}
      setLastMessageByContact((prev: any) => ({ ...prev, [activeContact.id]: myMsg.text }));
      setMessages((prev: any) => [...prev, myMsg]); setInputText("");
      socket.send("TYPING_EVENT", { recipient_device_id: targetDevice.device_id, is_typing: false });
    } catch (err) {
      console.error("[ratchet] sendMessage failed:", err);
    }
  };

  const visibleMessages = messages.filter((m: any) => m.text.toLowerCase().includes(messageSearch.toLowerCase()));

  function getDisplayName(contact: any) {
    return contact.username || contact.email;
  }

  function getInitials(value: string) {
    return value.trim().charAt(0).toUpperCase();
  }

  return (
    <main className="chat-arena">
      {activeContact ? (
        <>
          {/* Chat Header */}
          <header className="chat-header" id="chat-header">
            <div className="chat-header-info">
              <div
                className="avatar"
                style={{ width: 30, height: 30, fontSize: "0.72rem", flexShrink: 0, cursor: "pointer" }}
                title="View Identity Details"
                onClick={() => showContactDetail && showContactDetail(activeContact)}
              >
                {getInitials(getDisplayName(activeContact))}
              </div>
              <div>
                <div className="chat-header-name">{getDisplayName(activeContact)}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.58rem", color: "var(--text-muted)" }}>
                  {typingByContact[activeContact.id]
                    ? "Typing now..."
                    : `${activeContact.device_count ?? 1} device${(activeContact.device_count ?? 1) !== 1 ? "s" : ""} registered`}
                </div>
              </div>
              {isHandshaking ? (
                <span className="chat-header-handshaking">
                  <Zap size={11} /> Establishing secure session...
                </span>
              ) : (
                <span className="chat-header-enc-badge">
                  <Shield size={10} strokeWidth={2} /> End-to-end encrypted
                </span>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
                fontFamily: "var(--font-mono)", fontSize: "0.6rem",
                color: "var(--text-muted)", textAlign: "right", lineHeight: 1.6
              }}>
                <div>{workspaceName.toUpperCase()}</div>
                <div style={{ color: "var(--accent-teal)" }}>Verify keys available</div>
              </div>
              <button
                id="close-chat-btn"
                className="btn btn-ghost btn-sm"
                onClick={() => { setActiveContact(null); setMessages([]); }}
              >
                  <XCircle size={12} /> Close
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
                Messages stay encrypted in transit and protected on this device.
              </div>

              <div className="conversation-search">
                <Search size={14} className="conversation-search-icon" />
                <input
                  className="input"
                  placeholder="Search local message history"
                  value={messageSearch}
                  onChange={e => setMessageSearch(e.target.value)}
                />
              </div>

              {visibleMessages.map((m: any) => (
                <div
                  key={m.id}
                  id={`msg-${m.id}`}
                  className={`message-bubble ${m.is_me || m.sender === "me" ? "me" : "them"}`}
                >
                  <div className="bubble-content">{m.text}</div>
                  <div className="message-meta">
                    {m.is_me || m.sender === "me" ? (
                      <><CheckCircle size={8} style={{ color: "var(--accent-success)" }} /> {m.status === "read" ? "Read" : m.status === "delivered" ? "Delivered" : m.status === "sending" ? "Sending..." : "Sent securely"}</>
                    ) : (
                      <><Lock size={8} style={{ color: "var(--accent-teal)" }} /> Received securely</>
                    )}
                    &nbsp;·&nbsp;
                    {new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              ))}

              {visibleMessages.length === 0 && (
                <div className="chat-empty-state">
                  <MessageSquare size={24} strokeWidth={1} style={{ color: "var(--text-muted)" }} />
                  <div>{messageSearch ? "No local matches found" : "Conversation ready"}</div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.65rem" }}>
                    {messageSearch
                      ? "Try a different keyword. Search runs only against this device's local history."
                      : "Send the first message to start this encrypted thread."}
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
                  placeholder="Write a message"
                  value={inputText}
                  onChange={e => {
                    const nextValue = e.target.value;
                    setInputText(nextValue);
                    const activeDevice = activeContact?.devices?.[0];
                    if (!isDemo && activeDevice) {
                      socket.send("TYPING_EVENT", {
                        recipient_device_id: activeDevice.device_id,
                        is_typing: nextValue.trim().length > 0,
                      });
                      if (typingTimeout.current) window.clearTimeout(typingTimeout.current);
                      typingTimeout.current = window.setTimeout(() => {
                        socket.send("TYPING_EVENT", {
                          recipient_device_id: activeDevice.device_id,
                          is_typing: false,
                        });
                      }, 1200);
                    }
                  }}
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
                <Send size={13} /> Send
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="empty-state" id="empty-state">
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
          <h3>Your workspace is ready</h3>
          <p>Choose a person from the sidebar to start a secure conversation.</p>
        </div>
      )}
    </main>
  );
}
