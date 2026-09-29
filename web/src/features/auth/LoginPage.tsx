import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { landingPathFor, ROLE_LABEL } from '../../auth/permissions';
import { Field } from '../../components/Field';
import { BrandMark, Icon } from '../../components/Icon';
import { useDocumentTitle } from '../../components/PageHeader';
import { IS_DEV, USE_MOCKS } from '../../lib/env';
import type { Role } from '../../api/types';

const DEMO_ACCOUNTS: { email: string; role: Role; note: string }[] = [
  { email: 'admin@kratos.demo', role: 'Admin', note: 'Master data, users, security' },
  { email: 'exec@kratos.demo', role: 'Executive', note: 'Read-only portfolio, brief' },
  { email: 'nbd.lead@kratos.demo', role: 'GroupLead', note: 'New business group' },
  { email: 'ebd.lead@kratos.demo', role: 'GroupLead', note: 'Existing business group' },
  { email: 'priya.am@kratos.demo', role: 'AccountManager', note: 'Captain on 3 accounts' },
  { email: 'arjun.am@kratos.demo', role: 'AccountManager', note: 'Captain on 3 accounts' },
];

/** Only allow in-app relative redirects after sign-in. */
function safeNext(next: string | null): string | null {
  if (!next) return null;
  try {
    const decoded = decodeURIComponent(next);
    return decoded.startsWith('/') && !decoded.startsWith('//') && !decoded.startsWith('/login') ? decoded : null;
  } catch {
    return null;
  }
}

export function LoginPage() {
  useDocumentTitle('Sign in');
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const expired = params.get('expired') === '1';
  const next = safeNext(params.get('next'));

  if (user) return <Navigate to={landingPathFor(user.role, next)} replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      const u = await signIn(email.trim(), password);
      navigate(landingPathFor(u.role, next), { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setError('Email or password is incorrect.');
      else if (err instanceof ApiError && err.status === 429) setError('Too many failed attempts. Wait 15 minutes and try again.');
      else if (err instanceof ApiError) setError(err.isNetwork ? 'Cannot reach the Kratos API. Is the backend running?' : err.message);
      else setError('Sign-in failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <section className="login__brand" aria-hidden="true">
        <div className="cluster" style={{ ['--gap' as string]: '12px' }}>
          <BrandMark className="login__mark" />
          <div>
            <div className="login__name">Kratos</div>
            <div className="login__sub">Digital KAM · Psiog</div>
          </div>
        </div>
        <div className="login__statement">
          <p className="login__headline">Every key account, one living plan.</p>
          <p className="login__lede">
            Know-your-customer to time-bound actions, scored and versioned, with an AI co-pilot that cites its sources.
          </p>
        </div>
        <ul className="login__facts">
          <li>
            <span className="mono">11</span> plan sections, S1 to S12
          </li>
          <li>
            <span className="mono">4</span> roles, least privilege
          </li>
          <li>
            <span className="mono">1</span> next best action per account
          </li>
        </ul>
      </section>

      <section className="login__panel">
        <form className="login__form stack" onSubmit={onSubmit} noValidate aria-labelledby="login-title" style={{ ['--gap' as string]: '16px' }}>
          <div>
            <h1 id="login-title">Sign in</h1>
            <p className="muted" style={{ marginTop: 4 }}>
              Use your Kratos account.
            </p>
          </div>
          {expired && !error && (
            <div className="banner banner--info" role="status">
              <Icon name="clock" />
              <div className="banner__body">Your session ended. Sign in again to continue.</div>
            </div>
          )}
          {error && (
            <div className="banner banner--crit" role="alert">
              <Icon name="alert" />
              <div className="banner__body">{error}</div>
            </div>
          )}
          <Field label="Email">
            {(p) => (
              <input
                {...p}
                className="input"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-autofocus
              />
            )}
          </Field>
          <Field label="Password">
            {(p) => (
              <input
                {...p}
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            )}
          </Field>
          <button type="submit" className="btn btn--primary btn--block" disabled={busy} style={{ height: 38 }}>
            {busy ? (
              <>
                <span className="spinner" aria-hidden="true" /> Signing in
              </>
            ) : (
              'Sign in'
            )}
          </button>

          {(IS_DEV || USE_MOCKS) && (
            <div className="demo-accounts">
              <div className="spread">
                <span className="eyebrow">Demo accounts</span>
                <span className="xsmall muted">{USE_MOCKS ? 'Mock mode: any password works' : 'Password is set by the backend'}</span>
              </div>
              <ul>
                {DEMO_ACCOUNTS.map((d) => (
                  <li key={d.email}>
                    <button type="button" className="demo-accounts__btn" onClick={() => setEmail(d.email)}>
                      <span className="mono small">{d.email}</span>
                      <span className="chip chip--role">{ROLE_LABEL[d.role]}</span>
                      <span className="xsmall muted demo-accounts__note">{d.note}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </form>
      </section>
    </div>
  );
}
