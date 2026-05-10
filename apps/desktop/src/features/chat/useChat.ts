import { useRef } from "react";
import { socket } from "../../infrastructure/socket";
import * as vault from "../../infrastructure/vault";
import { processIncomingMessage } from "../../infrastructure/crypto_orchestration";

import React from "react";
import type { LocalKeys, Message } from "../../types";

interface UseChatProps {
  localKeys: React.MutableRefObject<LocalKeys | null>;
  userId: string | null;
  activeContactId: React.MutableRefObject<string | null>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setLastMessageByContact: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setTypingByContact: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setUnreadByContact: React.Dispatch<React.SetStateAction<Record<string, number>>>;
}

export default function useChat({
  localKeys,
  userId,
  activeContactId,
  setMessages,
  setLastMessageByContact,
  setTypingByContact,
  setUnreadByContact,
}: UseChatProps) {
  const tempToServerIdMap = useRef<Map<string, string>>(new Map());

  const resolveLocalMessageId = (serverMessageId: string) => {
    for (const [tempId, mappedServerId] of tempToServerIdMap.current.entries()) {
      if (mappedServerId === serverMessageId) {
        return tempId;
      }
    }
    return serverMessageId;
  };

  const handleIncomingMessage = async (payload: any) => {
    if (!localKeys.current) return;
    try {
      const result = await processIncomingMessage(
        payload,
        localKeys.current,
        activeContactId.current
      );

      if (!result) return;
      const { conversationId, plaintext } = result;

      let structured: any = { type: "text", body: plaintext };
      try {
        const parsed = JSON.parse(plaintext);
        if (parsed.type) structured = parsed;
      } catch {}

      if (structured.type === "text" || structured.type === "reply") {
        const newMsg = {
          id: payload.message_id, 
          sender: payload.sender_device_id,
          text: structured.body, 
          timestamp: payload.timestamp, 
          is_me: false, 
          status: "received",
          parent_id: structured.parent_id || null,
          metadata: structured.metadata || {},
          reactions: [],
          is_edited: false,
          is_deleted: false
        };
        
        try {
          await vault.saveMessage({
            id: newMsg.id,
            sender: newMsg.sender,
            text: newMsg.text,
            is_me: false,
            conversation_id: conversationId,
            recipient_id: userId,
            timestamp: payload.timestamp,
            message_status: "received",
            parent_id: newMsg.parent_id,
            metadata: newMsg.metadata
          });
          
          // Only ACK if save was successful
          socket.send("MESSAGE_ACK", { message_id: payload.message_id });
        } catch (err) {
          console.error("[vault] Failed to save incoming message:", err);
          return; // Stop processing if we can't save
        }
        
        setLastMessageByContact((prev: any) => ({ ...prev, [conversationId]: newMsg.text }));
        setTypingByContact((prev: any) => ({ ...prev, [conversationId]: false }));
        
        if (activeContactId.current === conversationId) {
          setMessages((prev: any) => [...prev, newMsg]);
          socket.send("MESSAGE_READ", { message_id: payload.message_id });
        } else {
          setUnreadByContact((prev: any) => ({ ...prev, [conversationId]: (prev[conversationId] || 0) + 1 }));
        }
      } else {
        // Event type (edit, delete, reaction)
        try {
          await vault.saveMessageEvent({
            id: payload.message_id,
            target_msg_id: structured.target_id,
            event_type: structured.type,
            payload: structured
          });
          
          socket.send("MESSAGE_ACK", { message_id: payload.message_id });
        } catch (err) {
          console.error("[vault] Failed to save message event:", err);
          return;
        }

        if (activeContactId.current === conversationId) {
          setMessages((prev: any) => prev.map((m: any) => {
            if (m.id !== structured.target_id) return m;
            if (structured.type === 'edit') return { ...m, text: structured.body, is_edited: true };
            if (structured.type === 'delete') return { ...m, is_deleted: true, text: "This message was deleted" };
            if (structured.type === 'reaction') return { ...m, reactions: [...(m.reactions || []), structured.emoji] };
            return m;
          }));
        }
      }
    } catch (err) {
      console.error("[ratchet] handleIncomingMessage failed:", err);
    }
  };

  const handleMessageStatus = async (payload: any) => {
    const localMessageId = resolveLocalMessageId(payload.message_id);
    const nextStatus = payload.status === "read" ? "read" : "delivered";
    try { await vault.updateMessageStatus(localMessageId, nextStatus); } catch {}
    setMessages((prev: any) => prev.map((message: any) =>
      message.id === localMessageId || message.id === payload.message_id
        ? { ...message, status: nextStatus }
        : message
    ));
  };

  const handleMessageConfirm = async (payload: any) => {
    const tempId = payload?.temp_id;
    const serverMessageId = payload?.server_message_id;
    if (!tempId || !serverMessageId) return;

    tempToServerIdMap.current.set(tempId, serverMessageId);

    try {
      await vault.reconcileTempMessageId(tempId, serverMessageId, payload?.timestamp);
    } catch {}

    setMessages((prev: any) =>
      prev.map((message: any) => {
        if (message.id !== tempId) return message;
        return {
          ...message,
          id: serverMessageId,
          timestamp: payload?.timestamp || message.timestamp,
          status: "sent",
        };
      }),
    );
  };

  const handleTypingEvent = (payload: any) => {
    if (!payload?.sender_user_id) return;
    setTypingByContact((prev: any) => ({ ...prev, [payload.sender_user_id]: Boolean(payload.is_typing) }));
  };

  const handleStoryKeyShare = async (payload: any) => {
    if (!localKeys.current) return;
    try {
      const result = await processIncomingMessage(
        payload,
        localKeys.current,
        payload.sender_user_id
      );
      if (!result) return;
      const { plaintext } = result;
      const parsed = JSON.parse(plaintext);
      if (parsed.type === "STORY_KEY") {
        await vault.saveStoryKey(payload.sender_user_id, parsed.key, parsed.nonce);
      }
    } catch (err) {
      console.error("[stories] Failed to process story key share:", err);
    }
  };

  return {
    handleIncomingMessage,
    handleMessageConfirm,
    handleMessageStatus,
    handleTypingEvent,
    handleStoryKeyShare
  };
}
