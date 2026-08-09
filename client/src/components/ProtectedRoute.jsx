import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { PageLoader } from './ui/Feedback.jsx';

/** The landing page for each role after login. */
export const homeFor = (role) =>
  ({ admin: '/admin', donor: '/donor', patient: '/patient' })[role] || '/';

/**
 * Gates a route on authentication and, optionally, on role.
 * Signed-out visitors are sent to /login with a `from` hint so they land back
 * where they were headed.
 */
export default function ProtectedRoute({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoader label="Checking your session…" />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;

  return children;
}

/** Keeps signed-in users off /login and /register. */
export function GuestRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (user) return <Navigate to={homeFor(user.role)} replace />;
  return children;
}
