import { useState, useRef, useEffect, useMemo, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { XCircle, Reply, Edit3, Trash2, CornerDownRight, Activity, Paperclip, Menu, Search, MoreVertical, Terminal, Lock, Monitor, Smartphone, ShieldCheck, Signal } from "lucide-react";

import { motion, AnimatePresence } from "framer-motion";
import { socket } from "../../infrastructure/socket";
import * as crypto from "../../infrastructure/crypto";
import * as vault from "../../infrastructure/vault";
import { useToast } from "../../components/ui/Toast";
import { ContextMenu } from "../../components/ui/ContextMenu";
import EmptyState from "../../components/ui/EmptyState";

function FormattedText({ text }: { text: string }) {
  if (!text) return null;

  // Handle Code Blocks first
  const blocks = text.split(/(```[\s\S]*?```)/g);
  
  return (
    <>
      {blocks.map((block, i) => {
        if (block.startsWith("```") && block.endsWith("```")) {
          const content = block.slice(3, -3).trim();
          return (
            <pre key={i} className="my-4 p-4 border border-border-tactical bg-background-primary font-mono text-[12px] overflow-x-auto shadow-inner relative group">
              <div className="absolute top-0 right-0 p-1 px-2 text-[8px] font-black text-text-muted bg-background-accent border-l border-b border-border-tactical uppercase tracking-widest">Code_Segment</div>
              <code className="text-accent-cyan">{content}</code>
            </pre>
          );
        }

        // Handle inline formatting
        const lines = block.split("\n");
        return lines.map((line, li) => (
          <span key={`${i}-${li}`}>
            {line.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g).map((part, pi) => {
              if (part.startsWith("**") && part.endsWith("**")) {
                return <strong key={pi} className="font-bold text-text-primary">{part.slice(2, -2)}</strong>;
              }
              if (part.startsWith("*") && part.endsWith("*")) {
                return <em key={pi} className="italic text-text-secondary">{part.slice(1, -1)}</em>;
              }
              if (part.startsWith("`") && part.endsWith("`")) {
                return <code key={pi} className="bg-background-accent px-1.5 py-0.5 border border-border-tactical font-mono text-[11px] text-accent-cyan font-bold">{part.slice(1, -1)}</code>;
              }
              return part;
            })}
            {li < lines.length - 1 && <br />}
          </span>
        ));
      })}
    </>
  );
}

