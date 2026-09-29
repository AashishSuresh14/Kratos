import { Link } from 'react-router-dom';
import { useEbdView } from '../../api/hooks';
import type { CrossSellState } from '../../api/types';
import { PageHeader, useDocumentTitle } from '../../components/PageHeader';
import { ScoreBar } from '../../components/ScoreBar';
import { EmptyState, ErrorState, SkeletonTable } from '../../components/States';

const STATE_LABEL: Record<CrossSellState, string> = {
  Current: 'Current',
  Opportunity: 'Opportunity',
  Aspirational: 'Aspirational',
  None: 'Not offered',
};
const STATE_MARK: Record<CrossSellState, string> = { Current: '●', Opportunity: '◆', Aspirational: '○', None: '' };

export default function EbdPage() {
  useDocumentTitle('Existing business');
  const q = useEbdView();
  return (
    <div className="page">
      <PageHeader
        eyebrow="EBD view"
        title="Cross-sell map"
        subtitle="What each existing account buys today, where a live opportunity exists, and where we aspire to be."
      />
      <section className="panel" aria-labelledby="heat-title">
        <div className="panel__head">
          <h2 id="heat-title" className="panel__title">
            Accounts × offerings
          </h2>
          <div className="legend">
            {(['Current', 'Opportunity', 'Aspirational', 'None'] as const).map((s) => (
              <span key={s} className="legend__item">
                <span className={`heat-swatch heat-swatch--${s}`} aria-hidden="true">
                  {STATE_MARK[s]}
                </span>
                {STATE_LABEL[s]}
              </span>
            ))}
          </div>
        </div>
        {q.isPending ? (
          <SkeletonTable rows={5} cols={8} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : q.data.rows.length === 0 ? (
          <EmptyState title="No existing business accounts in your scope" icon="grid" />
        ) : (
          <div className="table-wrap">
            <table className="heat">
              <caption className="sr-only">Cross-sell state by account and offering</caption>
              <thead>
                <tr>
                  <th scope="col" className="heat__account">
                    Account
                  </th>
                  <th scope="col" className="heat__rel">
                    Relationship
                  </th>
                  {q.data.offerings.map((o) => (
                    <th key={o.id} scope="col" className="heat__col">
                      <span>{o.name}</span>
                    </th>
                  ))}
                  <th scope="col" className="heat__col">
                    <span>White space</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {q.data.rows.map((r) => {
                  const white = r.cells.filter((c) => c.state === 'Opportunity' || c.state === 'Aspirational').length;
                  return (
                    <tr key={r.accountId}>
                      <th scope="row" className="heat__account">
                        <Link to={`/accounts/${r.accountId}`} className="row-link">
                          {r.accountName}
                        </Link>
                      </th>
                      <td className="heat__rel">
                        <ScoreBar value={r.relationship} tone="auto" label={`Relationship strength with ${r.accountName}`} />
                      </td>
                      {q.data.offerings.map((o) => {
                        const state = r.cells.find((c) => c.offeringId === o.id)?.state ?? 'None';
                        return (
                          <td key={o.id} className={`heat__cell heat__cell--${state}`} title={`${r.accountName} · ${o.name}: ${STATE_LABEL[state]}`}>
                            <span aria-hidden="true">{STATE_MARK[state]}</span>
                            <span className="sr-only">{STATE_LABEL[state]}</span>
                          </td>
                        );
                      })}
                      <td className="heat__cell mono small">{white}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
