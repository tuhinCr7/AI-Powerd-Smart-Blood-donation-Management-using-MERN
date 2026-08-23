import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Droplet, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { ErrorNote } from '../components/ui/Feedback.jsx';
import { homeFor } from '../components/ProtectedRoute.jsx';

const DEMO = [
  { label: 'Patient', email: 'patient@lifelink.io' },
  { label: 'Donor', email: 'donor@lifelink.io' },
  { label: 'Admin', email: 'admin@lifelink.io' },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(params.get('expired') ? 'Your session expired — please sign in again.' : '');
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const user = await login(form);
      navigate(location.state?.from?.pathname || homeFor(user.role), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container-narrow" style={{ paddingBlock: 'clamp(2.5rem, 7vw, 4.5rem)' }}>
      <div className="grid grid-2 gap-5" style={{ alignItems: 'center' }}>
        <div>
          <span className="eyebrow"><Droplet size={13} /> Welcome back</span>
          <h1 className="h1 mt-2">Sign in to LifeLink</h1>
          <p className="lead mt-2">
            Patients see their matches, donors see nearby requests, administrators get the
            full panel.
          </p>

          <div className="panel mt-3">
            <p className="small" style={{ fontWeight: 600 }}>Demo accounts</p>
            <p className="tiny muted">Password for all three: <code>Password123</code></p>
            <div className="row gap-2 wrap mt-2">
              {DEMO.map((d) => (
                <button
                  key={d.email}
                  type="button"
                  className="btn btn-subtle btn-sm"
                  onClick={() => setForm({ email: d.email, password: 'Password123' })}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>        

        <form className="card card-pad-lg" onSubmit={submit} noValidate>
          <div className="stack gap-3">
            <ErrorNote>{error}</ErrorNote>

            <div className="field">
              <label className="label" htmlFor="email">Email address</label>
              <input
                id="email" className="input" type="email" autoComplete="email" required
                value={form.email} onChange={set('email')} placeholder="you@example.com"
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="password">Password</label>
              <input
                id="password" className="input" type="password" autoComplete="current-password" required
                value={form.password} onChange={set('password')} placeholder="••••••••"
              />
            </div>

            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? <span className="spinner" /> : <LogIn size={17} />}
              {busy ? 'Signing in…' : 'Sign in'}
            </button>

            <p className="small center dim">
              No account yet? <Link to="/register" style={{ color: 'var(--brand)', fontWeight: 600 }}>Register here</Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
