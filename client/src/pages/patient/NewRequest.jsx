import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crosshair, Plus } from 'lucide-react';
import { endpoints } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { AppPage } from '../../components/layout/Layout.jsx';
import { ErrorNote } from '../../components/ui/Feedback.jsx';
import { BLOOD_GROUPS, URGENCY_OPTIONS } from '../../utils/format.js';

export default function NewRequest() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState({
    bloodGroup: user.bloodGroup,
    unitsNeeded: 1,
    urgency: 'normal',
    neededBy: '',
    hospitalName: user.patientProfile?.hospitalName || '',
    note: '',
    city: user.address?.city || '',
    district: user.address?.district || '',
    coordinates: user.location?.coordinates || null,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const detectLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setForm((f) => ({ ...f, coordinates: [coords.longitude, coords.latitude] })),
      () => setError('Could not read your location — the city will be used instead')
    );
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await endpoints.requests.create({
        bloodGroup: form.bloodGroup,
        unitsNeeded: Number(form.unitsNeeded),
        urgency: form.urgency,
        ...(form.neededBy ? { neededBy: form.neededBy } : {}),
        ...(form.hospitalName ? { hospitalName: form.hospitalName } : {}),
        ...(form.note ? { note: form.note } : {}),
        address: {
          ...(form.city ? { city: form.city } : {}),
          ...(form.district ? { district: form.district } : {}),
        },
        ...(form.coordinates ? { coordinates: form.coordinates } : {}),
      });
      toast.success('Request created — here are your matches');
      navigate(`/patient/matches?requestId=${data.request._id}&urgency=${data.request.urgency}`);
    } catch (err) {
      setError(err.details?.[0]?.message || err.message);
      setBusy(false);
    }
  };

  return (
    <AppPage title="Raise a blood request" subtitle="The matcher starts ranking donors the moment you submit." width="narrow">
      <form className="card card-pad-lg" onSubmit={submit} noValidate>
        <div className="stack gap-3">
          <ErrorNote>{error}</ErrorNote>

          <div className="grid grid-3" style={{ gap: '1rem' }}>
            <div className="field">
              <label className="label" htmlFor="group">Blood group</label>
              <select id="group" className="select" value={form.bloodGroup} onChange={set('bloodGroup')}>
                {BLOOD_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="units">Units needed</label>
              <input id="units" className="input" type="number" min="1" max="20" value={form.unitsNeeded} onChange={set('unitsNeeded')} />
            </div>
            <div className="field">
              <label className="label" htmlFor="by">Needed by</label>
              <input id="by" className="input" type="date" value={form.neededBy} onChange={set('neededBy')} />
            </div>
          </div>

          <div className="field">
            <label className="label" htmlFor="urgency">Urgency</label>
            <select id="urgency" className="select" value={form.urgency} onChange={set('urgency')}>
              {URGENCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <span className="tiny muted">
              Higher urgency shifts the ranking toward nearby, fast-responding donors.
            </span>
          </div>

          <div className="field">
            <label className="label" htmlFor="hospital">Hospital / collection centre</label>
            <input id="hospital" className="input" value={form.hospitalName} onChange={set('hospitalName')} placeholder="Square Hospital" />
          </div>

          <div className="grid grid-2" style={{ gap: '1rem' }}>
            <div className="field">
              <label className="label" htmlFor="city">City</label>
              <input id="city" className="input" value={form.city} onChange={set('city')} />
            </div>
            <div className="field">
              <label className="label" htmlFor="district">Area / district</label>
              <input id="district" className="input" value={form.district} onChange={set('district')} />
            </div>
          </div>

          <div className="panel between wrap gap-3">
            <div>
              <strong className="small">Request location</strong>
              <p className="tiny muted">
                {form.coordinates
                  ? `Using ${form.coordinates[1].toFixed(4)}, ${form.coordinates[0].toFixed(4)}`
                  : 'No coordinates set — matching will fall back to your city.'}
              </p>
            </div>
            <button type="button" className="btn btn-subtle btn-sm" onClick={detectLocation}>
              <Crosshair size={15} /> Use current location
            </button>
          </div>

          <div className="field">
            <label className="label" htmlFor="note">Note for donors <span className="muted">(optional)</span></label>
            <textarea id="note" className="textarea" maxLength={500} value={form.note} onChange={set('note')}
              placeholder="Surgery scheduled for tomorrow morning — blood bank slot is reserved." />
          </div>

          <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={busy}>
            {busy ? <span className="spinner" /> : <Plus size={17} />}
            {busy ? 'Creating…' : 'Create request and find donors'}
          </button>
        </div>
      </form>
    </AppPage>
  );
}
