import { useCallback, useEffect, useState } from 'react';
import { endpoints } from '../../api/client.js';
import { ErrorNote, SkeletonCard } from '../../components/ui/Feedback.jsx';
import { BLOOD_GROUPS, URGENCY_OPTIONS, formatDate, statusClass, urgencyClass } from '../../utils/format.js';

export default function AdminRequests() {
  const [filters, setFilters] = useState({ status: '', urgency: '', bloodGroup: '', page: 1 });
  const [state, setState] = useState({ requests: [], pagination: null, loading: true, error: '' });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const query = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''));
      const { data } = await endpoints.admin.requests(query);
      setState({ requests: data.requests, pagination: data.pagination, loading: false, error: '' });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err.message }));
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const update = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value, page: 1 }));

  return (
    <div className="stack gap-3">
      <div className="card">
        <div className="row gap-3 wrap">
          <div className="field" style={{ minWidth: '10rem' }}>
            <label className="label" htmlFor="status">Status</label>
            <select id="status" className="select" value={filters.status} onChange={update('status')}>
              <option value="">All statuses</option>
              <option value="open">Open</option>
              <option value="matched">Matched</option>
              <option value="fulfilled">Fulfilled</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div className="field" style={{ minWidth: '12rem' }}>
            <label className="label" htmlFor="urgency">Urgency</label>
            <select id="urgency" className="select" value={filters.urgency} onChange={update('urgency')}>
              <option value="">Any urgency</option>
              {URGENCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="field" style={{ minWidth: '8rem' }}>
            <label className="label" htmlFor="bg">Blood group</label>
            <select id="bg" className="select" value={filters.bloodGroup} onChange={update('bloodGroup')}>
              <option value="">Any</option>
              {BLOOD_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        </div>
      </div>

      <ErrorNote>{state.error}</ErrorNote>

      {state.loading ? (
        <SkeletonCard height={340} />
      ) : (
        <>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Group</th>
                  <th className="num">Units</th>
                  <th>Urgency</th>
                  <th>Status</th>
                  <th>Hospital</th>
                  <th className="num">Matches</th>
                  <th>Raised</th>
                </tr>
              </thead>
              <tbody>
                {state.requests.map((r) => (
                  <tr key={r._id}>
                    <td>
                      <strong className="small">{r.patient?.name || 'Unknown'}</strong>
                      <p className="tiny muted">{r.patient?.phone || r.patient?.email || ''}</p>
                    </td>
                    <td><span className="blood-chip blood-chip-sm">{r.bloodGroup}</span></td>
                    <td className="num tabular">{r.unitsFulfilled}/{r.unitsNeeded}</td>
                    <td><span className={urgencyClass(r.urgency)}>{r.urgency}</span></td>
                    <td><span className={statusClass(r.status)}>{r.status}</span></td>
                    <td className="small dim">{r.hospitalName || '—'}</td>
                    <td className="num tabular">{r.matches?.length || 0}</td>
                    <td className="small dim">{formatDate(r.createdAt)}</td>
                  </tr>
                ))}
                {state.requests.length === 0 && (
                  <tr><td colSpan={8} className="center muted" style={{ padding: '2.5rem' }}>No requests match those filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {state.pagination && state.pagination.pages > 1 && (
            <div className="row gap-2" style={{ justifyContent: 'center' }}>
              <button type="button" className="btn btn-ghost btn-sm" disabled={filters.page <= 1}
                onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>Previous</button>
              <span className="small muted tabular">
                Page {state.pagination.page} of {state.pagination.pages} · {state.pagination.total} requests
              </span>
              <button type="button" className="btn btn-ghost btn-sm" disabled={filters.page >= state.pagination.pages}
                onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
