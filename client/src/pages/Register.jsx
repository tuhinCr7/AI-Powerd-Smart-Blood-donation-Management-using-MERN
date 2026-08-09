import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Crosshair, HeartPulse, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { ErrorNote } from '../components/ui/Feedback.jsx';
import { BLOOD_GROUPS } from '../utils/format.js';
import { homeFor } from '../components/ProtectedRoute.jsx';

const STEPS = ['Role', 'Account', 'Details'];

const emptyForm = {
  role: '',
  name: '',
  email: '',
  password: '',
  confirm: '',
  phone: '',
  bloodGroup: '',
  address: { line: '', city: '', district: '' },
  coordinates: null,
  // donor
  dateOfBirth: '',
  weightKg: '',
  lastDonationDate: '',
  hasChronicIllness: false,
  // patient
  hospitalName: '',
  condition: '',
};

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };
  const setAddress = (key) => (e) =>
    setForm((f) => ({ ...f, address: { ...f.address, [key]: e.target.value } }));

  /** Browser geolocation feeds the geospatial index the recommender relies on. */
  const detectLocation = () => {
    if (!navigator.geolocation) return setError('Your browser does not support geolocation');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setForm((f) => ({ ...f, coordinates: [coords.longitude, coords.latitude] }));
        setLocating(false);
      },
      () => {
        setError('Could not read your location — you can still enter a city instead');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const validateStep = () => {
    if (step === 0 && !form.role) return 'Choose whether you are donating or receiving';
    if (step === 1) {
      if (form.name.trim().length < 2) return 'Enter your full name';
      if (!/^\S+@\S+\.\S+$/.test(form.email)) return 'Enter a valid email address';
      if (form.password.length < 8) return 'Password must be at least 8 characters';
      if (form.password !== form.confirm) return 'Passwords do not match';
    }
    if (step === 2 && !form.bloodGroup) return 'Select your blood group';
    return '';
  };

  const next = () => {
    const problem = validateStep();
    if (problem) return setError(problem);
    setError('');
    setStep((s) => s + 1);
  };

  const submit = async (e) => {
    e.preventDefault();
    const problem = validateStep();
    if (problem) return setError(problem);

    setBusy(true);
    setError('');
    try {
      // Only send the fields the API's strict schema accepts for this role.
      const payload = {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        role: form.role,
        bloodGroup: form.bloodGroup,
        ...(form.phone ? { phone: form.phone } : {}),
        ...(form.coordinates ? { coordinates: form.coordinates } : {}),
        address: {
          ...(form.address.line ? { line: form.address.line } : {}),
          ...(form.address.city ? { city: form.address.city } : {}),
          ...(form.address.district ? { district: form.address.district } : {}),
        },
        ...(form.role === 'donor'
          ? {
              ...(form.dateOfBirth ? { dateOfBirth: form.dateOfBirth } : {}),
              ...(form.weightKg ? { weightKg: Number(form.weightKg) } : {}),
              ...(form.lastDonationDate ? { lastDonationDate: form.lastDonationDate } : {}),
              hasChronicIllness: form.hasChronicIllness,
            }
          : {
              ...(form.hospitalName ? { hospitalName: form.hospitalName } : {}),
              ...(form.condition ? { condition: form.condition } : {}),
            }),
      };

      const user = await register(payload);
      navigate(homeFor(user.role), { replace: true });
    } catch (err) {
      setError(err.details?.[0]?.message || err.message);
      setBusy(false);
    }
  };

  return (
    <div className="container-narrow" style={{ paddingBlock: 'clamp(2.5rem, 6vw, 4rem)' }}>
      <div className="center">
        <h1 className="h1">Create your LifeLink account</h1>
        <p className="lead mt-1">Takes about a minute. You can change everything later.</p>
      </div>

      {/* step indicator */}
      <div className="row gap-2 mt-3" style={{ justifyContent: 'center' }}>
        {STEPS.map((label, i) => (
          <div key={label} className="row gap-2">
            <span
              className="step-num"
              style={{
                background: i <= step ? 'var(--brand)' : 'var(--surface-3)',
                color: i <= step ? '#fff' : 'var(--muted)',
                width: '1.9rem',
                height: '1.9rem',
                fontSize: '.82rem',
              }}
            >
              {i < step ? <Check size={14} /> : i + 1}
            </span>
            <span className={`small ${i === step ? '' : 'muted'}`}>{label}</span>
            {i < STEPS.length - 1 && (
              <span style={{ width: '1.5rem', height: 1, background: 'var(--border-strong)' }} />
            )}
          </div>
        ))}
      </div>

      <form className="card card-pad-lg mt-3" onSubmit={submit} noValidate>
        <div className="stack gap-3">
          <ErrorNote>{error}</ErrorNote>

          {/* ------------------------------------------------ step 1: role */}
          {step === 0 && (
            <>
              <p className="label">I am registering as…</p>
              <div className="segmented">
                <button
                  type="button"
                  className="segment"
                  aria-pressed={form.role === 'donor'}
                  onClick={() => setForm((f) => ({ ...f, role: 'donor' }))}
                >
                  <HeartPulse size={20} style={{ color: 'var(--brand)' }} />
                  <strong>A donor</strong>
                  <span className="small dim">I want to give blood and answer nearby requests.</span>
                </button>
                <button
                  type="button"
                  className="segment"
                  aria-pressed={form.role === 'patient'}
                  onClick={() => setForm((f) => ({ ...f, role: 'patient' }))}
                >
                  <UserRound size={20} style={{ color: 'var(--brand)' }} />
                  <strong>A patient</strong>
                  <span className="small dim">I need blood and want AI-matched donors near me.</span>
                </button>
              </div>
              <p className="tiny muted">
                Administrator accounts are provisioned by the system, not through this form.
              </p>
            </>
          )}

          {/* --------------------------------------------- step 2: account */}
          {step === 1 && (
            <>
              <div className="field">
                <label className="label" htmlFor="name">Full name</label>
                <input id="name" className="input" value={form.name} onChange={set('name')} autoComplete="name" required />
              </div>
              <div className="grid grid-2" style={{ gap: '1rem' }}>
                <div className="field">
                  <label className="label" htmlFor="email">Email</label>
                  <input id="email" className="input" type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
                </div>
                <div className="field">
                  <label className="label" htmlFor="phone">Phone <span className="muted">(optional)</span></label>
                  <input id="phone" className="input" value={form.phone} onChange={set('phone')} autoComplete="tel" placeholder="+8801…" />
                </div>
              </div>
              <div className="grid grid-2" style={{ gap: '1rem' }}>
                <div className="field">
                  <label className="label" htmlFor="password">Password</label>
                  <input id="password" className="input" type="password" value={form.password} onChange={set('password')} autoComplete="new-password" required />
                  <span className="tiny muted">At least 8 characters.</span>
                </div>
                <div className="field">
                  <label className="label" htmlFor="confirm">Confirm password</label>
                  <input id="confirm" className="input" type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" required />
                </div>
              </div>
            </>
          )}

          {/* --------------------------------------------- step 3: details */}
          {step === 2 && (
            <>
              <div className="field">
                <span className="label">Blood group</span>
                <div className="row gap-2 wrap">
                  {BLOOD_GROUPS.map((g) => (
                    <button
                      key={g}
                      type="button"
                      className="blood-chip"
                      onClick={() => setForm((f) => ({ ...f, bloodGroup: g }))}
                      aria-pressed={form.bloodGroup === g}
                      style={
                        form.bloodGroup === g
                          ? { background: 'var(--brand)', color: '#fff', borderColor: 'var(--brand)' }
                          : undefined
                      }
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-2" style={{ gap: '1rem' }}>
                <div className="field">
                  <label className="label" htmlFor="city">City</label>
                  <input id="city" className="input" value={form.address.city} onChange={setAddress('city')} placeholder="Dhaka" />
                </div>
                <div className="field">
                  <label className="label" htmlFor="district">Area / district</label>
                  <input id="district" className="input" value={form.address.district} onChange={setAddress('district')} placeholder="Dhanmondi" />
                </div>
              </div>

              <div className="panel row between gap-3 wrap">
                <div>
                  <strong className="small">Precise location</strong>
                  <p className="tiny muted">
                    {form.coordinates
                      ? `Saved: ${form.coordinates[1].toFixed(4)}, ${form.coordinates[0].toFixed(4)}`
                      : 'Lets the matcher sort donors by true distance. Optional.'}
                  </p>
                </div>
                <button type="button" className="btn btn-subtle btn-sm" onClick={detectLocation} disabled={locating}>
                  {locating ? <span className="spinner" /> : <Crosshair size={15} />}
                  {form.coordinates ? 'Update' : 'Use my location'}
                </button>
              </div>

              {form.role === 'donor' ? (
                <>
                  <div className="grid grid-3" style={{ gap: '1rem' }}>
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
                  </div>
                  {/* This flag hard-filters a donor out of every search, so it
                      has to read as a consequence, not as a consent tickbox. */}
                  <div
                    className="panel"
                    style={form.hasChronicIllness ? { borderLeft: '3px solid var(--critical)' } : undefined}
                  >
                    <label className="checkbox-row">
                      <input type="checkbox" checked={form.hasChronicIllness} onChange={set('hasChronicIllness')} />
                      <span className="small">
                        <strong>Only tick this if it applies to you:</strong> I have a chronic
                        illness or condition that may affect donation.
                      </span>
                    </label>
                    {form.hasChronicIllness && (
                      <p className="small mt-1" style={{ color: 'var(--critical)' }}>
                        Heads up — you will be <strong>hidden from every patient's search</strong>{' '}
                        until a clinician clears you. Leave this unticked if you are unsure; you can
                        change it any time from your profile.
                      </p>
                    )}
                  </div>
                  <p className="tiny muted">
                    Donors must be 18–65 and at least 45 kg, with 90 days since their last donation.
                  </p>
                </>
              ) : (
                <div className="grid grid-2" style={{ gap: '1rem' }}>
                  <div className="field">
                    <label className="label" htmlFor="hospital">Hospital</label>
                    <input id="hospital" className="input" value={form.hospitalName} onChange={set('hospitalName')} placeholder="Square Hospital" />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="condition">Condition <span className="muted">(optional)</span></label>
                    <input id="condition" className="input" value={form.condition} onChange={set('condition')} placeholder="Thalassemia" />
                  </div>
                </div>
              )}
            </>
          )}

          {/* --------------------------------------------------- navigation */}
          <div className="between gap-2 mt-1">
            {step > 0 ? (
              <button type="button" className="btn btn-ghost" onClick={() => { setError(''); setStep((s) => s - 1); }}>
                <ArrowLeft size={16} /> Back
              </button>
            ) : (
              <span />
            )}

            {step < STEPS.length - 1 ? (
              <button type="button" className="btn btn-primary" onClick={next}>
                Continue <ArrowRight size={16} />
              </button>
            ) : (
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? <span className="spinner" /> : <Check size={16} />}
                {busy ? 'Creating account…' : 'Create account'}
              </button>
            )}
          </div>

          <p className="small center dim">
            Already registered? <Link to="/login" style={{ color: 'var(--brand)', fontWeight: 600 }}>Sign in</Link>
          </p>
        </div>
      </form>
    </div>
  );
}
