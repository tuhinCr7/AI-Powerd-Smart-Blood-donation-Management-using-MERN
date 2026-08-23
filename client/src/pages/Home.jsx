import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, ArrowRight, BarChart3, Clock, Heart, MapPin, MessageSquare,
  ShieldCheck, Sparkles, Users, Zap,
} from 'lucide-react';
import { endpoints } from '../api/client.js';
import { numberFmt } from '../utils/format.js';

const FEATURES = [
  {
    icon: Sparkles,
    title: 'Smart donor matches',
    body: 'Every compatible donor is scored on blood-group fit, distance, medical readiness, past reliability and reply speed — then ranked, with the reasoning shown on each card.',
  },
  {
    icon: MessageSquare,
    title: 'Real-time chat',
    body: 'Message a matched donor the moment you find them. Live typing indicators, read receipts and presence, over a websocket — no phone number needed up front.',
  },
  {
    icon: MapPin,
    title: 'Location-aware search',
    body: 'Geospatial queries find donors inside your radius and sort by true distance, so the nearest viable donor surfaces first when minutes matter.',
  },
  {
    icon: ShieldCheck,
    title: 'Eligibility built in',
    body: 'The 90-day donation cooldown, age, weight and health declarations are enforced before anyone appears in your results.',
  },
  {
    icon: BarChart3,
    title: 'Admin reporting',
    body: 'Supply-and-demand by blood group, city hotspots, fulfilment rates and donor leaderboards — exportable to CSV in one click.',
  },
  {
    icon: Zap,
    title: 'Urgency-aware ranking',
    body: 'A critical request reweights the model toward proximity and response speed; a planned transfusion favours reliability and history.',
  },
];

const STEPS = [
  { title: 'Create your account', body: 'Register as a donor or a patient. Set your blood group, location and availability in under a minute.' },
  { title: 'Raise or answer a request', body: 'Patients post what they need and how urgently. Donors see eligible requests inside their own radius.' },
  { title: 'Let the model rank donors', body: 'The recommender scores every compatible donor and explains each match on the card.' },
  { title: 'Chat and confirm', body: 'Agree a time in real-time chat, then confirm the donation so records and reports stay accurate.' },
];

/** Static demo rows for the hero preview — no auth needed to show the idea. */
const PREVIEW = [
  { name: 'Sadia R.', group: 'A+', km: 1.2, score: 94 },
  { name: 'Imran H.', group: 'O-', km: 3.8, score: 88 },
  { name: 'Nusrat K.', group: 'A+', km: 6.4, score: 81 },
];

