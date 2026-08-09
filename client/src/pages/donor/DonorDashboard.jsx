import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, CalendarClock, Clock, Droplet, HeartHandshake, MapPin, Zap } from 'lucide-react';
import { endpoints } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { AppPage } from '../../components/layout/Layout.jsx';
import { EmptyState, ErrorNote, SkeletonCard } from '../../components/ui/Feedback.jsx';
import { formatDate, numberFmt } from '../../utils/format.js';

export default function DonorDashboard() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    endpoints.donors
      .dashboard()
      .then(({ data: res }) => setData(res.dashboard))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const toggleAvailability = async () => {
    const next = !data.isAvailable;
    setSaving(true);
    try {
      await endpoints.donors.setAvailability(next);
      setData((d) => ({ ...d, isAvailable: next }));
      setUser((u) => ({ ...u, donorProfile: { ...u.donorProfile, isAvailable: next } }));
      toast.success(next ? 'You are visible to patients again' : 'You are hidden from match results');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppPage title="Donor dashboard">
        <div className="grid grid-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} height={110} />)}
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage
      title={`Thanks for being here, ${user.name.split(' ')[0]}`}
      subtitle="Your impact, your eligibility, and the requests waiting nearby."
      actions={<Link to="/donor/requests" className="btn btn-primary"><MapPin size={16} /> Nearby requests</Link>}
    >
      <ErrorNote>{error}</ErrorNote>

      {/* ------------------------------------------------- availability --- */}
      <div className="card" style={{ borderColor: data.isAvailable ? 'var(--good)' : 'var(--border)' }}>
        <div className="between wrap gap-3">
          <div className="row gap-3">
            <span className="blood-chip blood-chip-lg">{user.bloodGroup}</span>
            <div>
              <div className="row gap-2">
                <strong>{data.isAvailable ? 'Available to donate' : 'Currently unavailable'}</strong>
                <span className={`badge ${data.isAvailable ? 'badge-good' : ''}`}>
                  {data.isAvailable ? 'Visible in matches' : 'Hidden'}
                </span>
              </div>
              <p className="small dim mt-1">
                {data.isEligibleNow
                  ? 'You have passed the 90-day cooldown — you can donate now.'
                  : `Next eligible in ${data.nextEligibleInDays} days (90-day cooldown).`}
              </p>
            </div>
          </div>
          <button
            type="button"
            className={data.isAvailable ? 'btn btn-ghost' : 'btn btn-primary'}
            onClick={toggleAvailability}
            disabled={saving}
          >
            {saving ? <span className="spinner" /> : <Zap size={16} />}
            {data.isAvailable ? 'Pause my availability' : 'Mark me available'}
          </button>
        </div>
      </div>

      {/* -------------------------------------------------- stat tiles --- */}
      <div className="grid grid-4 mt-3">
        <div className="card stat-tile">
          <Droplet size={18} className="muted" />
          <span className="stat-value tabular">{numberFmt(data.totalDonations)}</span>
          <span className="stat-label">Lifetime donations</span>
        </div>
        <div className="card stat-tile">
          <HeartHandshake size={18} className="muted" />
          <span className="stat-value tabular">{numberFmt(data.livesImpacted)}</span>
          <span className="stat-label">Lives potentially supported</span>
        </div>
        <div className="card stat-tile">
          <Award size={18} className="muted" />
          <span className="stat-value tabular">
            {data.acceptanceRate == null ? '—' : `${data.acceptanceRate}%`}
          </span>
          <span className="stat-label">Requests accepted</span>
        </div>
        <div className="card stat-tile">
          <Clock size={18} className="muted" />
          <span className="stat-value tabular">
            {data.avgResponseMinutes == null ? '—' : `${Math.round(data.avgResponseMinutes)}m`}
          </span>
          <span className="stat-label">Average reply time</span>
        </div>
      </div>

      <p className="tiny muted mt-2">
        Acceptance rate and reply time feed directly into how highly you rank in patients' match
        lists — responding quickly, even to decline, helps everyone.
      </p>

      {/* ---------------------------------------------------- eligibility */}
      <div className="grid grid-2 mt-4">
        <div className="card">
          <div className="row gap-2">
            <CalendarClock size={18} style={{ color: 'var(--brand)' }} />
            <h2 className="h3">Eligibility</h2>
          </div>
          <div className="stack gap-2 mt-2">
            <div className="between small">
              <span className="dim">Last donation</span>
              <strong>{formatDate(data.lastDonationDate)}</strong>
            </div>
            <div className="between small">
              <span className="dim">Days since</span>
              <strong className="tabular">{data.daysSinceLastDonation ?? '—'}</strong>
            </div>
            <div className="between small">
              <span className="dim">Next eligible</span>
              <strong>{data.isEligibleNow ? 'Now' : `in ${data.nextEligibleInDays} days`}</strong>
            </div>
            <div className="score-bar mt-1">
              <span
                style={{
                  width: `${Math.min(100, ((data.daysSinceLastDonation ?? 90) / 90) * 100)}%`,
                  background: data.isEligibleNow ? 'var(--good)' : 'var(--warning)',
                }}
              />
            </div>
            <p className="tiny muted">Whole-blood donations are 90 days apart.</p>
          </div>
        </div>

        <div className="card">
          <h2 className="h3">Recent donations</h2>
          {data.recentDonations.length === 0 ? (
            <EmptyState title="No donations recorded yet" description="Once you donate, your history appears here." />
          ) : (
            <div className="stack gap-2 mt-2">
              {data.recentDonations.map((d) => (
                <div key={d._id} className="between small">
                  <div>
                    <strong>{formatDate(d.donatedAt)}</strong>
                    <p className="tiny muted">{d.hospitalName || d.city || 'Location not recorded'}</p>
                  </div>
                  <span className="badge">{d.units} unit{d.units > 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppPage>
  );
}
