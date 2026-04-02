import { useRef } from "react";
import { socket } from "../../lib/socket";
import * as vault from "../../lib/vault";
import { processIncomingMessage } from "../../lib/crypto_orchestration";

export default function useChat({
  localKeys,
  userId,
  activeContactId,
  setMessages,
  setLastMessageByContact,
  setTypingByContact,
  setUnreadByContact,
}: any) {
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

      const newMsg = {
        id: payload.message_id, sender: payload.sender_device_id,
        text: plaintext, timestamp: payload.timestamp, is_me: false, status: "received",
      };
      
      try {
        await vault.saveMessage({
          ...newMsg,
          conversation_id: conversationId,
          recipient_id: userId,
          timestamp: payload.timestamp,
          message_status: "received",
        });
      } catch {}
      
      socket.send("MESSAGE_ACK", { message_id: payload.message_id });
      setLastMessageByContact((prev: any) => ({ ...prev, [conversationId]: newMsg.text }));
      setTypingByContact((prev: any) => ({ ...prev, [conversationId]: false }));
      
      if (activeContactId.current === conversationId) {
        setMessages((prev: any) => [...prev, newMsg]);
        socket.send("MESSAGE_READ", { message_id: payload.message_id });
      } else {
        setUnreadByContact((prev: any) => ({ ...prev, [conversationId]: (prev[conversationId] || 0) + 1 }));
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

  return {
    handleIncomingMessage,
    handleMessageConfirm,
    handleMessageStatus,
    handleTypingEvent
  };
}
