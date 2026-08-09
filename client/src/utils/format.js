export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export const URGENCY_OPTIONS = [
  { value: 'low', label: 'Low — planned' },
  { value: 'normal', label: 'Normal — within days' },
  { value: 'high', label: 'High — within 24h' },
  { value: 'critical', label: 'Critical — immediate' },
];

export const initials = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');

export const formatDate = (value, opts = {}) =>
  value
    ? new Date(value).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        ...opts,
      })
    : '—';

export const formatTime = (value) =>
  value ? new Date(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';

/** "3 min ago" / "yesterday" — the relative stamp used across cards and chat. */
export function timeAgo(value) {
  if (!value) return '';
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 45) return 'just now';
  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, secs] of units) {
    if (seconds >= secs) return rtf.format(-Math.floor(seconds / secs), unit);
  }
  return 'just now';
}

/** Maps urgency + request status onto the fixed status palette. */
export const urgencyClass = (urgency) =>
  ({
    low: 'badge',
    normal: 'badge badge-good',
    high: 'badge badge-serious',
    critical: 'badge badge-critical',
  })[urgency] || 'badge';

export const statusClass = (status) =>
  ({
    open: 'badge badge-warning',
    matched: 'badge badge-good',
    fulfilled: 'badge badge-good',
    cancelled: 'badge',
  })[status] || 'badge';

export const distanceLabel = (km) => {
  if (km == null) return null;
  return km < 1 ? `${Math.round(km * 1000)} m away` : `${km.toFixed(1)} km away`;
};

export const numberFmt = (n) => new Intl.NumberFormat().format(n ?? 0);
