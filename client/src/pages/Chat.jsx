import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MessagesSquare, Send } from 'lucide-react';
import { endpoints } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocket, useSocketEvent } from '../context/SocketContext.jsx';
import { EmptyState, PageLoader } from '../components/ui/Feedback.jsx';
import { formatTime, initials, timeAgo } from '../utils/format.js';

const dayKey = (d) => new Date(d).toDateString();

const dayLabel = (d) => {
  const date = new Date(d);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (dayKey(date) === dayKey(today)) return 'Today';
  if (dayKey(date) === dayKey(yesterday)) return 'Yesterday';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
};

export default function Chat() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { socket, connected, isUserOnline } = useSocket();

  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);

  const bottomRef = useRef(null);
  const typingTimeout = useRef(null);

  const active = useMemo(
    () => conversations.find((c) => c._id === conversationId) || null,
    [conversations, conversationId]
  );

  // --- conversation list ---------------------------------------------------
  const loadConversations = useCallback(async () => {
    const { data } = await endpoints.chat.conversations();
    setConversations(data.conversations);
    setLoadingList(false);
    return data.conversations;
  }, []);

  useEffect(() => {
    loadConversations().catch(() => setLoadingList(false));
  }, [loadConversations]);

  // --- active thread -------------------------------------------------------
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return undefined;
    }
    let cancelled = false;
    setLoadingThread(true);
    setPeerTyping(false);

    endpoints.chat
      .messages(conversationId)
      .then(({ data }) => {
        if (!cancelled) setMessages(data.messages);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoadingThread(false));

    // Clear this thread's unread badge locally too.
    setConversations((prev) =>
      prev.map((c) => (c._id === conversationId ? { ...c, unread: 0 } : c))
    );

    return () => { cancelled = true; };
  }, [conversationId]);

  // Join/leave the socket room for the open conversation.
  useEffect(() => {
    if (!socket || !conversationId) return undefined;
    socket.emit('chat:join', { conversationId });
    socket.emit('chat:read', { conversationId });
    return () => socket.emit('chat:leave', { conversationId });
  }, [socket, conversationId, connected]);

  useSocketEvent('chat:message', (msg) => {
    if (msg.conversation === conversationId) {
      setMessages((prev) => (prev.some((m) => m._id === msg._id) ? prev : [...prev, msg]));
      setPeerTyping(false);
      socket?.emit('chat:read', { conversationId });
    }
    setConversations((prev) =>
      prev
        .map((c) =>
          c._id === msg.conversation
            ? {
                ...c,
                lastMessage: { body: msg.body, sender: msg.sender._id, sentAt: msg.createdAt },
                unread:
                  msg.conversation === conversationId || msg.sender._id === user._id
                    ? 0
                    : (c.unread || 0) + 1,
                updatedAt: msg.createdAt,
              }
            : c
        )
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    );
  });

  // A conversation opened by the other party appears without a refresh.
  useSocketEvent('chat:conversation', () => { loadConversations().catch(() => {}); });

  useSocketEvent('chat:typing', (payload) => {
    if (payload.conversationId === conversationId && payload.userId !== user._id) {
      setPeerTyping(payload.isTyping);
    }
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, peerTyping]);

  // --- sending -------------------------------------------------------------
  const handleTyping = (value) => {
    setDraft(value);
    if (!socket || !conversationId) return;
    socket.emit('chat:typing', { conversationId, isTyping: true });
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(
      () => socket.emit('chat:typing', { conversationId, isTyping: false }),
      1200
    );
  };

  const send = async (e) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !conversationId) return;
    setDraft('');
    socket?.emit('chat:typing', { conversationId, isTyping: false });

    if (socket?.connected) {
      socket.emit('chat:message', { conversationId, body }, (res) => {
        if (!res?.ok) setDraft(body); // put the text back if the server rejected it
      });
    } else {
      // Websocket down — fall back to REST so the message still lands.
      try {
        const { data } = await endpoints.chat.send(conversationId, body);
        setMessages((prev) => [...prev, data.message]);
      } catch {
        setDraft(body);
      }
    }
  };

  if (loadingList) return <PageLoader label="Loading your conversations…" />;

  return (
    <div className="container" style={{ paddingBlock: '1.5rem' }}>
      <div className="chat-shell" data-view={conversationId ? 'thread' : 'list'}>
        {/* --------------------------------------------------- sidebar --- */}
        <aside className="chat-sidebar">
          <div className="chat-header">
            <MessagesSquare size={18} style={{ color: 'var(--brand)' }} />
            <strong className="grow">Messages</strong>
            <span className={`presence ${connected ? 'presence-on' : ''}`} title={connected ? 'Live' : 'Reconnecting…'} />
          </div>

          <div className="chat-list">
            {conversations.length === 0 ? (
              <div style={{ padding: '1.5rem' }}>
                <EmptyState
                  title="No conversations yet"
                  description="Message a donor from your match list and the thread will show up here."
                />
              </div>
            ) : (
              conversations.map((c) => (
                <button
                  key={c._id}
                  type="button"
                  className="chat-item"
                  aria-current={c._id === conversationId}
                  onClick={() => navigate(`/chat/${c._id}`)}
                >
                  <span className="avatar">{initials(c.peer?.name || '?')}</span>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="between gap-2">
                      <strong className="small truncate">{c.peer?.name || 'Unknown'}</strong>
                      <span className="tiny muted">{c.lastMessage?.sentAt ? timeAgo(c.lastMessage.sentAt) : ''}</span>
                    </span>
                    <span className="row gap-1">
                      <span className={`presence ${isUserOnline(c.peer?._id) ? 'presence-on' : ''}`} />
                      <span className="tiny muted truncate grow" style={{ textAlign: 'left' }}>
                        {c.lastMessage?.body || 'No messages yet'}
                      </span>
                      {c.unread > 0 && <span className="count-dot">{c.unread}</span>}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* ---------------------------------------------------- thread --- */}
        <section className="chat-main">
          {!active ? (
            <EmptyState
              icon={MessagesSquare}
              title="Select a conversation"
              description="Pick a thread on the left, or start one from a donor match card."
            />
          ) : (
            <>
              <header className="chat-header">
                <button
                  type="button"
                  className="btn btn-icon chat-back"
                  onClick={() => navigate('/chat')}
                  aria-label="Back to conversations"
                >
                  <ArrowLeft size={18} />
                </button>
                <span className="avatar">{initials(active.peer?.name || '?')}</span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <strong className="truncate">{active.peer?.name}</strong>
                  <p className="tiny muted row gap-1">
                    <span className={`presence ${isUserOnline(active.peer?._id) ? 'presence-on' : ''}`} />
                    {isUserOnline(active.peer?._id) ? 'Online' : `Last seen ${timeAgo(active.peer?.lastSeenAt)}`}
                    {active.peer?.bloodGroup && ` · ${active.peer.bloodGroup}`}
                  </p>
                </div>
                {active.peer?.bloodGroup && (
                  <span className="blood-chip blood-chip-sm">{active.peer.bloodGroup}</span>
                )}
              </header>

              <div className="chat-body">
                {loadingThread ? (
                  <PageLoader label="Loading messages…" />
                ) : (
                  messages.map((m, i) => {
                    const senderId = m.sender?._id || m.sender;
                    const mine = String(senderId) === String(user._id);
                    const showDay = i === 0 || dayKey(messages[i - 1].createdAt) !== dayKey(m.createdAt);
                    return (
                      <div key={m._id} style={{ display: 'contents' }}>
                        {showDay && <span className="day-sep">{dayLabel(m.createdAt)}</span>}
                        <div className={`bubble ${mine ? 'mine' : ''}`}>
                          {m.body}
                          <span className="bubble-time">{formatTime(m.createdAt)}</span>
                        </div>
                      </div>
                    );
                  })
                )}

                {peerTyping && (
                  <div className="bubble">
                    <span className="typing" aria-label={`${active.peer?.name} is typing`}>
                      <i /><i /><i />
                    </span>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              <form className="chat-composer" onSubmit={send}>
                <input
                  className="input"
                  value={draft}
                  onChange={(e) => handleTyping(e.target.value)}
                  placeholder={connected ? 'Write a message…' : 'Reconnecting — messages will still send'}
                  maxLength={2000}
                  aria-label="Message"
                />
                <button type="submit" className="btn btn-primary" disabled={!draft.trim()}>
                  <Send size={16} />
                  <span className="sr-only">Send</span>
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
