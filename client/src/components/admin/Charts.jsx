import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';

/**
 * Shared chart chrome. Colours come from CSS custom properties so light/dark
 * and the validated categorical palette stay in one place (styles/index.css).
 *
 * Every chart here uses at most two series — the two leading categorical slots
 * (blue, orange) — with a legend always present and one axis only.
 */

const cssVar = (name, fallback) => `var(${name}, ${fallback})`;

const SERIES_1 = cssVar('--series-1', '#2a78d6');
const SERIES_2 = cssVar('--series-2', '#eb6834');
const GRID = cssVar('--grid', '#e1e0d9');
const AXIS = cssVar('--axis', '#c3c2b7');
const MUTED = cssVar('--muted', '#898781');

const axisProps = {
  stroke: AXIS,
  tick: { fill: MUTED, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: AXIS },
};

function VizTooltip({ active, payload, label, unit = '' }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="viz-tooltip">
      <div style={{ fontWeight: 650, marginBottom: '.25rem' }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="row gap-2" style={{ justifyContent: 'space-between' }}>
          <span className="row gap-1">
            <i style={{ width: 8, height: 8, borderRadius: 2, background: p.color, display: 'inline-block' }} />
            <span className="k">{p.name}</span>
          </span>
          <strong>{p.value}{unit}</strong>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.label}>
          <i style={{ background: i.color }} /> {i.label}
        </span>
      ))}
    </div>
  );
}

export function ChartCard({ title, subtitle, legend, children, height = 260 }) {
  return (
    <section className="chart-card">
      <div className="chart-head">
        <div>
          <h3 className="h3">{title}</h3>
          {subtitle && <p className="tiny muted">{subtitle}</p>}
        </div>
        {legend && <Legend items={legend} />}
      </div>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>{children}</ResponsiveContainer>
      </div>
    </section>
  );
}

/** Daily requests raised vs donations recorded. */
export function TrendChart({ data }) {
  return (
    <ChartCard
      title="Requests and donations"
      subtitle="Daily counts over the selected window"
      legend={[
        { label: 'Requests raised', color: 'var(--series-1)' },
        { label: 'Donations recorded', color: 'var(--series-2)' },
      ]}
    >
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="date"
          {...axisProps}
          tickFormatter={(d) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
          minTickGap={28}
        />
        <YAxis {...axisProps} allowDecimals={false} width={44} />
        <Tooltip content={<VizTooltip />} cursor={{ stroke: AXIS, strokeWidth: 1 }} />
        <Line type="monotone" dataKey="requests" name="Requests raised" stroke={SERIES_1} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        <Line type="monotone" dataKey="donations" name="Donations recorded" stroke={SERIES_2} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
      </LineChart>
    </ChartCard>
  );
}

/** Supply (available donors) against demand (open requests) per blood group. */
export function BloodGroupChart({ data }) {
  return (
    <ChartCard
      title="Supply and demand by blood group"
      subtitle="Available donors against currently open requests"
      legend={[
        { label: 'Available donors', color: 'var(--series-1)' },
        { label: 'Open requests', color: 'var(--series-2)' },
      ]}
    >
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }} barGap={2}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="bloodGroup" {...axisProps} />
        <YAxis {...axisProps} allowDecimals={false} width={44} />
        <Tooltip content={<VizTooltip />} cursor={{ fill: 'transparent' }} />
        <Bar dataKey="availableDonors" name="Available donors" fill={SERIES_1} radius={[4, 4, 0, 0]} maxBarSize={22} />
        <Bar dataKey="openRequests" name="Open requests" fill={SERIES_2} radius={[4, 4, 0, 0]} maxBarSize={22} />
      </BarChart>
    </ChartCard>
  );
}

/** Cities ranked by demand — horizontal because city names are long. */
export function CityChart({ data }) {
  return (
    <ChartCard
      title="Demand by city"
      subtitle="Requests raised, with the local donor pool alongside"
      height={Math.max(220, data.length * 42)}
      legend={[
        { label: 'Requests', color: 'var(--series-2)' },
        { label: 'Registered donors', color: 'var(--series-1)' },
      ]}
    >
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 20, bottom: 4, left: 8 }} barGap={2}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" {...axisProps} allowDecimals={false} />
        <YAxis type="category" dataKey="city" {...axisProps} width={96} />
        <Tooltip content={<VizTooltip />} cursor={{ fill: 'transparent' }} />
        <Bar dataKey="requests" name="Requests" fill={SERIES_2} radius={[0, 4, 4, 0]} maxBarSize={14} />
        <Bar dataKey="donors" name="Registered donors" fill={SERIES_1} radius={[0, 4, 4, 0]} maxBarSize={14} />
      </BarChart>
    </ChartCard>
  );
}
