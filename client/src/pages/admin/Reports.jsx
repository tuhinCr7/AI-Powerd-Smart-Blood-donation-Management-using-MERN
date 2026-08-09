import { useState } from 'react';
import { Download, FileText, Printer } from 'lucide-react';
import { api, endpoints } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import { BloodGroupChart, CityChart, TrendChart } from '../../components/admin/Charts.jsx';
import { ErrorNote, Spinner } from '../../components/ui/Feedback.jsx';
import { formatDate, numberFmt } from '../../utils/format.js';

const TYPES = [
  { value: 'summary', label: 'Summary', hint: 'Headline counters, blood-group balance and activity trend' },
  { value: 'inventory', label: 'Blood group inventory', hint: 'Donor supply against open demand per group' },
  { value: 'activity', label: 'Activity trend', hint: 'Requests raised and donations recorded per day' },
  { value: 'geography', label: 'Geography', hint: 'Demand and supply by city' },
  { value: 'donors', label: 'Top donors', hint: 'Most active donors in the period' },
  { value: 'donations', label: 'Donation log', hint: 'Line-by-line donation records (up to 500)' },
  { value: 'full', label: 'Full report', hint: 'Every section in one document' },
];

const RANGES = [
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 365, label: 'Last 12 months' },
];

export default function AdminReports() {
  const toast = useToast();
  const [type, setType] = useState('summary');
  const [days, setDays] = useState(30);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  const generate = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await endpoints.admin.report({ type, days, format: 'json' });
      setReport(data.report);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * CSV needs the auth header, so it is fetched as a blob and saved client-side
   * rather than opened as a plain link.
   */
  const downloadCsv = async () => {
    setDownloading(true);
    try {
      const res = await api.get('/admin/reports', {
        params: { type, days, format: 'csv' },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `lifelink-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success('CSV downloaded');
    } catch (err) {
      toast.error(err.message || 'Could not generate the CSV');
    } finally {
      setDownloading(false);
    }
  };

  const selected = TYPES.find((t) => t.value === type);

  return (
    <div className="stack gap-3">
      {/* ------------------------------------------------------ controls --- */}
      <div className="card">
        <div className="row gap-3 wrap" style={{ alignItems: 'flex-end' }}>
          <div className="field grow" style={{ minWidth: '15rem' }}>
            <label className="label" htmlFor="type">Report type</label>
            <select id="type" className="select" value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <span className="tiny muted">{selected.hint}</span>
          </div>

          <div className="field" style={{ minWidth: '11rem' }}>
            <label className="label" htmlFor="range">Period</label>
            <select id="range" className="select" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          <div className="row gap-2">
            <button type="button" className="btn btn-primary" onClick={generate} disabled={loading}>
              {loading ? <span className="spinner" /> : <FileText size={16} />} Generate
            </button>
            <button type="button" className="btn btn-ghost" onClick={downloadCsv} disabled={downloading}>
              {downloading ? <span className="spinner" /> : <Download size={16} />} CSV
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => window.print()} disabled={!report}>
              <Printer size={16} /> Print
            </button>
          </div>
        </div>
      </div>

      <ErrorNote>{error}</ErrorNote>

      {loading && <Spinner label="Building the report…" />}

      {/* -------------------------------------------------------- output --- */}
      {report && !loading && (
        <article className="stack gap-3">
          <div className="card">
            <div className="between wrap gap-2">
              <div>
                <h2 className="h2">{selected.label}</h2>
                <p className="small dim">
                  {formatDate(report.range.from)} → {formatDate(report.range.to)} ({report.range.days} days)
                </p>
              </div>
              <p className="tiny muted">Generated {new Date(report.generatedAt).toLocaleString()}</p>
            </div>
          </div>

          {report.overview && (
            <div className="grid grid-4">
              {[
                ['Registered donors', numberFmt(report.overview.totalDonors)],
                ['Available now', numberFmt(report.overview.availableDonors)],
                ['Patients', numberFmt(report.overview.totalPatients)],
                ['Open requests', numberFmt(report.overview.openRequests)],
                ['Critical open', numberFmt(report.overview.criticalOpen)],
                ['Donations (30d)', numberFmt(report.overview.donationsLast30Days)],
                ['Total donations', numberFmt(report.overview.totalDonations)],
                ['Fulfilment rate', `${report.overview.fulfilmentRate}%`],
              ].map(([label, value]) => (
                <div key={label} className="card stat-tile">
                  <span className="stat-value tabular" style={{ fontSize: '1.6rem' }}>{value}</span>
                  <span className="stat-label">{label}</span>
                </div>
              ))}
            </div>
          )}

          {report.trend && <TrendChart data={report.trend} />}
          {report.bloodGroups && <BloodGroupChart data={report.bloodGroups} />}
          {report.cities?.length > 0 && <CityChart data={report.cities} />}

          {report.cities?.length > 0 && (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>City</th>
                    <th className="num">Requests</th>
                    <th className="num">Units needed</th>
                    <th className="num">Fulfilled</th>
                    <th className="num">Donors</th>
                    <th className="num">Donors per request</th>
                  </tr>
                </thead>
                <tbody>
                  {report.cities.map((c) => (
                    <tr key={c.city}>
                      <td><strong className="small">{c.city}</strong></td>
                      <td className="num tabular">{c.requests}</td>
                      <td className="num tabular">{c.unitsNeeded}</td>
                      <td className="num tabular">{c.fulfilled}</td>
                      <td className="num tabular">{c.donors}</td>
                      <td className="num tabular">
                        {c.supplyRatio}
                        {c.supplyRatio < 1 && <span className="badge badge-critical" style={{ marginLeft: '.4rem' }}>Short</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {report.topDonors?.length > 0 && (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>#</th><th>Donor</th><th>Group</th><th>City</th>
                    <th className="num">Donations</th><th className="num">Units</th>
                  </tr>
                </thead>
                <tbody>
                  {report.topDonors.map((d, i) => (
                    <tr key={d.donorId}>
                      <td className="tabular muted">{i + 1}</td>
                      <td><strong className="small">{d.name}</strong></td>
                      <td><span className="blood-chip blood-chip-sm">{d.bloodGroup}</span></td>
                      <td className="small dim">{d.city || '—'}</td>
                      <td className="num tabular">{d.donations}</td>
                      <td className="num tabular">{d.units}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {report.donations?.length > 0 && (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Date</th><th>Donor</th><th>Group</th>
                    <th className="num">Units</th><th>Patient</th><th>Hospital</th>
                  </tr>
                </thead>
                <tbody>
                  {report.donations.map((d) => (
                    <tr key={d._id}>
                      <td className="small dim">{formatDate(d.donatedAt)}</td>
                      <td className="small"><strong>{d.donor?.name || '—'}</strong></td>
                      <td><span className="blood-chip blood-chip-sm">{d.bloodGroup}</span></td>
                      <td className="num tabular">{d.units}</td>
                      <td className="small dim">{d.patient?.name || '—'}</td>
                      <td className="small dim">{d.hospitalName || d.city || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      )}

      {!report && !loading && (
        <div className="card">
          <p className="small dim">
            Pick a report type and period, then hit <strong>Generate</strong>. Any report can be
            exported to CSV for a spreadsheet, or printed straight from the browser.
          </p>
        </div>
      )}
    </div>
  );
}
