import { Link } from 'react-router-dom';
import { useRiskScan } from '../../api/hooks';
import { AiMeta, AiTag } from '../../components/AiMeta';
import { DataTable } from '../../components/DataTable';
import { Icon } from '../../components/Icon';
import { RiskPill } from '../../components/RiskPill';
import { ErrorState } from '../../components/States';
import type { RiskScan } from '../../api/types';

const ORDER = { High: 3, Medium: 2, Low: 1 } as const;

/** "Run risk scan" button plus the result table. Used on the brief and the portfolio. */
export function RiskScanPanel() {
  const scan = useRiskScan();
  return (
    <section className="panel" aria-labelledby="riskscan-title">
      <div className="panel__head">
        <div className="section-title">
          <h2 id="riskscan-title" className="panel__title">
            Portfolio risk scan
          </h2>
          <AiTag />
        </div>
        <button type="button" className="btn btn--ai btn--sm" onClick={() => scan.mutate()} disabled={scan.isPending}>
          {scan.isPending ? <span className="spinner" aria-hidden="true" /> : <Icon name="sparkle" />}
          {scan.isPending ? 'Scanning accounts' : scan.data ? 'Run again' : 'Run risk scan'}
        </button>
      </div>
      <div className="panel__body--flush" aria-live="polite" aria-busy={scan.isPending}>
        {scan.isError ? (
          <ErrorState error={scan.error} onRetry={() => scan.mutate()} title="Risk scan failed" />
        ) : scan.data ? (
          <ScanTable data={scan.data} />
        ) : (
          <p className="muted small" style={{ padding: 16 }}>
            {scan.isPending
              ? 'The risk agent is reading every plan in your scope. This can take up to 30 seconds.'
              : 'Runs the risk agent over every account in your scope and explains the drivers behind each level.'}
          </p>
        )}
      </div>
    </section>
  );
}

function ScanTable({ data }: { data: RiskScan }) {
  return (
    <>
      <DataTable
        caption="Risk scan results"
        rows={data.accounts}
        rowKey={(r) => r.accountId}
        initialSort={{ key: 'risk', dir: 'desc' }}
        columns={[
          {
            key: 'name',
            header: 'Account',
            sortValue: (r) => r.accountName,
            render: (r) => (
              <Link className="row-link" to={`/accounts/${r.accountId}`}>
                {r.accountName}
              </Link>
            ),
          },
          { key: 'risk', header: 'Risk', sortValue: (r) => ORDER[r.riskLevel], render: (r) => <RiskPill level={r.riskLevel} compact /> },
          {
            key: 'drivers',
            header: 'Drivers',
            render: (r) =>
              r.drivers.length ? (
                <ul className="plain-list small">
                  {r.drivers.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              ) : (
                <span className="muted small">None</span>
              ),
          },
          { key: 'why', header: 'Explanation', render: (r) => <span className="small ai-text">{r.explanation}</span> },
        ]}
      />
      <div style={{ padding: '8px 16px 12px' }}>
        <AiMeta meta={data.meta} />
      </div>
    </>
  );
}