function LiveStats() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    endpoints.donors
      .publicStats()
      .then(({ data }) => setStats(data.stats))
      .catch(() => setStats(null));
  }, []);

  const tiles = [
    { label: 'Registered donors', value: stats?.donors, icon: Users },
    { label: 'Available right now', value: stats?.availableNow, icon: Activity },
    { label: 'Donations recorded', value: stats?.donations, icon: Heart },
    { label: 'Open requests', value: stats?.openRequests, icon: Clock },
  ];

  return (
    <div className="grid grid-4">
      {tiles.map((t) => (
        <div key={t.label} className="card stat-tile">
          <t.icon size={18} className="muted" aria-hidden="true" />
          <span className="stat-value tabular">{stats ? numberFmt(t.value) : '—'}</span>
          <span className="stat-label">{t.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  return (
    <>
      {/* ---------------------------------------------------------- hero --- */}
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <span className="eyebrow"><Sparkles size={13} /> Smart matching</span>
            <h1 className="display mt-2">
              The right donor,<br />
              <span style={{ color: 'var(--brand)' }}>found in seconds.</span>
            </h1>
            <p className="lead mt-2" style={{ maxWidth: '52ch' }}>
              LifeLink ranks every compatible, eligible donor near you by blood group, distance,
              readiness and how reliably they respond — then puts you straight into a conversation
              with them.
            </p>

            <div className="hero-actions mt-3">
              <Link to="/register" className="btn btn-primary btn-lg">
                Get started <ArrowRight size={17} />
              </Link>
              <a href="#how" className="btn btn-ghost btn-lg">See how it works</a>
            </div>

            <p className="small muted mt-3">
              Demo accounts · <code>patient@lifelink.io</code> · <code>donor@lifelink.io</code> ·{' '}
              <code>admin@lifelink.io</code> — password <code>Password123</code>
            </p>
          </div>

          {/* A miniature of the real match card, so the value is obvious at a glance. */}
          <div className="hero-card" aria-label="Preview of Smart donor matches">
            <div className="between" style={{ marginBottom: '.9rem' }}>
              <div>
                <strong>Top matches</strong>
                <p className="tiny muted">for A+ · Dhanmondi, Dhaka</p>
              </div>
              <span className="badge badge-critical">Critical</span>
            </div>

            {PREVIEW.map((p) => (
              <div key={p.name} className="match-row">
                <span className="blood-chip blood-chip-sm">{p.group}</span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="between gap-2">
                    <strong className="small truncate">{p.name}</strong>
                    <span className="tiny tabular muted">{p.score}% match</span>
                  </div>
                  <div className="score-bar mt-1">
                    <span style={{ width: `${p.score}%` }} />
                  </div>
                  <p className="tiny muted mt-1">{p.km} km away · replies in ~15 min</p>
                </div>
              </div>
            ))}

            <p className="tiny muted mt-2">
              Ranked by compatibility, distance, readiness, reliability and reply speed.
            </p>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- stats --- */}
      <section className="container" style={{ paddingBottom: '1rem' }}>
        <LiveStats />
      </section>

      {/* ------------------------------------------------------ features --- */}
      <section className="section container" id="features">
        <div className="center" style={{ maxWidth: '58ch', marginInline: 'auto' }}>
          <span className="eyebrow">What you get</span>
          <h2 className="h1 mt-2">Everything a blood network needs, in one place</h2>
          <p className="lead mt-2">
            Three roles, one system: donors manage availability, patients find and message matches,
            administrators verify people and generate the reports.
          </p>
        </div>

        <div className="grid grid-3 mt-4">
          {FEATURES.map((f) => (
            <article key={f.title} className="card card-hover">
              <span className="feature-icon"><f.icon size={19} /></span>
              <h3 className="h3 mt-2">{f.title}</h3>
              <p className="small dim mt-1">{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* --------------------------------------------------------- steps --- */}
      <section className="section container" id="how" style={{ paddingTop: 0 }}>
        <div className="card card-pad-lg">
          <div className="grid grid-2 gap-5" style={{ alignItems: 'center' }}>
            <div>
              <span className="eyebrow">How it works</span>
              <h2 className="h1 mt-2">From request to donation in four steps</h2>
              <p className="lead mt-2">
                The model does the searching. You do the deciding — every suggestion arrives with
                the reasons behind it, and nothing is hidden behind a score.
              </p>
              <Link to="/register" className="btn btn-primary mt-3">
                Create your account <ArrowRight size={16} />
              </Link>
            </div>

            <ol className="stack gap-3" style={{ listStyle: 'none', padding: 0 }}>
              {STEPS.map((s, i) => (
                <li key={s.title} className="row gap-3" style={{ alignItems: 'flex-start' }}>
                  <span className="step-num">{i + 1}</span>
                  <div>
                    <strong>{s.title}</strong>
                    <p className="small dim">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- cta --- */}
      <section className="container" style={{ paddingBottom: '4.5rem' }}>
        <div className="cta-band">
          <h2 className="h1">One donation can support up to three lives.</h2>
          <p className="lead mt-2" style={{ color: 'rgba(255,255,255,.9)' }}>
            Join the register today — it takes about a minute, and you decide when you are available.
          </p>
          <div className="row gap-2 mt-3" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/register" className="btn btn-lg" style={{ background: '#fff', color: 'var(--brand-hover)' }}>
              Become a donor
            </Link>
            <Link to="/register" className="btn btn-ghost btn-lg">I need blood</Link>
          </div>
        </div>
      </section>
    </>
  );
}
