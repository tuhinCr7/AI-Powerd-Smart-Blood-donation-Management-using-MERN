import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { User } from '../models/User.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { emitToUsers, isOnline } from '../sockets/index.js';

const shape = (conversation, currentUserId) => {
  const other = conversation.participants.find((p) => String(p._id || p) !== String(currentUserId));
  return {
    _id: conversation._id,
    request: conversation.request,
    lastMessage: conversation.lastMessage,
    unread: conversation.unread?.get?.(String(currentUserId)) || 0,
    updatedAt: conversation.updatedAt,
    peer: other?._id
      ? {
          _id: other._id,
          name: other.name,
          role: other.role,
          bloodGroup: other.bloodGroup,
          avatarUrl: other.avatarUrl,
          isOnline: isOnline(other._id),
          lastSeenAt: other.lastSeenAt,
        }
      : null,
  };
};

/** GET /api/chat/conversations */
export const listConversations = asyncHandler(async (req, res) => {
  const conversations = await Conversation.find({ participants: req.user._id })
    .sort({ updatedAt: -1 })
    .populate('participants', 'name role bloodGroup avatarUrl lastSeenAt');

  res.json({
    success: true,
    conversations: conversations.map((c) => shape(c, req.user._id)),
  });
});

/**
 * POST /api/chat/conversations — opens (or reuses) the 1:1 thread between the
 * patient and a donor. Called when a patient taps "Message" on a match card.
 */
export const startConversation = asyncHandler(async (req, res) => {
  const peerId = req.body.donorId || req.body.userId;
  if (String(peerId) === String(req.user._id)) {
    throw ApiError.badRequest('You cannot start a conversation with yourself');
  }

  const peer = await User.findById(peerId).select('name role bloodGroup avatarUrl lastSeenAt');
  if (!peer) throw ApiError.notFound('That user does not exist');

  const conversation = await Conversation.findOrCreate(
    req.user._id,
    peer._id,
    req.body.requestId || null
  );
  await conversation.populate('participants', 'name role bloodGroup avatarUrl lastSeenAt');

  emitToUsers([peer._id], 'chat:conversation', shape(conversation, peer._id));

  res.status(201).json({ success: true, conversation: shape(conversation, req.user._id) });
});

/** GET /api/chat/conversations/:id/messages?before=<iso>&limit=50 */
export const getMessages = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id);
  if (!conversation) throw ApiError.notFound('Conversation not found');
  if (!conversation.participants.some((p) => String(p) === String(req.user._id))) {
    throw ApiError.forbidden('You are not part of this conversation');
  }

  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const filter = { conversation: conversation._id };
  if (req.query.before) filter.createdAt = { $lt: new Date(req.query.before) };

  const messages = await Message.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('sender', 'name avatarUrl')
    .lean();

  // Opening the thread clears its badge — mirrors the `chat:read` socket event.
  conversation.unread.set(String(req.user._id), 0);
  await conversation.save();
  await Message.updateMany(
    { conversation: conversation._id, readBy: { $ne: req.user._id } },
    { $addToSet: { readBy: req.user._id } }
  );

  res.json({
    success: true,
    hasMore: messages.length === limit,
    messages: messages.reverse(),
  });
});

/**
 * POST /api/chat/conversations/:id/messages
 * REST fallback for when the websocket is unavailable — same side effects.
 */
export const sendMessage = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id);
  if (!conversation) throw ApiError.notFound('Conversation not found');
  if (!conversation.participants.some((p) => String(p) === String(req.user._id))) {
    throw ApiError.forbidden('You are not part of this conversation');
  }

  const message = await Message.create({
    conversation: conversation._id,
    sender: req.user._id,
    body: req.body.body,
    readBy: [req.user._id],
  });

  conversation.lastMessage = {
    body: message.body,
    sender: req.user._id,
    sentAt: message.createdAt,
  };
  conversation.participants
    .filter((p) => String(p) !== String(req.user._id))
    .forEach((p) => {
      const key = String(p);
      conversation.unread.set(key, (conversation.unread.get(key) || 0) + 1);
    });
  await conversation.save();

  const payload = {
    _id: String(message._id),
    conversation: String(conversation._id),
    sender: { _id: req.user._id, name: req.user.name },
    body: message.body,
    createdAt: message.createdAt,
  };

  emitToUsers(conversation.participants, 'chat:message', payload);

  res.status(201).json({ success: true, message: payload });
});
