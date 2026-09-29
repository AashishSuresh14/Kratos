import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useUser } from '../auth/AuthContext';
import { ROLE_LABEL, type Permission } from '../auth/permissions';
import { USE_MOCKS } from '../lib/env';
import { initials } from '../lib/format';
import { BrandMark, Icon, type IconName } from './Icon';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  any: Permission[];
}

const NAV: { heading: string; items: NavItem[] }[] = [
  {
    heading: 'Portfolio',
    items: [
      { to: '/portfolio', label: 'MAC view', icon: 'portfolio', any: ['plan.view'] },
      { to: '/nbd', label: 'New business', icon: 'target', any: ['plan.view'] },
      { to: '/ebd', label: 'Existing business', icon: 'grid', any: ['plan.view'] },
      { to: '/actions', label: 'Actions', icon: 'actions', any: ['actions.view'] },
    ],
  },
  {
    heading: 'Insight',
    items: [{ to: '/brief', label: 'Executive brief', icon: 'sparkle', any: ['ai.brief'] }],
  },
  {
    heading: 'Data',
    items: [
      { to: '/import', label: 'Import workbook', icon: 'upload', any: ['import.run'] },
      { to: '/exports', label: 'Exports', icon: 'download', any: ['export.account', 'export.bdPack', 'export.executivePack'] },
    ],
  },
  {
    heading: 'Administration',
    items: [{ to: '/admin', label: 'Admin console', icon: 'settings', any: ['admin.masterData'] }],
  },
];

export function AppShell() {
  const { can, signOut } = useAuth();
  const user = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => setNavOpen(false), [location.pathname]);

  const sections = NAV.map((s) => ({ ...s, items: s.items.filter((i) => i.any.some((p) => can(p))) })).filter(
    (s) => s.items.length > 0,
  );

  return (
    <div className={`shell${navOpen ? ' nav-open' : ''}`}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Main navigation">
        <NavLink to="/" className="brand" aria-label="Kratos home">
          <BrandMark className="brand__mark" />
          <span>
            <span className="brand__name">Kratos</span>
            <span className="brand__sub">Digital KAM</span>
          </span>
        </NavLink>
        <nav className="nav">
          {sections.map((s) => (
            <div key={s.heading} className="nav__section">
              <div className="nav__heading">{s.heading}</div>
              {s.items.map((i) => (
                <NavLink key={i.to} to={i.to} className="nav__link">
                  <Icon name={i.icon} />
                  {i.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar__foot">Psiog · pSpark 2026</div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button
            type="button"
            className="btn btn--ghost btn--icon topbar__menu"
            aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={navOpen}
            onClick={() => setNavOpen((v) => !v)}
          >
            <Icon name="menu" />
          </button>
          <div className="topbar__crumbs" />
          {USE_MOCKS && (
            <span className="chip chip--mock" title="Data is fictional and served in the browser">
              MOCK DATA
            </span>
          )}
          <div className="topbar__user">
            <span className="avatar" aria-hidden="true">
              {initials(user.displayName)}
            </span>
            <span className="user-meta">
              <span className="user-meta__name">{user.displayName}</span>
              <span className="muted xsmall">{user.email}</span>
            </span>
            <span className="chip chip--role" aria-label={`Role: ${ROLE_LABEL[user.role]}`}>
              {ROLE_LABEL[user.role]}
            </span>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                signOut();
                navigate('/login', { replace: true });
              }}
            >
              <Icon name="logout" /> Sign out
            </button>
          </div>
        </header>
        <main id="main" className="content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      {navOpen && <div className="overlay" style={{ zIndex: 40 }} onClick={() => setNavOpen(false)} aria-hidden="true" />}
    </div>
  );
}
