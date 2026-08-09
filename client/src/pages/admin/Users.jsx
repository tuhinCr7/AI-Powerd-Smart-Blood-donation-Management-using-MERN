import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BadgeCheck, Ban, RotateCcw, Search, Trash2 } from 'lucide-react';
import { endpoints } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import { ErrorNote, SkeletonCard } from '../../components/ui/Feedback.jsx';
import { BLOOD_GROUPS, formatDate, initials } from '../../utils/format.js';

export default function AdminUsers() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const [filters, setFilters] = useState({
    q: params.get('q') || '',
    role: params.get('role') || '',
    bloodGroup: params.get('bloodGroup') || '',
    verified: params.get('verified') || '',
    page: 1,
  });
  const [state, setState] = useState({ users: [], pagination: null, loading: true, error: '' });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const query = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''));
      const { data } = await endpoints.admin.users(query);
      setState({ users: data.users, pagination: data.pagination, loading: false, error: '' });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err.message }));
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const update = (key) => (e) => {
    setFilters((f) => ({ ...f, [key]: e.target.value, page: 1 }));
    const next = new URLSearchParams(params);
    if (e.target.value) next.set(key, e.target.value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const patch = async (id, body, message) => {
    try {
      await endpoints.admin.updateUser(id, body);
      toast.success(message);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async (user) => {
    if (!window.confirm(`Permanently delete ${user.name}? This cannot be undone.`)) return;
    try {
      await endpoints.admin.deleteUser(user._id);
      toast.success('User deleted');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="stack gap-3">
      <div className="card">
        <div className="row gap-3 wrap">
          <div className="field grow" style={{ minWidth: '14rem' }}>
            <label className="label" htmlFor="q">Search</label>
            <div className="row gap-2">
              <Search size={16} className="muted" />
              <input id="q" className="input" placeholder="Name, email or phone" value={filters.q} onChange={update('q')} />
            </div>
          </div>
          <div className="field" style={{ minWidth: '9rem' }}>
            <label className="label" htmlFor="role">Role</label>
            <select id="role" className="select" value={filters.role} onChange={update('role')}>
              <option value="">All roles</option>
              <option value="donor">Donors</option>
              <option value="patient">Patients</option>
              <option value="admin">Admins</option>
            </select>
          </div>
          <div className="field" style={{ minWidth: '8rem' }}>
            <label className="label" htmlFor="bg">Blood group</label>
            <select id="bg" className="select" value={filters.bloodGroup} onChange={update('bloodGroup')}>
              <option value="">Any</option>
              {BLOOD_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="field" style={{ minWidth: '10rem' }}>
            <label className="label" htmlFor="ver">Verification</label>
            <select id="ver" className="select" value={filters.verified} onChange={update('verified')}>
              <option value="">All</option>
              <option value="false">Unverified only</option>
              <option value="true">Verified only</option>
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
                  <th>User</th>
                  <th>Role</th>
                  <th>Group</th>
                  <th>City</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th className="num">Actions</th>
                </tr>
              </thead>
              <tbody>
                {state.users.map((u) => (
                  <tr key={u._id}>
                    <td>
                      <div className="row gap-2">
                        <span className="avatar" style={{ width: '2.1rem', height: '2.1rem', fontSize: '.75rem' }}>
                          {initials(u.name)}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <strong className="small">{u.name}</strong>
                          <p className="tiny muted truncate">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td><span className="badge">{u.role}</span></td>
                    <td><span className="blood-chip blood-chip-sm">{u.bloodGroup}</span></td>
                    <td className="small dim">{u.address?.city || '—'}</td>
                    <td>
                      <div className="row gap-1 wrap">
                        {u.isVerified
                          ? <span className="badge badge-good"><BadgeCheck size={12} /> Verified</span>
                          : <span className="badge badge-warning">Pending</span>}
                        {!u.isActive && <span className="badge badge-critical">Disabled</span>}
                        {u.role === 'donor' && u.donorProfile?.isAvailable && (
                          <span className="badge">Available</span>
                        )}
                      </div>
                    </td>
                    <td className="small dim">{formatDate(u.createdAt)}</td>
                    <td className="num">
                      <div className="row gap-1" style={{ justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn btn-subtle btn-sm"
                          onClick={() => patch(u._id, { isVerified: !u.isVerified },
                            u.isVerified ? 'Verification removed' : 'User verified')}
                        >
                          {u.isVerified ? 'Unverify' : 'Verify'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          title={u.isActive ? 'Deactivate account' : 'Reactivate account'}
                          onClick={() => patch(u._id, { isActive: !u.isActive },
                            u.isActive ? 'Account deactivated' : 'Account reactivated')}
                        >
                          {u.isActive ? <Ban size={14} /> : <RotateCcw size={14} />}
                        </button>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => remove(u)} title="Delete user">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {state.users.length === 0 && (
                  <tr><td colSpan={7} className="center muted" style={{ padding: '2.5rem' }}>No users match those filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {state.pagination && state.pagination.pages > 1 && (
            <div className="row gap-2" style={{ justifyContent: 'center' }}>
              <button
                type="button" className="btn btn-ghost btn-sm"
                disabled={filters.page <= 1}
                onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
              >
                Previous
              </button>
              <span className="small muted tabular">
                Page {state.pagination.page} of {state.pagination.pages} · {state.pagination.total} users
              </span>
              <button
                type="button" className="btn btn-ghost btn-sm"
                disabled={filters.page >= state.pagination.pages}
                onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
