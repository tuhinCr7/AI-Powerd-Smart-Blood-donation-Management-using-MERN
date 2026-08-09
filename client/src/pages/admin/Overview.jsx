import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Award, CheckCircle2, Droplet, Users } from 'lucide-react';
import { endpoints } from '../../api/client.js';
import { BloodGroupChart, CityChart, TrendChart } from '../../components/admin/Charts.jsx';
import { ErrorNote, SkeletonCard } from '../../components/ui/Feedback.jsx';
import { numberFmt } from '../../utils/format.js';

function StatTile({ icon: Icon, label, value, hint, tone }) {
  return (
    <div className="card stat-tile">
      <div className="row gap-2">
        <Icon size={17} className="muted" aria-hidden="true" />
        {tone && <span className={`badge badge-${tone}`}>{tone === 'critical' ? 'Attention' : 'Healthy'}</span>}
      </div>
      <span className="stat-value tabular">{value}</span>
      <span className="stat-label">{label}</span>
      {hint && <span className="tiny muted">{hint}</span>}
    </div>
  );
}

export default function AdminOverview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    endpoints.admin
      .stats()
      .then(({ data: res }) => setData(res))
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <ErrorNote>{error}</ErrorNote>;

  if (!data) {
    return (
      <div className="stack gap-3">
        <div className="grid grid-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} height={110} />)}
        </div>
        <SkeletonCard height={300} />
      </div>
    );
  }

  const { overview, bloodGroups, trend, cities, topDonors } = data;

  return (
    <div className="stack gap-4">
      <div className="grid grid-4">
        <StatTile icon={Users} label="Registered donors" value={numberFmt(overview.totalDonors)}
          hint={`${numberFmt(overview.availableDonors)} available now`} />
        <StatTile icon={Droplet} label="Open requests" value={numberFmt(overview.openRequests)}
          hint={`${overview.criticalOpen} critical`}
          tone={overview.criticalOpen > 0 ? 'critical' : undefined} />
        <StatTile icon={CheckCircle2} label="Fulfilment rate" value={`${overview.fulfilmentRate}%`}
          hint={`${numberFmt(overview.totalRequests)} requests all-time`} />
        <StatTile icon={Award} label="Donations (30 days)" value={numberFmt(overview.donationsLast30Days)}
          hint={`${numberFmt(overview.totalDonations)} all-time`} />
      </div>

      {overview.pendingVerification > 0 && (
        <div className="alert alert-info">
          <AlertTriangle size={17} aria-hidden="true" />
          <span>
            <strong>{overview.pendingVerification} donors</strong> are waiting for verification.{' '}
            <Link to="/admin/users?verified=false" style={{ color: 'var(--brand)', fontWeight: 600 }}>
              Review them
            </Link>
          </span>
        </div>
      )}

      <TrendChart data={trend} />

      <div className="grid grid-2">
        <BloodGroupChart data={bloodGroups} />
        <CityChart data={cities} />
      </div>

      <div className="grid grid-2">
        {/* The chart's underlying numbers, as required by the accessibility pass. */}
        <section className="chart-card">
          <div className="chart-head"><h3 className="h3">Blood group table</h3></div>
          <div className="table-wrap" style={{ border: 0 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Group</th>
                  <th className="num">Donors</th>
                  <th className="num">Available</th>
                  <th className="num">Open requests</th>
                  <th className="num">Units needed</th>
                </tr>
              </thead>
              <tbody>
                {bloodGroups.map((g) => (
                  <tr key={g.bloodGroup}>
                    <td><span className="blood-chip blood-chip-sm">{g.bloodGroup}</span></td>
                    <td className="num tabular">{g.donors}</td>
                    <td className="num tabular">{g.availableDonors}</td>
                    <td className="num tabular">{g.openRequests}</td>
                    <td className="num tabular">{g.unitsNeeded}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="chart-card">
          <div className="chart-head"><h3 className="h3">Top donors this year</h3></div>
          {topDonors.length === 0 ? (
            <p className="small muted">No donations recorded yet.</p>
          ) : (
            <div className="stack gap-2">
              {topDonors.map((d, i) => (
                <div key={d.donorId} className="match-row">
                  <span className="step-num" style={{ background: 'var(--surface-3)', color: 'var(--text-2)' }}>
                    {i + 1}
                  </span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <strong className="small truncate">{d.name}</strong>
                    <p className="tiny muted">{d.bloodGroup} · {d.city || 'City not set'}</p>
                  </div>
                  <span className="badge">{d.units} units</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
