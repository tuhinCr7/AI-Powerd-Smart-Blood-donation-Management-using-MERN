import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Info, RefreshCw, SearchX, Sparkles } from 'lucide-react';
import { endpoints } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { AppPage } from '../../components/layout/Layout.jsx';
import MatchCard from '../../components/donor/MatchCard.jsx';
import { EmptyState, ErrorNote, SkeletonCard } from '../../components/ui/Feedback.jsx';
import { BLOOD_GROUPS, URGENCY_OPTIONS } from '../../utils/format.js';

const RADIUS_OPTIONS = [5, 10, 25, 50, 100];

/**
 * The AI recommendation screen: filters on top, ranked donor cards below, and
 * a model card explaining what the ranking is actually doing.
 */
export default function Matches() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const requestId = params.get('requestId') || undefined;

  const [filters, setFilters] = useState({
    bloodGroup: params.get('bloodGroup') || user.bloodGroup,
    urgency: params.get('urgency') || 'normal',
    radiusKm: Number(params.get('radiusKm')) || 25,
    limit: 12,
  });

  const [state, setState] = useState({ loading: true, error: '', results: [], meta: null });
  const [model, setModel] = useState(null);
  const [showModel, setShowModel] = useState(false);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const { data } = await endpoints.reco.list({ ...filters, ...(requestId ? { requestId } : {}) });
      setState({ loading: false, error: '', results: data.results, meta: data.meta });
    } catch (err) {
      setState({ loading: false, error: err.message, results: [], meta: null });
    }
  }, [filters, requestId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    endpoints.reco.explain().then(({ data }) => setModel(data.model)).catch(() => {});
  }, []);

  const update = (key) => (e) => {
    const value = key === 'radiusKm' ? Number(e.target.value) : e.target.value;
    setFilters((f) => ({ ...f, [key]: value }));
    const next = new URLSearchParams(params);
    next.set(key, String(value));
    setParams(next, { replace: true });
  };

  return (
    <AppPage
      title="AI-recommended donors"
      subtitle="Ranked by compatibility, distance, readiness and how reliably each donor responds."
      actions={
        <>
          <button type="button" className="btn btn-ghost" onClick={() => setShowModel((v) => !v)}>
            <Info size={16} /> How ranking works
          </button>
          <button type="button" className="btn btn-subtle" onClick={load} disabled={state.loading}>
            <RefreshCw size={16} /> Refresh
          </button>
        </>
      }
    >
      {/* ------------------------------------------------------- filters --- */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="row gap-3 wrap">
          <div className="field" style={{ minWidth: '9rem' }}>
            <label className="label" htmlFor="bg">Blood group needed</label>
            <select id="bg" className="select" value={filters.bloodGroup} onChange={update('bloodGroup')}>
              {BLOOD_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          <div className="field" style={{ minWidth: '13rem' }}>
            <label className="label" htmlFor="urg">Urgency</label>
            <select id="urg" className="select" value={filters.urgency} onChange={update('urgency')}>
              {URGENCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="field" style={{ minWidth: '9rem' }}>
            <label className="label" htmlFor="rad">Search radius</label>
            <select id="rad" className="select" value={filters.radiusKm} onChange={update('radiusKm')}>
              {RADIUS_OPTIONS.map((r) => <option key={r} value={r}>{r} km</option>)}
            </select>
          </div>

          {state.meta && (
            <div className="grow" style={{ alignSelf: 'flex-end', minWidth: '14rem' }}>
              <p className="tiny muted">
                Compatible groups: <strong>{state.meta.compatibleGroups.join(', ')}</strong>
                <br />
                {state.meta.candidatesEvaluated} donors evaluated
                {state.meta.usedGeoIndex ? ' using your saved location' : ' by city (no location saved)'}.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ---------------------------------------------------- model card --- */}
      {showModel && model && (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <div className="row gap-2">
            <Sparkles size={17} style={{ color: 'var(--brand)' }} />
            <h3 className="h3">{model.name} · v{model.version}</h3>
          </div>
          <p className="small dim mt-1">{model.approach}</p>

          <div className="grid grid-2 mt-3">
            <div>
              <p className="label">Scored factors</p>
              <ul className="small dim stack gap-1 mt-1" style={{ paddingLeft: '1.1rem' }}>
                {model.features.map((f) => (
                  <li key={f.key}><strong>{f.label}</strong> — {f.detail}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="label">Hard filters applied first</p>
              <ul className="small dim stack gap-1 mt-1" style={{ paddingLeft: '1.1rem' }}>
                {model.hardFilters.map((f) => <li key={f}>{f}</li>)}
              </ul>
            </div>
          </div>

          {state.meta && (
            <p className="tiny muted mt-3">
              Weights in use for <strong>{state.meta.urgency}</strong> urgency:{' '}
              {Object.entries(state.meta.weights).map(([k, v]) => `${k} ${v}`).join(' · ')}
            </p>
          )}
        </div>
      )}

      <ErrorNote>{state.error}</ErrorNote>

      {/* ------------------------------------------------------- results --- */}
      {state.loading ? (
        <div className="grid grid-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} height={230} />)}
        </div>
      ) : state.results.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No eligible donors in range"
          description="Try widening the search radius, or check that your city and location are set on your profile."
        />
      ) : (
        <div className="grid grid-3">
          {state.results.map((m) => (
            <MatchCard key={m.donor._id} match={m} requestId={requestId} />
          ))}
        </div>
      )}

      {state.meta && !state.loading && (
        <p className="tiny muted center mt-3">
          Suggestions only. Every donor is re-screened at the collection centre before donating.
        </p>
      )}
    </AppPage>
  );
}
