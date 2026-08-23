import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Droplet, LayoutDashboard, LogOut, Menu, MessageSquare, Moon, Sun, User, X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSocket, useSocketEvent } from '../../context/SocketContext.jsx';
import { endpoints } from '../../api/client.js';
import { initials } from '../../utils/format.js';
import { homeFor } from '../ProtectedRoute.jsx';

/** Links shown per role — drives both the desktop bar and the mobile drawer. */
const linksFor = (user) => {
  if (!user) {
    return [
      { to: '/', label: 'Home', end: true },
      { to: '/#how', label: 'How it works' },
      { to: '/#features', label: 'Features' },
    ];
  }
  if (user.role === 'admin') {
    return [
      { to: '/admin', label: 'Overview', end: true },
      { to: '/admin/users', label: 'Users' },
      { to: '/admin/requests', label: 'Requests' },
      { to: '/admin/reports', label: 'Reports' },
    ];
  }
  if (user.role === 'donor') {
    return [
      { to: '/donor', label: 'Dashboard', end: true },
      { to: '/donor/requests', label: 'Nearby requests' },
      { to: '/chat', label: 'Messages' },
    ];
  }
  return [
    { to: '/patient', label: 'Dashboard', end: true },
    { to: '/patient/matches', label: 'AI matches' },
    { to: '/patient/requests', label: 'My requests' },
    { to: '/chat', label: 'Messages' },
  ];
};

//for change to dark mode or light mode
function ThemeToggle() {
  const [theme, setTheme] = useState(() => localStorage.getItem('lifelink.theme') || 'system');

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    localStorage.setItem('lifelink.theme', theme);
  }, [theme]);

  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  return (
    <button
      type="button"
      className="btn btn-icon"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
      title={`Switch to ${isDark ? 'light' : 'dark'} theme`}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const { connected } = useSocket();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  const links = linksFor(user);

  useEffect(() => setOpen(false), [location.pathname]);

  // Seed the badge on mount, then keep it live off the socket.
  useEffect(() => {
    if (!user || user.role === 'admin') return;
    endpoints.chat
      .conversations()
      .then(({ data }) =>
        setUnread(data.conversations.reduce((sum, c) => sum + (c.unread || 0), 0))
      )
      .catch(() => {});
  }, [user]);

  useSocketEvent('chat:inbox', () => {
    if (!location.pathname.startsWith('/chat')) setUnread((n) => n + 1);
  });
  useEffect(() => {
    if (location.pathname.startsWith('/chat')) setUnread(0);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <header className="nav">
      <div className="container nav-inner">
        <Link to={user ? homeFor(user.role) : '/'} className="brand">
          <span className="brand-mark">
            <Droplet size={17} fill="currentColor" />
          </span>
          LifeLink
        </Link>

        <nav className="nav-links desktop grow" aria-label="Main">
          {links.map((l) =>
            l.to.includes('#') ? (
              <a key={l.to} href={l.to} className="nav-link">
                {l.label}
              </a>
            ) : (
              <NavLink key={l.to} to={l.to} end={l.end} className="nav-link">
                {l.label}
                {l.to === '/chat' && unread > 0 && (
                  <span className="count-dot" style={{ marginLeft: '.4rem' }}>{unread}</span>
                )}
              </NavLink>
            )
          )}
        </nav>

        <div className="row gap-2" style={{ marginLeft: 'auto' }}>
          <ThemeToggle />

          {user ? (
            <>
              {user.role !== 'admin' && (
                <Link to="/chat" className="btn btn-icon" aria-label="Messages" title="Messages">
                  <MessageSquare size={18} />
                  {unread > 0 && (
                    <span className="count-dot" style={{ marginLeft: '-.35rem', marginTop: '-.6rem' }}>
                      {unread}
                    </span>
                  )}
                </Link>
              )}
              <Link to="/profile" className="row gap-2" title="Your profile">
                <span className="avatar" style={{ width: '2.1rem', height: '2.1rem', fontSize: '.8rem' }}>
                  {initials(user.name)}
                </span>
                <span
                  className={`presence ${connected ? 'presence-on' : ''}`}
                  style={{ marginLeft: '-.9rem', alignSelf: 'flex-end' }}
                  title={connected ? 'Connected' : 'Offline'}
                />
              </Link>
              <button type="button" className="btn btn-icon" onClick={handleLogout} aria-label="Sign out" title="Sign out">
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <div className="row gap-2">
              <Link to="/login" className="btn btn-ghost btn-sm">Log in</Link>
              <Link to="/register" className="btn btn-primary btn-sm">Register</Link>
            </div>
          )}

          <button
            type="button"
            className="btn btn-icon nav-toggle"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="Toggle navigation"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="nav-drawer" aria-label="Mobile">
          {links.map((l) =>
            l.to.includes('#') ? (
              <a key={l.to} href={l.to} className="nav-link">{l.label}</a>
            ) : (
              <NavLink key={l.to} to={l.to} end={l.end} className="nav-link">{l.label}</NavLink>
            )
          )}
          <hr className="divider mt-1" />
          {user ? (
            <>
              <NavLink to="/profile" className="nav-link"><User size={16} /> Profile</NavLink>
              <NavLink to={homeFor(user.role)} className="nav-link"><LayoutDashboard size={16} /> Dashboard</NavLink>
              <button type="button" className="btn btn-ghost mt-1" onClick={handleLogout}>Sign out</button>
            </>
          ) : (
            <div className="stack gap-2 mt-1">
              <Link to="/login" className="btn btn-ghost btn-block">Log in</Link>
              <Link to="/register" className="btn btn-primary btn-block">Create an account</Link>
            </div>
          )}
        </nav>
      )}
    </header>
  );
}
