import { Link } from 'react-router-dom';
import { Droplet } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="between wrap gap-4">
          <div style={{ maxWidth: '34ch' }}>
            <div className="brand" style={{ marginBottom: '.5rem' }}>
              <span className="brand-mark"><Droplet size={17} fill="currentColor" /></span>
              LifeLink
            </div>
            <p className="small">
              An AI-assisted blood donation network. Matching is a suggestion tool — every
              donation is still screened and verified at the collection centre.
            </p>
          </div>

          <nav className="row gap-4 wrap small" aria-label="Footer">
            <Link to="/register">Become a donor</Link>
            <Link to="/register">Request blood</Link>
            <Link to="/login">Log in</Link>
            <a href="#features">Features</a>
          </nav>
        </div>

        <hr className="divider mt-3" />
        <p className="tiny muted mt-2">
          © {new Date().getFullYear()} LifeLink. Built with the MERN stack. Not a substitute for
          emergency medical services — call your local emergency number in a crisis.
        </p>
      </div>
    </footer>
  );
}
