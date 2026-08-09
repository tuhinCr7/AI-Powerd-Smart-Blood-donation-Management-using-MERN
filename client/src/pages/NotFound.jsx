import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { homeFor } from '../components/ProtectedRoute.jsx';

export default function NotFound() {
  const { user } = useAuth();

  return (
    <div className="container-narrow" style={{ paddingBlock: '5rem' }}>
      <div className="empty">
        <Compass size={34} className="muted" />
        <h1 className="h1">Page not found</h1>
        <p className="dim">That link does not lead anywhere in LifeLink.</p>
        <Link to={user ? homeFor(user.role) : '/'} className="btn btn-primary mt-1">
          {user ? 'Back to your dashboard' : 'Back to the homepage'}
        </Link>
      </div>
    </div>
  );
}
