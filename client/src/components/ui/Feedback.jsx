import { AlertCircle, Inbox } from 'lucide-react';

export function Spinner({ label = 'Loading' }) {
  return (
    <span className="row gap-2 muted small">
      <span className="spinner" aria-hidden="true" />
      {label}
    </span>
  );
}

export function PageLoader({ label = 'Loading…' }) {
  return (
    <div className="empty">
      <span className="spinner" style={{ width: '1.6rem', height: '1.6rem' }} aria-hidden="true" />
      <p className="muted">{label}</p>
    </div>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return (
    <div className="alert alert-error" role="alert">
      <AlertCircle size={17} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }) {
  return (
    <div className="empty">
      <Icon size={30} className="muted" aria-hidden="true" />
      <h3 className="h3">{title}</h3>
      {description && <p className="small dim" style={{ maxWidth: '34ch' }}>{description}</p>}
      {action}
    </div>
  );
}

export function SkeletonCard({ height = 120 }) {
  return <div className="skeleton" style={{ height }} />;
}
