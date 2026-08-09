import { NavLink, Outlet } from 'react-router-dom';
import { BarChart3, ClipboardList, FileText, LayoutDashboard, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';

const SECTIONS = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'Users', icon: ShieldCheck },
  { to: '/admin/requests', label: 'Requests', icon: ClipboardList },
  { to: '/admin/reports', label: 'Reports', icon: FileText },
];

export default function AdminLayout() {
  const { user } = useAuth();

  return (
    <div className="container" style={{ paddingBlock: '2rem 3.5rem' }}>
      <div className="between wrap gap-3" style={{ marginBottom: '1.5rem' }}>
        <div>
          <span className="eyebrow"><BarChart3 size={13} /> Admin panel</span>
          <h1 className="h1 mt-1">System administration</h1>
          <p className="dim">Signed in as {user.name}</p>
        </div>
      </div>

      <div className="admin-shell">
        <nav className="side-nav" aria-label="Admin sections">
          {SECTIONS.map((s) => (
            <NavLink key={s.to} to={s.to} end={s.end} className="side-link">
              <s.icon size={16} /> {s.label}
            </NavLink>
          ))}
        </nav>

        <div style={{ minWidth: 0 }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
