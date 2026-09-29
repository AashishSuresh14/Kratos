import { Link } from 'react-router-dom';
import { useExecutiveBrief, useMacView } from '../../api/hooks';
import { useAuth } from '../../auth/AuthContext';
import { AiMeta, AiTag } from '../../components/AiMeta';
import { Icon } from '../../components/Icon';
import { PageHeader, useDocumentTitle } from '../../components/PageHeader';
import { ErrorState, SkeletonLines } from '../../components/States';
import { formatDateTime } from '../../lib/format';
import { RiskScanPanel } from './RiskScanPanel';

export default function BriefPage() {
  useDocumentTitle('Executive brief');
  const { can } = useAuth();
  const brief = useExecutiveBrief();
  const mac = useMacView();
  const names = new Map((mac.data?.accounts ?? []).map((a) => [a.id, a.name]));

  return (
    <div className="page">
      <PageHeader
        eyebrow="Insight"
        title={
          <span className="cluster">
            Executive brief <AiTag />
          </span>
        }
        subtitle="A short, sourced read of the portfolio, drafted by the brief agent from live plan data."
        actions={
          <button type="button" className="btn btn--sm" onClick={() => void brief.refetch()} disabled={brief.isFetching}>
            {brief.isFetching ? <span className="spinner" aria-hidden="true" /> : <Icon name="refresh" />} Regenerate
          </button>
        }
      />
      <section className="panel brief" aria-live="polite" aria-busy={brief.isFetching}>
        <div className="panel__body">
          {brief.isPending ? (
            <div className="stack">
              <p className="small muted">The brief agent is reading every account. This can take up to 30 seconds.</p>
              <SkeletonLines lines={8} />
            </div>
          ) : brief.isError ? (
            <ErrorState error={brief.error} title="The brief could not be generated" onRetry={() => void brief.refetch()} />
          ) : (
            <article className="stack" style={{ ['--gap' as string]: '18px' }}>
              <div>
                <p className="brief__headline ai-text">{brief.data.headline}</p>
                <p className="xsmall muted">Generated {formatDateTime(brief.data.generatedAt)}</p>
              </div>
              {brief.data.sections.map((s) => (
                <section key={s.title} className="brief__section">
                  <h2>{s.title}</h2>
                  <p className="ai-text pre-line">{s.body}</p>
                  {s.accountIds.length > 0 && (
                    <div className="cluster" style={{ marginTop: 6 }}>
                      <span className="xsmall muted">Accounts:</span>
                      {s.accountIds.map((id) => (
                        <Link key={id} to={`/accounts/${id}`} className="chip">
                          {names.get(id) ?? 'Open account'}
                        </Link>
                      ))}
                    </div>
                  )}
                </section>
              ))}
              <AiMeta meta={brief.data.meta} />
            </article>
          )}
        </div>
      </section>
      {can('ai.riskScan') && <RiskScanPanel />}
    </div>
  );
}
