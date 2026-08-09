import { Outlet } from 'react-router-dom';
import Navbar from './Navbar.jsx';
import Footer from './Footer.jsx';

export default function Layout() {
  return (
    <>
      <a href="#main" className="sr-only">Skip to content</a>
      <Navbar />
      <main id="main">
        <Outlet />
      </main>
      <Footer />
    </>
  );
}

/** Wrapper for the signed-in screens — consistent gutters and vertical rhythm. */
export function AppPage({ title, subtitle, actions, children, width = 'wide' }) {
  return (
    <div className={width === 'narrow' ? 'container-narrow' : 'container'} style={{ paddingBlock: '2rem 3.5rem' }}>
      {(title || actions) && (
        <div className="between wrap gap-3" style={{ marginBottom: '1.75rem' }}>
          <div>
            {title && <h1 className="h1">{title}</h1>}
            {subtitle && <p className="dim mt-1">{subtitle}</p>}
          </div>
          {actions && <div className="row gap-2 wrap">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
