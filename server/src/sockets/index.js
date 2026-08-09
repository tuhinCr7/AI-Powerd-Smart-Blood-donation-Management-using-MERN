import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { verifyToken } from '../utils/token.js';
import { registerChatHandlers } from './chat.socket.js';

let io = null;

/** userId -> Set of socket ids. Lets us fan a message out to every open tab. */
const online = new Map();

export function getIO() {
  if (!io) throw new Error('Socket.IO has not been initialised yet');
  return io;
}

export const isOnline = (userId) => online.has(String(userId));
export const onlineUserIds = () => [...online.keys()];

/** Emits an event to every socket belonging to the given users. */
export function emitToUsers(userIds, event, payload) {
  if (!io) return;
  userIds.filter(Boolean).forEach((id) => io.to(`user:${String(id)}`).emit(event, payload));
}

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.clientUrl, credentials: true },
    pingTimeout: 30000,
  });

  // Handshake auth: the client passes its JWT in `auth.token`.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.slice(7);
      if (!token) return next(new Error('Authentication required'));
      const payload = verifyToken(token);
      const user = await User.findById(payload.sub).select('name role bloodGroup avatarUrl isActive');
      if (!user || !user.isActive) return next(new Error('Account unavailable'));
      socket.user = { id: String(user._id), name: user.name, role: user.role };
      return next();
    } catch {
      return next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.id;
    socket.join(`user:${userId}`);
    if (socket.user.role === 'admin') socket.join('admins');

    const sockets = online.get(userId) || new Set();
    const wasOffline = sockets.size === 0;
    sockets.add(socket.id);
    online.set(userId, sockets);
    if (wasOffline) socket.broadcast.emit('presence:online', { userId });

    registerChatHandlers(io, socket);

    socket.on('disconnect', async () => {
      const set = online.get(userId);
      if (!set) return;
      set.delete(socket.id);
      if (set.size === 0) {
        online.delete(userId);
        socket.broadcast.emit('presence:offline', { userId, lastSeenAt: new Date() });
        await User.findByIdAndUpdate(userId, { lastSeenAt: new Date() }).catch(() => {});
      }
    });
  });

  console.log('[socket] ready');
  return io;
}
