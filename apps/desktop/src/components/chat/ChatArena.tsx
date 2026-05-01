import { useState, useRef, useEffect, useMemo, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Search, Send, Shield, Zap, CheckCircle, Lock, MessageSquare, XCircle, Reply, Edit3, Trash2, Smile, CornerDownRight, MoreVertical } from "lucide-react";
import { socket } from "../../lib/socket";
import EncryptionSpinner from "../EncryptionSpinner";
import * as crypto from "../../lib/crypto";
import * as vault from "../../lib/vault";
import { useToast } from "../ui/Toast";
import { ContextMenu } from "../ui/ContextMenu";

export default function ChatArena({
  activeContact,
  setActiveContact,
  isHandshaking,
  messages,
  setMessages,
  workspaceName,
  typingByContact,
  presenceByContact,
  localKeys,
  setLastMessageByContact,
  showContactDetail,
  isNarrowLayout,
  onRequestOpenSidebar,
}: any) {
  const { addToast } = useToast();
  const [inputText, setInputText] = useState("");
  const [messageSearch, setMessageSearch] = useState("");
  const [replyTo, setReplyTo] = useState<any | null>(null);
  const [editingMsg, setEditingMsg] = useState<any | null>(null);
  const typingTimeout = useRef<number | null>(null);
  const feedEnd = useRef<HTMLDivElement>(null);
  const composerInputRef = useRef<HTMLTextAreaElement>(null);

  const resizeComposer = (element: HTMLTextAreaElement | null) => {
    if (!element) return;
    const MAX_HEIGHT = 150;
    element.style.height = "auto";
    const nextHeight = Math.min(element.scrollHeight, MAX_HEIGHT);
    element.style.height = `${Math.max(40, nextHeight)}px`;
    element.style.overflowY = element.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
  };

  useEffect(() => {
    feedEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    resizeComposer(composerInputRef.current);
    if (editingMsg) {
      setInputText(editingMsg.text);
      composerInputRef.current?.focus();
    }
  }, [inputText, editingMsg]);

  const getErrorMessage = (err: unknown, fallback: string) => {
    if (err instanceof Error && err.message) return err.message;
    if (typeof err === "string" && err.trim()) return err;
    return fallback;
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !activeContact) return;

    if (editingMsg) {
      await sendEdit(editingMsg.id, inputText);
      setEditingMsg(null);
      setInputText("");
      return;
    }

    const myMsg: any = {
      id: `msg-${Date.now()}`, 
      sender: "me", 
      text: inputText,
      timestamp: new Date().toISOString(), 
      is_me: true, 
      status: "sending",
      parent_id: replyTo?.id || null,
      reactions: [],
      is_edited: false,
      is_deleted: false,
    };

    if (!localKeys.current) {
      addToast("Local encryption keys are unavailable. Fix keychain access and sign in again.", "error");
      return;
    }
    const targetDevice = activeContact.devices?.[0];
    if (!targetDevice) {
      addToast("Cannot send: recipient has no registered device keys yet.", "error");
      return;
    }

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

      const payload = {
        type: "text",
        body: inputText,
        parent_id: replyTo?.id || null,
      };

      const result = await crypto.ratchetEncrypt(sessionJson, JSON.stringify(payload), activeContact.id);
      await vault.saveRatchetSession(activeContact.id, result.new_session_json).catch(() => {});

      socket.send("MESSAGE_SEND", {
        temp_id: myMsg.id,
        recipient_device_id: targetDevice.device_id,
        ciphertext: result.ciphertext,
        ephemeral_public_key: ephemeralPk ?? null,
        used_opk_id: targetDevice.one_time_pre_key?.key_id ?? null,
        header: result.header,
      });

      try {
        await vault.saveMessage({
          id: myMsg.id,
          temp_id: myMsg.id,
          sender: "me",
          text: inputText,
          is_me: true,
          conversation_id: activeContact.id,
          recipient_id: activeContact.id,
          timestamp: myMsg.timestamp,
          message_status: "sending",
          parent_id: myMsg.parent_id,
        });
      } catch {}
      setLastMessageByContact((prev: any) => ({ ...prev, [activeContact.id]: myMsg.text }));
      setMessages((prev: any) => [...prev, myMsg]); 
      setInputText("");
      setReplyTo(null);
      resizeComposer(composerInputRef.current);
      socket.send("TYPING_EVENT", { recipient_device_id: targetDevice.device_id, is_typing: false });
    } catch (err) {
      console.error("[ratchet] sendMessage failed:", err);
      addToast(getErrorMessage(err, "Failed to encrypt or send message."), "error");
    }
  };

  const sendEdit = async (targetId: string, newText: string) => {
    await sendEvent("edit", targetId, { body: newText });
    setMessages((prev: any) => prev.map((m: any) => m.id === targetId ? { ...m, text: newText, is_edited: true } : m));
  };

  const sendDelete = async (targetId: string) => {
    await sendEvent("delete", targetId, {});
    setMessages((prev: any) => prev.map((m: any) => m.id === targetId ? { ...m, is_deleted: true, text: "This message was deleted" } : m));
  };

  const sendReaction = async (targetId: string, emoji: string) => {
    await sendEvent("reaction", targetId, { emoji });
    setMessages((prev: any) => prev.map((m: any) => m.id === targetId ? { ...m, reactions: [...(m.reactions || []), emoji] } : m));
  };

  const sendEvent = async (type: string, targetId: string, payload: any) => {
    if (!activeContact) return;
    const targetDevice = activeContact.devices?.[0];
    if (!targetDevice || !localKeys.current) return;

    try {
      const sessionJson = await vault.getRatchetSession(activeContact.id);
      if (!sessionJson) return;

      const eventPayload = { type, target_id: targetId, ...payload };
      const result = await crypto.ratchetEncrypt(sessionJson, JSON.stringify(eventPayload), activeContact.id);
      await vault.saveRatchetSession(activeContact.id, result.new_session_json);

      const eventId = `ev-${Date.now()}`;
      socket.send("MESSAGE_SEND", {
        temp_id: eventId,
        recipient_device_id: targetDevice.device_id,
        ciphertext: result.ciphertext,
        header: result.header,
      });

      await vault.saveMessageEvent({
        id: eventId,
        target_msg_id: targetId,
        event_type: type,
        payload: payload,
      });
    } catch (err) {
      console.error("[ratchet] sendEvent failed:", err);
    }
  };

  const handleComposerKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
    if (event.key === "Escape") {
      setReplyTo(null);
      setEditingMsg(null);
      if (!editingMsg) setInputText("");
    }
  };

  const visibleMessages = useMemo(() => 
    messages.filter((m: any) => m.text.toLowerCase().includes(messageSearch.toLowerCase())),
    [messages, messageSearch]
  );

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
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-chat-meta)", color: "var(--text-muted)" }}>
                  {typingByContact[activeContact.id]
                    ? "Typing..."
                    : presenceByContact[activeContact.id]
                      ? presenceByContact[activeContact.id].charAt(0).toUpperCase() + presenceByContact[activeContact.id].slice(1)
                      : "Offline"}
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
              fontFamily: "var(--font-mono)", fontSize: "var(--fs-chat-meta)",
              color: "var(--text-muted)", textAlign: "right", lineHeight: 1.6
            }}>
              <div>{workspaceName.toUpperCase()}</div>
              <div 
                style={{ color: "var(--accent-teal)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}
                onClick={() => showContactDetail && showContactDetail(activeContact)}
              >
                <CheckCircle size={10} />
                Verify security
              </div>
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
              <div className="session-banner">
                <Shield size={11} />
                Messages stay encrypted in transit and protected on this device.
              </div>
              <div className="conversation-search">
                <Search size={14} className="conversation-search-icon" />
                <input className="input" placeholder="Search local message history" value={messageSearch} onChange={e => setMessageSearch(e.target.value)} />
              </div>
              {visibleMessages.map((m: any) => {
                const parent = m.parent_id ? messages.find((p: any) => p.id === m.parent_id) : null;
                return (
                  <ContextMenu
                    key={m.id}
                    items={m.is_deleted ? [] : [
                      { label: "Reply", icon: <Reply size={12} />, onClick: () => setReplyTo(m) },
                      ...(m.is_me ? [
                        { label: "Edit Message", icon: <Edit3 size={12} />, onClick: () => setEditingMsg(m) },
                        { label: "Delete Message", icon: <Trash2 size={12} />, variant: "danger" as const, onClick: () => void sendDelete(m.id) }
                      ] : []),
                      { label: "React 👍", onClick: () => void sendReaction(m.id, "👍") },
                      { label: "React ❤️", onClick: () => void sendReaction(m.id, "❤️") },
                      { label: "React 😂", onClick: () => void sendReaction(m.id, "😂") },
                    ]}
                  >
                    <div id={`msg-${m.id}`} className={`message-bubble ${m.is_me ? "me" : "them"}`}>
                      {parent && (
                        <div className="message-reply-context">
                          <CornerDownRight size={10} />
                          <div className="reply-text-truncate">{parent.is_deleted ? "Deleted message" : parent.text}</div>
                        </div>
                      )}
                      <div className="bubble-content">
                        {m.text}
                        {m.is_edited && <span className="edited-tag">(edited)</span>}
                      </div>
                      {m.reactions?.length > 0 && (
                        <div className="message-reactions">
                          {Array.from(new Set(m.reactions)).map((emoji: any, i) => (
                            <span key={i} className="reaction-badge">
                              {emoji} <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>{m.reactions.filter((r: any) => r === emoji).length}</span>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="message-meta">
                        {m.is_me ? (
                          <>
                            <CheckCircle size={8} style={{ color: m.status === 'read' ? 'var(--accent-teal)' : 'var(--accent-success)' }} />
                            {" "}{m.status === 'read' ? 'Read' : m.status === 'delivered' ? 'Delivered' : m.status === 'sending' ? 'Sending...' : 'Sent'}
                          </>
                        ) : (
                          <>
                            <Lock size={8} style={{ color: 'var(--accent-teal)' }} /> Received
                          </>
                        )}
                        {" · "}{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </ContextMenu>
                );
              })}
              <div ref={feedEnd} />
            </div>
          )}

          {!isHandshaking && (
            <div className="composer-wrap">
              {replyTo && (
                <div className="composer-preview reply">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Reply size={12} color="var(--accent-teal)" />
                    <div className="preview-text">Replying to: <span>{replyTo.text}</span></div>
                  </div>
                  <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setReplyTo(null)}><XCircle size={14} /></button>
                </div>
              )}
              {editingMsg && (
                <div className="composer-preview edit">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Edit3 size={12} color="var(--accent-primary)" />
                    <div className="preview-text">Editing message...</div>
                  </div>
                  <button className="btn btn-ghost btn-sm btn-icon" onClick={() => { setEditingMsg(null); setInputText(""); }}><XCircle size={14} /></button>
                </div>
              )}
              <div className="composer">
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: "var(--fs-chat-meta)", color: "var(--accent-primary)", flexShrink: 0 }}>
                  <Lock size={11} />E2EE
                </div>
                <div className="composer-input-wrap">
                  <textarea
                    ref={composerInputRef}
                    id="message-input"
                    className="input composer-textarea"
                    placeholder={editingMsg ? "Edit your message" : "Write a message"}
                    value={inputText}
                    rows={1}
                    onChange={(e) => {
                      const val = e.target.value;
                      setInputText(val);
                      const target = activeContact.devices?.[0];
                      if (target) {
                        socket.send("TYPING_EVENT", { recipient_device_id: target.device_id, is_typing: val.trim().length > 0 });
                        if (typingTimeout.current) window.clearTimeout(typingTimeout.current);
                        typingTimeout.current = window.setTimeout(() => {
                          socket.send("TYPING_EVENT", { recipient_device_id: target.device_id, is_typing: false });
                        }, 1200);
                      }
                    }}
                    onKeyDown={handleComposerKeyDown}
                    autoComplete="off"
                  />
                  <span className="composer-key-hint">Enter Send · Shift+Enter New Line</span>
                </div>
                <button
                  id="send-btn"
                  className="btn btn-primary"
                  onClick={sendMessage}
                  disabled={!inputText.trim() || !localKeys.current || !activeContact?.devices?.[0]}
                >
                  <Send size={13} /> {editingMsg ? "Update" : "Send"}
                </button>
              </div>
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
          {isNarrowLayout ? (
            <button
              id="open-contacts-btn"
              className="btn btn-ghost btn-sm"
              onClick={() => onRequestOpenSidebar && onRequestOpenSidebar()}
            >
              Browse contacts
            </button>
          ) : null}
        </div>
      )}
    </main>
  );
}
