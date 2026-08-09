import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, MessageSquare, Plus, Sparkles, Users } from 'lucide-react';
import { endpoints } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { AppPage } from '../../components/layout/Layout.jsx';
import MatchCard from '../../components/donor/MatchCard.jsx';
import { EmptyState, ErrorNote, SkeletonCard } from '../../components/ui/Feedback.jsx';
import { formatDate, statusClass, urgencyClass } from '../../utils/format.js';

export default function PatientDashboard() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [reqRes, recoRes] = await Promise.all([
          endpoints.requests.mine(),
          endpoints.reco.list({ limit: 3 }),
        ]);
        if (cancelled) return;
        setRequests(reqRes.data.requests);
        setMatches(recoRes.data.results);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const open = requests.filter((r) => r.status === 'open' || r.status === 'matched');
  const activeRequest = open[0];

  return (
    <AppPage
      title={`Hello, ${user.name.split(' ')[0]}`}
      subtitle="Your requests and the donors our matcher recommends for you right now."
      actions={
        <>
          <Link to="/patient/requests/new" className="btn btn-primary"><Plus size={16} /> New request</Link>
          <Link to="/patient/matches" className="btn btn-ghost"><Sparkles size={16} /> All matches</Link>
        </>
      }
    >
      <ErrorNote>{error}</ErrorNote>

      {/* ---------------------------------------------------- stat tiles --- */}
      <div className="grid grid-4">
        <div className="card stat-tile">
          <span className="blood-chip">{user.bloodGroup}</span>
          <span className="stat-label mt-1">Your blood group</span>
        </div>
        <div className="card stat-tile">
          <Activity size={18} className="muted" />
          <span className="stat-value tabular">{open.length}</span>
          <span className="stat-label">Active requests</span>
        </div>
        <div className="card stat-tile">
          <Users size={18} className="muted" />
          <span className="stat-value tabular">{matches.length ? `${Math.round(matches[0].matchScore)}` : '—'}</span>
          <span className="stat-label">Best match score</span>
        </div>
        <div className="card stat-tile">
          <MessageSquare size={18} className="muted" />
          <span className="stat-value tabular">{requests.length}</span>
          <span className="stat-label">Requests raised</span>
        </div>
      </div>

      {/* ------------------------------------------------ active request --- */}
      <section className="mt-4">
        <div className="between" style={{ marginBottom: '.9rem' }}>
          <h2 className="h2">Active request</h2>
          <Link to="/patient/requests" className="small" style={{ color: 'var(--brand)' }}>
            View all <ArrowRight size={13} style={{ display: 'inline' }} />
          </Link>
        </div>

        {loading ? (
          <SkeletonCard height={120} />
        ) : activeRequest ? (
          <div className="card">
            <div className="between wrap gap-3">
              <div className="row gap-3">
                <span className="blood-chip blood-chip-lg">{activeRequest.bloodGroup}</span>
                <div>
                  <div className="row gap-2 wrap">
                    <strong>{activeRequest.unitsNeeded} unit{activeRequest.unitsNeeded > 1 ? 's' : ''} needed</strong>
                    <span className={urgencyClass(activeRequest.urgency)}>{activeRequest.urgency}</span>
                    <span className={statusClass(activeRequest.status)}>{activeRequest.status}</span>
                  </div>
                  <p className="small dim mt-1">
                    {activeRequest.hospitalName || 'Hospital not set'}
                    {activeRequest.neededBy && ` · needed by ${formatDate(activeRequest.neededBy)}`}
                  </p>
                  <p className="tiny muted">
                    {activeRequest.matches?.length || 0} donors suggested · raised {formatDate(activeRequest.createdAt)}
                  </p>
                </div>
              </div>
              <Link to={`/patient/matches?requestId=${activeRequest._id}&urgency=${activeRequest.urgency}`} className="btn btn-primary">
                <Sparkles size={16} /> Find donors
              </Link>
            </div>
          </div>
        ) : (
          <div className="card">
            <EmptyState
              title="No active request"
              description="Raise a request and the matcher will start ranking eligible donors near you straight away."
              action={<Link to="/patient/requests/new" className="btn btn-primary mt-1"><Plus size={16} /> Create a request</Link>}
            />
          </div>
        )}
      </section>

      {/* ------------------------------------------------------ matches --- */}
      <section className="mt-4">
        <div className="between" style={{ marginBottom: '.9rem' }}>
          <div>
            <h2 className="h2">Recommended for you</h2>
            <p className="small dim">Top donors compatible with {user.bloodGroup}, closest and most responsive first.</p>
          </div>
          <Link to="/patient/matches" className="btn btn-ghost btn-sm">See all</Link>
        </div>

        {loading ? (
          <div className="grid grid-3">
            {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} height={230} />)}
          </div>
        ) : matches.length === 0 ? (
          <div className="card">
            <EmptyState
              title="No matches yet"
              description="Add your city or location to your profile so we can search around you."
              action={<Link to="/profile" className="btn btn-subtle mt-1">Update profile</Link>}
            />
          </div>
        ) : (
          <div className="grid grid-3">
            {matches.map((m) => (
              <MatchCard key={m.donor._id} match={m} requestId={activeRequest?._id} />
            ))}
          </div>
        )}
      </section>
    </AppPage>
  );
}
