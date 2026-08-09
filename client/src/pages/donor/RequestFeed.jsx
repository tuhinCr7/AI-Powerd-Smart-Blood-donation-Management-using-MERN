import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, MapPinOff, MessageSquare, X } from 'lucide-react';
import { endpoints } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { AppPage } from '../../components/layout/Layout.jsx';
import { EmptyState, ErrorNote, SkeletonCard } from '../../components/ui/Feedback.jsx';
import { formatDate, initials, timeAgo, urgencyClass } from '../../utils/format.js';

/**
 * Requests a donor is eligible to answer — filtered by ABO/Rh compatibility on
 * the server, and sorted by real distance when the donor has coordinates saved.
 */
export default function RequestFeed() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [feed, setFeed] = useState({ requests: [], radiusKm: 25 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null);

  const load = () =>
    endpoints.requests
      .feed()
      .then(({ data }) => setFeed({ requests: data.requests, radiusKm: data.radiusKm }))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const respond = async (id, action) => {
    setPending(id);
    try {
      await endpoints.requests.respond(id, action);
      toast.success(action === 'accepted' ? 'Accepted — the patient has been notified' : 'Declined');
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPending(null);
    }
  };

  const message = async (request) => {
    try {
      const { data } = await endpoints.chat.start({
        userId: request.patient?._id || request.patient,
        requestId: request._id,
      });
      navigate(`/chat/${data.conversation._id}`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <AppPage
      title="Requests near you"
      subtitle={`Patients whose blood group is compatible with ${user.bloodGroup}, within ${feed.radiusKm} km.`}
    >
      <ErrorNote>{error}</ErrorNote>

      {loading ? (
        <div className="stack gap-3">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} height={140} />)}
        </div>
      ) : feed.requests.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={MapPinOff}
            title="Nothing needs you right now"
            description="No compatible open requests inside your radius. Widen it from your profile, or check back later."
          />
        </div>
      ) : (
        <div className="stack gap-3">
          {feed.requests.map((r) => {
            const patient = r.patient || {};
            // The server hands back only this donor's own entry on the request.
            const alreadyResponded = Boolean(r.myResponse && r.myResponse.status !== 'suggested');

            return (
              <article key={r._id} className="card card-hover">
                <div className="between wrap gap-3">
                  <div className="row gap-3">
                    <span className="blood-chip blood-chip-lg">{r.bloodGroup}</span>
                    <div>
                      <div className="row gap-2 wrap">
                        <strong>{r.unitsNeeded} unit{r.unitsNeeded > 1 ? 's' : ''} needed</strong>
                        <span className={urgencyClass(r.urgency)}>{r.urgency}</span>
                        {r.distanceKm != null && <span className="badge">{r.distanceKm} km away</span>}
                      </div>
                      <p className="small dim mt-1">
                        {r.hospitalName || 'Hospital not set'}
                        {r.address?.district && ` · ${r.address.district}`}
                        {r.neededBy && ` · needed by ${formatDate(r.neededBy)}`}
                      </p>
                      <p className="tiny muted row gap-1">
                        <span className="avatar" style={{ width: '1.3rem', height: '1.3rem', fontSize: '.6rem' }}>
                          {initials(patient.name || '?')}
                        </span>
                        {patient.name || 'Patient'} · posted {timeAgo(r.createdAt)}
                      </p>
                    </div>
                  </div>

                  <div className="row gap-2 wrap">
                    <button type="button" className="btn btn-subtle btn-sm" onClick={() => message(r)}>
                      <MessageSquare size={15} /> Message
                    </button>
                    {alreadyResponded ? (
                      <span className="badge badge-good">You responded</span>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => respond(r._id, 'accepted')}
                          disabled={pending === r._id}
                        >
                          <Check size={15} /> I can donate
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => respond(r._id, 'declined')}
                          disabled={pending === r._id}
                        >
                          <X size={15} /> Not now
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {r.note && <p className="small dim mt-2" style={{ fontStyle: 'italic' }}>“{r.note}”</p>}
              </article>
            );
          })}
        </div>
      )}
    </AppPage>
  );
}
