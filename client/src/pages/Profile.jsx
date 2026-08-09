import { useState } from 'react';
import { Crosshair, KeyRound, Save } from 'lucide-react';
import { endpoints } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { AppPage } from '../components/layout/Layout.jsx';
import { ErrorNote } from '../components/ui/Feedback.jsx';
import { formatDate } from '../utils/format.js';

const toDateInput = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');

export default function Profile() {
  const { user, updateProfile } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState({
    name: user.name || '',
    phone: user.phone || '',
    city: user.address?.city || '',
    district: user.address?.district || '',
    line: user.address?.line || '',
    coordinates: user.location?.coordinates || null,
    weightKg: user.donorProfile?.weightKg || '',
    dateOfBirth: toDateInput(user.donorProfile?.dateOfBirth),
    lastDonationDate: toDateInput(user.donorProfile?.lastDonationDate),
    preferredRadiusKm: user.donorProfile?.preferredRadiusKm || 25,
    hasChronicIllness: Boolean(user.donorProfile?.hasChronicIllness),
    hospitalName: user.patientProfile?.hospitalName || '',
    condition: user.patientProfile?.condition || '',
  });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);

  const set = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const detectLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setForm((f) => ({ ...f, coordinates: [coords.longitude, coords.latitude] }));
        toast.success('Location captured — remember to save');
      },
      () => toast.error('Could not read your location')
    );
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await updateProfile({
        name: form.name,
        ...(form.phone ? { phone: form.phone } : {}),
        address: { line: form.line, city: form.city, district: form.district },
        ...(form.coordinates ? { coordinates: form.coordinates } : {}),
        ...(user.role === 'donor'
          ? {
              ...(form.weightKg ? { weightKg: Number(form.weightKg) } : {}),
              ...(form.dateOfBirth ? { dateOfBirth: form.dateOfBirth } : {}),
              lastDonationDate: form.lastDonationDate || null,
              preferredRadiusKm: Number(form.preferredRadiusKm),
              hasChronicIllness: form.hasChronicIllness,
            }
          : {}),
        ...(user.role === 'patient'
          ? { hospitalName: form.hospitalName, condition: form.condition }
          : {}),
      });
      toast.success('Profile updated');
    } catch (err) {
      setError(err.details?.[0]?.message || err.message);
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPwBusy(true);
    try {
      await endpoints.auth.changePassword(passwords);
      setPasswords({ currentPassword: '', newPassword: '' });
      toast.success('Password changed');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <AppPage title="Your profile" subtitle="Keep this accurate — matching quality depends on it." width="narrow">
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="row gap-3 wrap">
          <span className="blood-chip blood-chip-lg">{user.bloodGroup}</span>
          <div className="grow">
            <strong>{user.name}</strong>
            <p className="small dim">{user.email}</p>
            <div className="row gap-2 mt-1 wrap">
              <span className="badge">{user.role}</span>
              {user.isVerified
                ? <span className="badge badge-good">Verified</span>
                : <span className="badge badge-warning">Pending verification</span>}
              <span className="tiny muted">Joined {formatDate(user.createdAt)}</span>
            </div>
          </div>
        </div>
      </div>

      <form className="card card-pad-lg" onSubmit={save} noValidate>
        <h2 className="h3">Details</h2>
        <div className="stack gap-3 mt-2">
          <ErrorNote>{error}</ErrorNote>

          <div className="grid grid-2" style={{ gap: '1rem' }}>
            <div className="field">
              <label className="label" htmlFor="name">Full name</label>
              <input id="name" className="input" value={form.name} onChange={set('name')} />
            </div>
            <div className="field">
              <label className="label" htmlFor="phone">Phone</label>
              <input id="phone" className="input" value={form.phone} onChange={set('phone')} />
            </div>
          </div>

          <div className="field">
            <label className="label" htmlFor="line">Address</label>
            <input id="line" className="input" value={form.line} onChange={set('line')} />
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
              <strong className="small">Saved location</strong>
              <p className="tiny muted">
                {form.coordinates
                  ? `${form.coordinates[1].toFixed(4)}, ${form.coordinates[0].toFixed(4)}`
                  : 'Not set — matching falls back to your city.'}
              </p>
            </div>
            <button type="button" className="btn btn-subtle btn-sm" onClick={detectLocation}>
              <Crosshair size={15} /> Update location
            </button>
          </div>

          {user.role === 'donor' && (
            <>
              <hr className="divider" />
              <h3 className="h3">Donor details</h3>
              <div className="grid grid-2" style={{ gap: '1rem' }}>
                <div className="field">
                  <label className="label" htmlFor="dob">Date of birth</label>
                  <input id="dob" className="input" type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} />
                </div>
                <div className="field">
                  <label className="label" htmlFor="weight">Weight (kg)</label>
                  <input id="weight" className="input" type="number" min="30" max="250" value={form.weightKg} onChange={set('weightKg')} />
                </div>
                <div className="field">
                  <label className="label" htmlFor="last">Last donation</label>
                  <input id="last" className="input" type="date" value={form.lastDonationDate} onChange={set('lastDonationDate')} />
                </div>
                <div className="field">
                  <label className="label" htmlFor="radius">Request radius (km)</label>
                  <input id="radius" className="input" type="number" min="1" max="500" value={form.preferredRadiusKm} onChange={set('preferredRadiusKm')} />
                  <span className="tiny muted">How far away a request can be and still reach your feed.</span>
                </div>
              </div>
              <label className="checkbox-row">
                <input type="checkbox" checked={form.hasChronicIllness} onChange={set('hasChronicIllness')} />
                <span className="small dim">I have a chronic illness that may affect donation eligibility.</span>
              </label>
            </>
          )}

          {user.role === 'patient' && (
            <>
              <hr className="divider" />
              <h3 className="h3">Patient details</h3>
              <div className="grid grid-2" style={{ gap: '1rem' }}>
                <div className="field">
                  <label className="label" htmlFor="hospital">Hospital</label>
                  <input id="hospital" className="input" value={form.hospitalName} onChange={set('hospitalName')} />
                </div>
                <div className="field">
                  <label className="label" htmlFor="condition">Condition</label>
                  <input id="condition" className="input" value={form.condition} onChange={set('condition')} />
                </div>
              </div>
            </>
          )}

          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? <span className="spinner" /> : <Save size={16} />} Save changes
          </button>
        </div>
      </form>

      <form className="card card-pad-lg mt-3" onSubmit={changePassword}>
        <h2 className="h3">Change password</h2>
        <div className="grid grid-2 mt-2" style={{ gap: '1rem' }}>
          <div className="field">
            <label className="label" htmlFor="cur">Current password</label>
            <input id="cur" className="input" type="password" autoComplete="current-password" required
              value={passwords.currentPassword}
              onChange={(e) => setPasswords((p) => ({ ...p, currentPassword: e.target.value }))} />
          </div>
          <div className="field">
            <label className="label" htmlFor="new">New password</label>
            <input id="new" className="input" type="password" autoComplete="new-password" minLength={8} required
              value={passwords.newPassword}
              onChange={(e) => setPasswords((p) => ({ ...p, newPassword: e.target.value }))} />
          </div>
        </div>
        <button type="submit" className="btn btn-ghost mt-2" disabled={pwBusy}>
          {pwBusy ? <span className="spinner" /> : <KeyRound size={16} />} Update password
        </button>
      </form>
    </AppPage>
  );
}
