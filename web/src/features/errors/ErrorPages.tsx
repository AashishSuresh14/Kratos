import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { homePathFor, ROLE_LABEL } from '../../auth/permissions';
import { useDocumentTitle } from '../../components/PageHeader';

function StatusPage({ code, title, body }: { code: string; title: string; body: string }) {
  const { user } = useAuth();
  return (
    <div className="status-page">
      <div className="status-page__code mono" aria-hidden="true">
        {code}
      </div>
      <h1>{title}</h1>
      <p className="muted">{body}</p>
      <Link to={user ? homePathFor(user.role) : '/login'} className="btn btn--primary">
        Back to {user ? 'your start page' : 'sign in'}
      </Link>
    </div>
  );
}

export function ForbiddenPage() {
  useDocumentTitle('No access');
  const { user } = useAuth();
  return (
    <StatusPage
      code="403"
      title="This area is not part of your role"
      body={`You are signed in as ${user ? ROLE_LABEL[user.role] : 'a user'}. If you need access, ask a Kratos admin to change your role or account scope.`}
    />
  );
}

export function NotFoundPage() {
  useDocumentTitle('Not found');
  return <StatusPage code="404" title="Page not found" body="The link may be out of date, or the page was moved." />;
}