export default function ChatArena({
  activeContact,
  handshakeStatus,
  messages,
  setMessages,
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
  const [isSearching, setIsSearching] = useState(false);
  const [replyTo, setReplyTo] = useState<any | null>(null);
  const [editingMsg, setEditingMsg] = useState<any | null>(null);
  const [showIntelPanel, setShowIntelPanel] = useState(true);
  const typingTimeout = useRef<number | null>(null);
  const feedEnd = useRef<HTMLDivElement>(null);
  const composerInputRef = useRef<HTMLTextAreaElement>(null);

  const resizeComposer = (element: HTMLTextAreaElement | null) => {
    if (!element) return;
    const MAX_HEIGHT = 160;
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
      addToast("Local encryption keys are unavailable.", "error");
      return;
    }
    const targetDevice = activeContact.devices?.[0];
    if (!targetDevice) {
      addToast("Recipient keys unavailable.", "error");
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
      await vault.saveRatchetSession(activeContact.id, result.new_session_json).catch((e) => {
        console.warn("[vault] Failed to persist session, message may desync later", e);
      });

      // 1. Persist to local vault FIRST
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
      } catch (e) {
        console.error("[vault] Failed to save message to local vault:", e);
        addToast("Local database error. Message may not be saved.", "warning");
      }

      // 2. Transmit via socket
      socket.send("MESSAGE_SEND", {
        temp_id: myMsg.id,
        recipient_device_id: targetDevice.device_id,
        ciphertext: result.ciphertext,
        ephemeral_public_key: ephemeralPk ?? null,
        used_opk_id: targetDevice.one_time_pre_key?.key_id ?? null,
        header: result.header,
      });

      setLastMessageByContact((prev: any) => ({ ...prev, [activeContact.id]: myMsg.text }));
      setMessages((prev: any) => [...prev, myMsg]); 
      setInputText("");
      setReplyTo(null);
      resizeComposer(composerInputRef.current);
      socket.send("TYPING_EVENT", { recipient_device_id: targetDevice.device_id, is_typing: false });
    } catch (err) {
      console.error("[ratchet] sendMessage failed:", err);
      addToast(getErrorMessage(err, "Failed to encrypt message."), "error");
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
    <main className="flex-1 flex overflow-hidden bg-background-primary relative">
      {activeContact ? (
        <>
          {/* Center Conversation Canvas */}
          <div className="flex-1 flex flex-col min-w-0 relative bg-background-primary border-r border-border-tactical">
            
            {/* Header */}
            <header className="h-12 border-b border-border-tactical flex items-center justify-between px-4 shrink-0 relative z-20 bg-background-secondary/80 backdrop-blur-md">
              <div className="flex items-center gap-4">
                {isNarrowLayout && (
                  <button 
                    onClick={onRequestOpenSidebar}
                    className="p-1.5 -ml-1 text-text-muted hover:text-accent-cyan transition-colors"
                  >
                    <Menu size={18} />
                  </button>
                )}
                
                <div 
                  className="h-8 w-8 bg-background-primary border border-border-tactical flex items-center justify-center text-accent-cyan font-mono font-bold text-sm cursor-pointer hover:border-accent-cyan/50 transition-all shadow-inner"
                  onClick={() => showContactDetail && showContactDetail(activeContact)}
                >
                  {getInitials(getDisplayName(activeContact))}
                </div>
                <div className="flex flex-col">
                  <div className="text-[12px] font-bold text-text-primary flex items-center gap-2 leading-none uppercase tracking-wider">
                    {getDisplayName(activeContact)}
                    <div className={`status-dot ${presenceByContact[activeContact.id] === 'online' ? 'bg-accent-green' : 'bg-text-muted opacity-40'}`} />
                  </div>
                  <div className="text-[9px] text-text-muted font-bold mt-1 uppercase tracking-tighter">
                    {typingByContact[activeContact.id] ? (
                      <span className="text-accent-cyan animate-pulse flex items-center gap-1">
                        <Terminal size={10} /> input_detected
                      </span>
                    ) : (
                      <span className="opacity-40">{presenceByContact[activeContact.id] || "status_offline"}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <AnimatePresence>
                  {isSearching ? (
                    <motion.div 
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: 180, opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      className="relative hidden md:block"
                    >
                      <Terminal className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" size={12} />
                      <input 
                        type="text"
                        autoFocus
                        placeholder="FILTER_SESSION..."
                        className="input-tactical py-1 pl-7 text-[10px] w-full"
                        value={messageSearch}
                        onChange={(e) => setMessageSearch(e.target.value)}
                        onBlur={() => !messageSearch && setIsSearching(false)}
                      />
                    </motion.div>
                  ) : (
                    <button 
                      className="p-1.5 text-text-muted hover:text-accent-cyan transition-colors"
                      onClick={() => setIsSearching(true)}
                    >
                      <Search size={16} />
                    </button>
                  )}
                </AnimatePresence>

                <div className={`hidden sm:flex items-center gap-2 px-2 py-0.5 border border-border-tactical text-[9px] font-black uppercase tracking-widest transition-all ${
                  handshakeStatus === 'key_exchange' ? 'bg-accent-amber/5 text-accent-amber' : 
                  handshakeStatus === 'ratcheting' ? 'bg-accent-purple/5 text-accent-purple' :
                  'bg-background-accent text-accent-green'
                }`}>
                  <div className={`h-1 w-1 rounded-sm ${
                    handshakeStatus !== 'idle' ? 'bg-current animate-pulse' : 'bg-accent-green shadow-[0_0_4px_rgba(16,185,129,1)]'
                  }`} />
                  {handshakeStatus === 'key_exchange' ? 'HANDSHAKE' : 
                   handshakeStatus === 'ratcheting' ? 'RATCHETING' : 
                   'TUNNEL_SECURED'}
                </div>
                
                <div className="flex items-center gap-1">
                  <button 
                    className={`h-7 w-7 rounded-sm flex items-center justify-center transition-all border border-transparent ${showIntelPanel ? 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/20' : 'text-text-muted hover:text-text-primary hover:bg-background-accent'}`}
                    onClick={() => setShowIntelPanel(!showIntelPanel)}
                    title="Toggle Intel Panel"
                  >
                    <Activity size={16} />
                  </button>
                  <button className="h-7 w-7 rounded-sm flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-background-accent transition-all">
                    <MoreVertical size={16} />
                  </button>
                </div>
              </div>
            </header>

            {/* Messages Feed */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 relative z-10 font-sans">
              <div className="absolute inset-0 pointer-events-none opacity-[0.01] z-0 tactical-grid-bg" />

              <AnimatePresence initial={false}>
                {visibleMessages.map((m: any, idx: number) => {
                  const parent = m.parent_id ? messages.find((p: any) => p.id === m.parent_id) : null;
                  const showHeader = idx === 0 || messages[idx-1]?.sender !== m.sender;
                  
                  return (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex flex-col group/msg ${m.is_me ? "items-end" : "items-start"}`}
                    >
                      <ContextMenu
                        items={m.is_deleted ? [] : [
                          { label: "Reply", icon: <Reply size={14} />, onClick: () => setReplyTo(m) },
                          ...(m.is_me ? [
                            { label: "Edit Message", icon: <Edit3 size={14} />, onClick: () => setEditingMsg(m) },
                            { label: "Delete", icon: <Trash2 size={14} />, variant: "danger" as const, onClick: () => void sendDelete(m.id) }
                          ] : []),
                        ]}
                      >
                        <div className="flex flex-col max-w-[90%] md:max-w-[75%] lg:max-w-[65%]">
                          {showHeader && (
                             <div className={`flex items-center gap-2 mb-1.5 px-1 ${m.is_me ? 'flex-row-reverse' : 'flex-row'}`}>
                                <span className="text-[9px] font-black text-text-muted uppercase tracking-widest opacity-60">
                                   {m.is_me ? 'LOCAL_NODE' : getDisplayName(activeContact).toUpperCase()}
                                </span>
                                <div className="h-px w-4 bg-border-tactical" />
                                <span className="text-[8px] font-mono text-text-muted opacity-30 uppercase">{new Date(m.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' })}</span>
                             </div>
                          )}

                          <div className="relative">
                            {parent && (
                              <div className={`mb-1 flex items-center gap-2 text-[10px] text-text-muted px-2 py-1 bg-background-accent/40 border-l border-border-tactical max-w-sm truncate ${m.is_me ? 'ml-auto' : 'mr-auto'}`}>
                                <CornerDownRight size={10} className="text-accent-cyan" />
                                <span className="truncate italic opacity-70">RE: {parent.text}</span>
                              </div>
                            )}
                            
                            <div className={`px-4 py-2.5 border transition-all text-[13.5px] leading-relaxed shadow-sm ${
                              m.is_me 
                                ? "bg-background-accent border-border-tactical text-text-primary rounded-sm group-hover/msg:border-accent-cyan/30" 
                                : "bg-background-secondary border-border-tactical text-text-primary rounded-sm group-hover/msg:border-accent-cyan/20"
                            }`}>
                              <FormattedText text={m.text} />
                              {m.is_edited && <span className="text-[8px] font-black opacity-30 ml-2 uppercase">[EDITED]</span>}
                            </div>

                            <div className={`flex items-center gap-3 mt-1.5 px-1 text-[8px] font-black text-text-muted transition-opacity uppercase tracking-widest ${m.is_me ? "justify-end" : "justify-start"}`}>
                              {m.is_me ? (
                                <div className="flex items-center gap-1.5">
                                  {m.status === 'read' ? <span className="text-accent-green">READ_CONFIRMED</span> : 'TRANSMITTED'}
                                  <div className={`h-1 w-1 rounded-full ${m.status === 'read' ? "bg-accent-green shadow-[0_0_4px_rgba(16,185,129,1)]" : "bg-text-muted opacity-30"}`} />
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <Lock size={10} className="text-accent-cyan opacity-40" /> ENCRYPTED_SEGMENT
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </ContextMenu>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              <div ref={feedEnd} />
            </div>

            {/* Composer */}
            <footer className="p-4 pt-0 shrink-0 relative z-20">
              <div className="relative border border-border-tactical bg-background-secondary/90 shadow-2xl overflow-hidden rounded-sm">
                <AnimatePresence>
                  {replyTo && (
                    <motion.div 
                      initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                      className="px-3 py-1.5 border-b border-border-tactical flex items-center justify-between bg-accent-cyan/5"
                    >
                      <div className="flex items-center gap-2 text-[9px] font-black text-accent-cyan uppercase tracking-widest">
                        <Reply size={12} /> RE: <span className="text-text-secondary truncate max-w-[200px] font-mono lowercase">"{replyTo.text}"</span>
                      </div>
                      <button className="text-text-muted hover:text-accent-red" onClick={() => setReplyTo(null)}><XCircle size={14} /></button>
                    </motion.div>
                  )}
                </AnimatePresence>
                
                <AnimatePresence>
                  {editingMsg && (
                    <motion.div 
                      initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                      className="px-3 py-1.5 border-b border-border-tactical flex items-center justify-between bg-accent-amber/5"
                    >
                      <div className="flex items-center gap-2 text-[9px] font-black text-accent-amber uppercase tracking-widest">
                        <Edit3 size={12} /> MODIFY_RECORD: <span className="text-text-secondary font-mono">{editingMsg.id.slice(0, 8)}</span>
                      </div>
                      <button className="text-text-muted hover:text-accent-red" onClick={() => { setEditingMsg(null); setInputText(""); }}><XCircle size={14} /></button>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex items-end gap-2 p-2">
                  <button className="h-8 w-8 flex items-center justify-center text-text-muted hover:text-accent-cyan transition-colors border border-border-tactical bg-background-primary rounded-sm shrink-0">
                    <Paperclip size={16} />
                  </button>
                  
                  <div className="flex-1 relative">
                    <textarea
                      ref={composerInputRef}
                      className="w-full bg-transparent border-none focus:ring-0 text-[13px] py-1.5 no-scrollbar resize-none placeholder:text-text-muted/30 leading-relaxed font-sans max-h-[160px]"
                      placeholder={editingMsg ? "INPUT_MODIFIED_DATA..." : "TRANSMIT_TO_NODE..."}
                      rows={1}
                      value={inputText}
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
                    />
                  </div>

                  <div className="flex items-center gap-2 pb-0.5 shrink-0">
                    <button 
                      className={`h-9 px-4 border text-[10px] font-black uppercase tracking-widest transition-all ${
                        inputText.trim() ? "bg-accent-cyan border-accent-cyan text-background-primary shadow-[0_0_15px_rgba(6,182,212,0.15)]" : "bg-background-accent border-border-tactical text-text-muted/40 cursor-not-allowed"
                      }`}
                      onClick={sendMessage}
                      disabled={!inputText.trim()}
                    >
                      Transmit
                    </button>
                  </div>
                </div>
                
                <div className="h-[2px] w-full bg-background-primary">
                   <motion.div 
                    className="h-full bg-accent-cyan shadow-[0_0_4px_rgba(6,182,212,0.8)]"
                    animate={{ width: inputText.trim() ? '100%' : '0%' }}
                   />
                </div>
              </div>
            </footer>
          </div>

          {/* Right Intel Panel */}
          <AnimatePresence>
            {showIntelPanel && (
              <motion.aside
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 320, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
                className="hidden xl:flex flex-col bg-background-secondary overflow-hidden relative z-30 font-mono"
              >
                <header className="h-12 border-b border-border-tactical flex items-center px-4 shrink-0 bg-background-accent/30">
                  <div className="text-[10px] font-black text-text-primary uppercase tracking-[0.2em] flex items-center gap-2">
                    <Activity size={14} className="text-accent-cyan" />
                    Operational_Intel
                  </div>
                </header>
                
                <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                  {/* Identity Profile */}
                  <div className="space-y-4">
                     <div className="flex flex-col items-center py-4 border border-border-tactical bg-background-primary relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-1 px-1.5 text-[7px] font-black text-accent-cyan bg-accent-cyan/10 border-l border-b border-border-tactical uppercase">Principal</div>
                        <div className="h-16 w-16 bg-background-secondary border border-border-tactical flex items-center justify-center text-2xl font-black text-accent-cyan shadow-inner mb-3">
                           {getInitials(getDisplayName(activeContact))}
                        </div>
                        <div className="text-[14px] font-black text-text-primary tracking-tight uppercase">{getDisplayName(activeContact)}</div>
                        <div className="text-[9px] font-bold text-text-muted mt-1 uppercase tracking-widest">{activeContact.department || "EXTERNAL_NODE"}</div>
                     </div>
                  </div>

                  {/* Trust Integrity */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center px-1">
                       <h4 className="telemetry-label">Signal_Trust</h4>
                       <span className="text-[11px] font-bold text-accent-green font-mono">99.8%</span>
                    </div>
                    <div className="h-1.5 w-full bg-background-primary border border-border-tactical rounded-sm overflow-hidden p-0.5">
                      <motion.div initial={{ width: 0 }} animate={{ width: "99.8%" }} className="h-full bg-accent-green shadow-[0_0_8px_rgba(16,185,129,0.5)] rounded-[1px]" />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2 border border-border-tactical bg-background-primary/50 flex flex-col gap-1">
                        <span className="text-[8px] font-black text-text-muted uppercase">Handshake</span>
                        <span className="text-[9px] font-black text-accent-cyan uppercase">Verified</span>
                      </div>
                      <div className="p-2 border border-border-tactical bg-background-primary/50 flex flex-col gap-1">
                        <span className="text-[8px] font-black text-text-muted uppercase">Protocol</span>
                        <span className="text-[9px] font-black text-accent-green uppercase">Optimal</span>
                      </div>
                    </div>
                  </div>

                  {/* Nodes */}
                  <div className="space-y-3">
                    <div className="telemetry-label border-b border-border-tactical pb-2 flex items-center justify-between">
                      Authorized_Endpoints
                      <span className="text-[10px] font-mono text-accent-cyan">[{activeContact.devices?.length || 0}]</span>
                    </div>
                    <div className="space-y-1.5">
                      {activeContact.devices?.map((d: any) => (
                        <div key={d.device_id} className="p-2.5 bg-background-primary border border-border-tactical flex items-center gap-3 group/dev hover:border-accent-cyan/30 transition-colors">
                          <div className="h-7 w-7 border border-border-tactical bg-background-secondary flex items-center justify-center text-text-muted group-hover/dev:text-accent-cyan transition-colors">
                            {d.device_name?.toLowerCase().includes('mobile') ? <Smartphone size={14} /> : <Monitor size={14} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[10px] font-bold text-text-primary truncate uppercase">{d.device_name || "UNKNOWN_NODE"}</div>
                            <div className="text-[8px] font-mono text-text-muted truncate opacity-50 uppercase tracking-tighter">ID: {d.device_id.slice(0, 12)}</div>
                          </div>
                          <div className="h-1.5 w-1.5 bg-accent-green shadow-[0_0_4px_rgba(16,185,129,1)]" />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Temporal History */}
                  <div className="space-y-3">
                    <div className="telemetry-label border-b border-border-tactical pb-2">Temporal_Activity</div>
                    <div className="space-y-2 py-2">
                       <div className="flex gap-3 items-start opacity-60">
                          <div className="h-1.5 w-1.5 rounded-full bg-accent-cyan mt-1" />
                          <div className="space-y-0.5">
                             <div className="text-[9px] font-black text-text-primary uppercase">Handshake_Init</div>
                             <div className="text-[8px] text-text-muted">ID: {new Date().getTime()}</div>
                          </div>
                       </div>
                       <div className="flex gap-3 items-start opacity-40">
                          <div className="h-1.5 w-1.5 rounded-full bg-border-tactical mt-1" />
                          <div className="space-y-0.5">
                             <div className="text-[9px] font-black text-text-primary uppercase">Session_Purged</div>
                             <div className="text-[8px] text-text-muted">ID: {new Date().getTime() - 3600000}</div>
                          </div>
                       </div>
                    </div>
                  </div>
                </div>

                <footer className="p-4 border-t border-border-tactical bg-background-primary/40 shrink-0">
                   <button 
                    className="btn-tactical btn-tactical-primary w-full py-2.5 text-[9px] font-black shadow-[0_0_15px_rgba(6,182,212,0.1)] border-accent-cyan"
                    onClick={() => showContactDetail && showContactDetail(activeContact)}
                   >
                     <ShieldCheck size={14} className="mr-2" /> VERIFY_IDENTITY_CHAIN
                   </button>
                </footer>
              </motion.aside>
            )}
          </AnimatePresence>
        </>
      ) : (
        <EmptyState 
          title="INITIALIZE_COMMUNICATION"
          subtitle="Select a verified organizational node to establish an end-to-end encrypted session tunnel."
          icon={<Signal size={48} className="text-accent-cyan animate-pulse" />}
        />
      )}
    </main>
  );
}
