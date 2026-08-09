import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Plus, Sparkles, X } from 'lucide-react';
import { endpoints } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useSocketEvent } from '../../context/SocketContext.jsx';
import { AppPage } from '../../components/layout/Layout.jsx';
import { EmptyState, ErrorNote, SkeletonCard } from '../../components/ui/Feedback.jsx';
import { formatDate, initials, statusClass, urgencyClass } from '../../utils/format.js';

export default function MyRequests() {
  const toast = useToast();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () =>
    endpoints.requests
      .mine()
      .then(({ data }) => setRequests(data.requests))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  // A donor accepting shows up here without a refresh.
  useSocketEvent('request:response', ({ donor, action }) => {
    toast.push(`${donor.name} ${action} your request`, action === 'accepted' ? 'success' : 'info');
    load();
  });

  const cancel = async (id) => {
    try {
      await endpoints.requests.cancel(id);
      toast.success('Request cancelled');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const confirmDonation = async (requestId, donorId) => {
    try {
      await endpoints.requests.fulfil(requestId, { donorId, units: 1 });
      toast.success('Donation recorded — thank you');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <AppPage
      title="My requests"
      subtitle="Everything you have raised, and how donors responded."
      actions={<Link to="/patient/requests/new" className="btn btn-primary"><Plus size={16} /> New request</Link>}
    >
      <ErrorNote>{error}</ErrorNote>

      {loading ? (
        <div className="stack gap-3">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} height={150} />)}
        </div>
      ) : requests.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={ClipboardList}
            title="You have not raised a request yet"
            description="Create one and the matcher will rank compatible donors near you immediately."
            action={<Link to="/patient/requests/new" className="btn btn-primary mt-1"><Plus size={16} /> Create a request</Link>}
          />
        </div>
      ) : (
        <div className="stack gap-3">
          {requests.map((r) => {
            const responders = (r.matches || []).filter((m) =>
              ['accepted', 'contacted', 'donated'].includes(m.status)
            );
            const isOpen = r.status === 'open' || r.status === 'matched';

            return (
              <article key={r._id} className="card">
                <div className="between wrap gap-3">
                  <div className="row gap-3">
                    <span className="blood-chip blood-chip-lg">{r.bloodGroup}</span>
                    <div>
                      <div className="row gap-2 wrap">
                        <strong>{r.unitsNeeded} unit{r.unitsNeeded > 1 ? 's' : ''}</strong>
                        <span className={urgencyClass(r.urgency)}>{r.urgency}</span>
                        <span className={statusClass(r.status)}>{r.status}</span>
                      </div>
                      <p className="small dim mt-1">
                        {r.hospitalName || 'Hospital not set'} · raised {formatDate(r.createdAt)}
                        {r.neededBy && ` · needed by ${formatDate(r.neededBy)}`}
                      </p>
                      <p className="tiny muted">
                        {r.unitsFulfilled}/{r.unitsNeeded} units fulfilled · {r.matches?.length || 0} donors suggested
                      </p>
                    </div>
                  </div>

                  <div className="row gap-2 wrap">
                    {isOpen && (
                      <>
                        <Link
                          to={`/patient/matches?requestId=${r._id}&urgency=${r.urgency}&bloodGroup=${r.bloodGroup}`}
                          className="btn btn-primary btn-sm"
                        >
                          <Sparkles size={15} /> Find donors
                        </Link>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => cancel(r._id)}>
                          <X size={15} /> Cancel
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {r.note && <p className="small dim mt-2" style={{ fontStyle: 'italic' }}>“{r.note}”</p>}

                {responders.length > 0 && (
                  <>
                    <hr className="divider mt-3" />
                    <p className="label mt-2">Donors who responded</p>
                    <div className="stack gap-2 mt-1">
                      {responders.map((m) => (
                        <div key={m.donor?._id || m.donor} className="match-row">
                          <span className="avatar">{initials(m.donor?.name || '?')}</span>
                          <div className="grow">
                            <strong className="small">{m.donor?.name || 'Donor'}</strong>
                            <p className="tiny muted">
                              {m.donor?.bloodGroup} · {m.status}
                              {m.matchScore != null && ` · ${Math.round(m.matchScore)} match score`}
                            </p>
                          </div>
                          {m.status !== 'donated' && isOpen && (
                            <button
                              type="button"
                              className="btn btn-subtle btn-sm"
                              onClick={() => confirmDonation(r._id, m.donor?._id || m.donor)}
                            >
                              Confirm donation
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
    </AppPage>
  );
}
