import { Link } from 'react-router-dom';
import type { AccountSummary } from '../../api/types';
import { DataTable, type Column } from '../../components/DataTable';
import { RiskPill } from '../../components/RiskPill';
import { ScoreBar } from '../../components/ScoreBar';
import { formatDate, formatRelative } from '../../lib/format';

const RISK_ORDER = { High: 3, Medium: 2, Low: 1 } as const;

export function AccountsTable({ rows, caption }: { rows: AccountSummary[]; caption: string }) {
  const columns: Column<AccountSummary>[] = [
    {
      key: 'name',
      header: 'Account',
      sortValue: (r) => r.name,
      render: (r) => (
        <div className="stack" style={{ ['--gap' as string]: '1px' }}>
          <Link to={`/accounts/${r.id}`} className="row-link">
            {r.name}
          </Link>
          <span className="xsmall muted">
            {r.type} · {r.industry} · {r.region}
          </span>
        </div>
      ),
    },
    { key: 'group', header: 'Group', sortValue: (r) => r.groupName, render: (r) => <span className="small">{r.groupName}</span> },
    {
      key: 'health',
      header: 'Health',
      sortValue: (r) => r.health,
      width: 140,
      render: (r) => <ScoreBar value={r.health} tone="auto" label={`Health of ${r.name}`} />,
    },
    { key: 'risk', header: 'Risk', sortValue: (r) => RISK_ORDER[r.riskLevel], render: (r) => <RiskPill level={r.riskLevel} compact /> },
    {
      key: 'completion',
      header: 'Completion',
      sortValue: (r) => r.completion,
      width: 130,
      render: (r) => <ScoreBar value={r.completion} suffix="%" label={`Plan completion of ${r.name}`} />,
    },
    {
      key: 'overdue',
      header: 'Overdue',
      align: 'right',
      sortValue: (r) => r.overdueActions,
      render: (r) => (
        <span className={`num${r.overdueActions > 0 ? ' text-crit' : ' muted'}`}>{r.overdueActions}</span>
      ),
    },
    {
      key: 'stale',
      header: 'Stale',
      align: 'right',
      sortValue: (r) => r.staleSections,
      render: (r) => <span className={`num${r.staleSections >= 3 ? ' text-warn' : ' muted'}`}>{r.staleSections}</span>,
    },
    { key: 'captain', header: 'Captain', sortValue: (r) => r.captainName, render: (r) => <span className="small">{r.captainName}</span> },
    {
      key: 'reviewed',
      header: 'Last reviewed',
      sortValue: (r) => r.lastReviewedAt ?? '',
      render: (r) => (
        <span className="small nowrap" title={formatDate(r.lastReviewedAt)}>
          {formatRelative(r.lastReviewedAt)}
          <span className="muted mono xsmall"> · v{r.currentVersion}</span>
        </span>
      ),
    },
  ];
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      caption={caption}
      initialSort={{ key: 'health', dir: 'asc' }}
    />
  );
}
