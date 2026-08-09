import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';

const room = (conversationId) => `conv:${conversationId}`;

/** Confirms the socket's user is one of the conversation's participants. */
async function authorise(socket, conversationId) {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) return null;
  const isMember = conversation.participants.some((p) => String(p) === socket.user.id);
  return isMember ? conversation : null;
}

export function registerChatHandlers(io, socket) {
  /** Join the room for a conversation the user belongs to. */
  socket.on('chat:join', async ({ conversationId }, ack) => {
    const conversation = await authorise(socket, conversationId);
    if (!conversation) return ack?.({ ok: false, error: 'Conversation not found' });
    socket.join(room(conversationId));
    return ack?.({ ok: true });
  });

  socket.on('chat:leave', ({ conversationId }) => {
    socket.leave(room(conversationId));
  });

  /** Persist a message, then push it to the room and to the recipient's inbox. */
  socket.on('chat:message', async ({ conversationId, body }, ack) => {
    const text = String(body || '').trim();
    if (!text) return ack?.({ ok: false, error: 'Message cannot be empty' });
    if (text.length > 2000) return ack?.({ ok: false, error: 'Message is too long' });

    const conversation = await authorise(socket, conversationId);
    if (!conversation) return ack?.({ ok: false, error: 'Conversation not found' });

    const message = await Message.create({
      conversation: conversationId,
      sender: socket.user.id,
      body: text,
      readBy: [socket.user.id],
    });

    conversation.lastMessage = { body: text, sender: socket.user.id, sentAt: message.createdAt };
    conversation.participants
      .filter((p) => String(p) !== socket.user.id)
      .forEach((p) => {
        const key = String(p);
        conversation.unread.set(key, (conversation.unread.get(key) || 0) + 1);
      });
    await conversation.save();

    const payload = {
      _id: String(message._id),
      conversation: String(conversationId),
      sender: { _id: socket.user.id, name: socket.user.name },
      body: text,
      createdAt: message.createdAt,
    };

    io.to(room(conversationId)).emit('chat:message', payload);
    conversation.participants
      .filter((p) => String(p) !== socket.user.id)
      .forEach((p) => io.to(`user:${String(p)}`).emit('chat:inbox', payload));

    return ack?.({ ok: true, message: payload });
  });

  socket.on('chat:typing', ({ conversationId, isTyping }) => {
    socket.to(room(conversationId)).emit('chat:typing', {
      conversationId,
      userId: socket.user.id,
      name: socket.user.name,
      isTyping: Boolean(isTyping),
    });
  });

  /** Clears the unread badge and marks delivered messages as read. */
  socket.on('chat:read', async ({ conversationId }, ack) => {
    const conversation = await authorise(socket, conversationId);
    if (!conversation) return ack?.({ ok: false });

    conversation.unread.set(socket.user.id, 0);
    await conversation.save();
    await Message.updateMany(
      { conversation: conversationId, readBy: { $ne: socket.user.id } },
      { $addToSet: { readBy: socket.user.id } }
    );

    socket.to(room(conversationId)).emit('chat:read', {
      conversationId,
      userId: socket.user.id,
      readAt: new Date(),
    });
    return ack?.({ ok: true });
  });
}
