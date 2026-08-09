import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BadgeCheck, Bolt, CheckCircle2, ChevronDown, Clock, Droplet, MapPin,
  MessageSquare, Star,
} from 'lucide-react';
import { endpoints } from '../../api/client.js';
import { useSocket } from '../../context/SocketContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { initials, timeAgo } from '../../utils/format.js';

const REASON_ICONS = { drop: Droplet, pin: MapPin, clock: Clock, check: CheckCircle2, bolt: Bolt, star: Star };

const FEATURE_LABELS = {
  compatibility: 'Blood group fit',
  proximity: 'Distance',
  readiness: 'Medical readiness',
  reliability: 'Accepts requests',
  responsiveness: 'Reply speed',
  experience: 'Donation history',
  activity: 'Recent activity',
};

/** Score colour follows the fixed status palette, and never stands alone. */
const scoreTone = (score) =>
  score >= 75 ? 'var(--good)' : score >= 55 ? 'var(--warning)' : 'var(--muted)';

/**
 * One AI-ranked donor. Shows the score, the reasons behind it, and an
 * expandable breakdown of every feature the model used.
 */
export default function MatchCard({ match, requestId }) {
  const { donor, matchScore, responseProbability, distanceKm, reasons, features } = match;
  const navigate = useNavigate();
  const toast = useToast();
  const { isUserOnline } = useSocket();
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [starting, setStarting] = useState(false);

  const online = isUserOnline(donor._id);

  const startChat = async () => {
    setStarting(true);
    try {
      const { data } = await endpoints.chat.start({ donorId: donor._id, requestId });
      navigate(`/chat/${data.conversation._id}`);
    } catch (err) {
      toast.error(err.message);
      setStarting(false);
    }
  };

  return (
    <article className="card card-hover match-card">
      <header className="row gap-3">
        <span className="blood-chip blood-chip-lg" aria-label={`Blood group ${donor.bloodGroup}`}>
          {donor.bloodGroup}
        </span>

        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row gap-2">
            <h3 className="h3 truncate">{donor.name}</h3>
            {donor.isVerified && (
              <BadgeCheck size={16} style={{ color: 'var(--good)' }} aria-label="Verified donor" />
            )}
          </div>
          <p className="tiny muted row gap-1">
            <span className={`presence ${online ? 'presence-on' : ''}`} aria-hidden="true" />
            {online ? 'Online now' : `Active ${timeAgo(donor.lastSeenAt)}`}
            {donor.address?.district && ` · ${donor.address.district}`}
          </p>
        </div>

        <div className="match-score">
          <b style={{ color: scoreTone(matchScore) }} className="tabular">{Math.round(matchScore)}</b>
          <span className="tiny muted">match score</span>
        </div>
      </header>

      <div>
        <div className="score-bar">
          <span style={{ width: `${matchScore}%`, background: scoreTone(matchScore) }} />
        </div>
        <p className="tiny muted mt-1 tabular">
          {responseProbability}% estimated chance of responding
          {distanceKm != null && ` · ${distanceKm} km away`}
        </p>
      </div>

      <ul className="reason-list" style={{ listStyle: 'none', padding: 0 }}>
        {reasons.map((r, i) => {
          const Icon = REASON_ICONS[r.icon] || CheckCircle2;
          return (
            <li key={i} className="reason">
              <Icon size={14} aria-hidden="true" />
              {r.text}
            </li>
          );
        })}
      </ul>

      <div className="row gap-2">
        <button type="button" className="btn btn-primary grow" onClick={startChat} disabled={starting}>
          {starting ? <span className="spinner" /> : <MessageSquare size={16} />}
          Message donor
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setShowBreakdown((v) => !v)}
          aria-expanded={showBreakdown}
        >
          Why <ChevronDown size={14} style={{ transform: showBreakdown ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
        </button>
      </div>

      {showBreakdown && (
        <div className="panel">
          <p className="tiny muted" style={{ marginBottom: '.6rem' }}>
            Each factor scored 0–1, then combined with the weights for this request's urgency.
          </p>
          <div className="feature-bars">
            {Object.entries(features).map(([key, value]) => (
              <div key={key} className="feature-bar">
                <span className="muted">{FEATURE_LABELS[key] || key}</span>
                <span className="track"><span style={{ width: `${value * 100}%` }} /></span>
                <span className="tabular num muted">{value.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
