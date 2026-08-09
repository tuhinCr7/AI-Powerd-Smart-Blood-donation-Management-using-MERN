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

/** Human labels for the exclusion counters the API returns. */
const EXCLUSION_LABELS = {
  markedUnavailable: 'have paused their availability',
  declaredChronicIllness: 'declared a chronic illness',
  withinCooldown: 'are inside the 90-day donation cooldown',
  outsideAgeRange: 'are outside the 18–65 age range',
  underWeight: 'are below the 45 kg minimum weight',
  deactivated: 'have a deactivated account',
  noLocationSaved: 'have no location saved',
};

/**
 * Turns "no results" into an explanation. A thin list is almost never an empty
 * register — it is usually a register full of people who each fail one filter.
 */
function ExclusionBreakdown({ excluded, radiusKm }) {
  if (!excluded?.compatibleDonors) return null;

  const reasons = Object.entries(EXCLUSION_LABELS)
    .map(([key, label]) => [key, label, excluded[key] || 0])
    .filter(([, , count]) => count > 0)
    .sort((a, b) => b[2] - a[2]);

  return (
    <div className="panel" style={{ marginTop: '.5rem' }}>
      <p className="small">
        <strong>{excluded.compatibleDonors}</strong> donors in the register have a compatible blood
        group
        {excluded.inYourCity > 0 && <> ({excluded.inYourCity} in your city)</>}, but none reached
        your list.
      </p>
      {reasons.length > 0 && (
        <>
          <p className="tiny muted mt-1">Of those compatible donors:</p>
          <ul className="small dim mt-1" style={{ paddingLeft: '1.1rem' }}>
            {reasons.map(([key, label, count]) => (
              <li key={key}>
                <strong className="tabular">{count}</strong> {label}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="tiny muted mt-2">
        Counts overlap — one donor can fail more than one check. Donors outside your {radiusKm} km
        radius are not counted here; widening the radius may surface more.
      </p>
    </div>
  );
}

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
                {state.meta.tierCounts?.exact > 0 && (
                  <> <strong>{state.meta.tierCounts.exact}</strong> exact {filters.bloodGroup} matches, listed first.</>
                )}
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

          {model.bands && (
            <>
              <p className="label mt-3">Score bands — blood group decides which one you land in</p>
              <div className="table-wrap mt-1">
                <table className="data">
                  <thead>
                    <tr><th>Band</th><th className="num">Score</th><th>Meaning</th></tr>
                  </thead>
                  <tbody>
                    {model.bands.map((b) => (
                      <tr key={b.label}>
                        <td><strong className="small">{b.label}</strong></td>
                        <td className="num tabular">{b.band}</td>
                        <td className="small dim">{b.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

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
        <div className="card">
          <EmptyState
            icon={SearchX}
            title="No eligible donors in range"
            description="Try widening the search radius, or check that your city and location are set on your profile."
          />
          <ExclusionBreakdown excluded={state.meta?.excluded} radiusKm={filters.radiusKm} />
        </div>
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
