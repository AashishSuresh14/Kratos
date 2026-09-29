import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMacView } from '../../api/hooks';
import type { AccountSummary, AccountType, RiskLevel } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { axisBase, Chart, tooltipBase, useChartTheme } from '../../components/charts/Chart';
import { KpiTile } from '../../components/KpiTile';
import { PageHeader, useDocumentTitle } from '../../components/PageHeader';
import { RiskPill } from '../../components/RiskPill';
import { EmptyState, ErrorState, SkeletonKpis, SkeletonTable } from '../../components/States';
import { escapeHtml } from '../../lib/format';
import { RiskScanPanel } from '../brief/RiskScanPanel';
import { AccountsTable } from './AccountsTable';

export default function PortfolioPage() {
  useDocumentTitle('MAC view');
  const { can } = useAuth();
  const q = useMacView();
  const [search, setSearch] = useState('');
  const [type, setType] = useState<AccountType | ''>('');
  const [risk, setRisk] = useState<RiskLevel | ''>('');

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data?.accounts ?? []).filter(
      (a) =>
        (!type || a.type === type) &&
        (!risk || a.riskLevel === risk) &&
        (!s || a.name.toLowerCase().includes(s) || a.captainName.toLowerCase().includes(s) || a.industry.toLowerCase().includes(s)),
    );
  }, [q.data, search, type, risk]);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Portfolio"
        title="Managed accounts"
        subtitle="Health, risk and plan discipline across every account in your scope."
      />

      {q.isPending ? (
        <>
          <SkeletonKpis />
          <div className="panel">
            <SkeletonTable />
          </div>
        </>
      ) : q.isError ? (
        <div className="panel">
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </div>
      ) : (
        <>
          <div className="kpis">
            <KpiTile label="Accounts" value={q.data.totals.accounts} hint="in your scope" />
            <KpiTile
              label="At high risk"
              value={q.data.totals.atRisk}
              tone={q.data.totals.atRisk > 0 ? 'crit' : undefined}
              hint={q.data.totals.accounts ? `${Math.round((q.data.totals.atRisk / q.data.totals.accounts) * 100)}% of portfolio` : undefined}
            />
            <KpiTile
              label="Overdue actions"
              value={q.data.totals.overdueActions}
              tone={q.data.totals.overdueActions > 0 ? 'warn' : undefined}
              hint={can('actions.view') ? <Link to="/actions?overdue=1">Review overdue</Link> : 'across your portfolio'}
            />
            <KpiTile label="Average health" value={q.data.totals.avgHealth} unit="/100" hint="weighted score" />
          </div>

          <div className="portfolio-grid">
            <section className="panel" aria-labelledby="hbg-title">
              <div className="panel__head">
                <h2 id="hbg-title" className="panel__title">
                  Health by group
                </h2>
                <span className="xsmall muted">Average health score, 0–100</span>
              </div>
              <div className="panel__body">
                {q.data.healthByGroup.length ? (
                  <HealthByGroupChart data={q.data.healthByGroup} />
                ) : (
                  <EmptyState title="No groups yet" />
                )}
              </div>
            </section>
            <AttentionList accounts={q.data.accounts} />
          </div>

          <section className="panel" aria-labelledby="acc-title">
            <div className="panel__head">
              <h2 id="acc-title" className="panel__title">
                Accounts <span className="muted mono small">{rows.length}</span>
              </h2>
              <div className="cluster">
                <label className="sr-only" htmlFor="acc-search">
                  Search accounts
                </label>
                <input
                  id="acc-search"
                  className="input input--sm"
                  placeholder="Search account, industry, captain"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ width: 240 }}
                />
                <label className="sr-only" htmlFor="acc-type">
                  Account type
                </label>
                <select id="acc-type" className="select select--sm" value={type} onChange={(e) => setType(e.target.value as AccountType | '')} style={{ width: 120 }}>
                  <option value="">All types</option>
                  <option value="NBD">NBD</option>
                  <option value="EBD">EBD</option>
                </select>
                <label className="sr-only" htmlFor="acc-risk">
                  Risk level
                </label>
                <select id="acc-risk" className="select select--sm" value={risk} onChange={(e) => setRisk(e.target.value as RiskLevel | '')} style={{ width: 120 }}>
                  <option value="">All risk</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
            </div>
            {q.data.accounts.length === 0 ? (
              <EmptyState title="No accounts in your scope">
                You will see accounts here once you are captain or team member on one.
              </EmptyState>
            ) : rows.length === 0 ? (
              <EmptyState title="No accounts match these filters" icon="grid" />
            ) : (
              <AccountsTable rows={rows} caption="Accounts in scope" />
            )}
          </section>

          {can('ai.riskScan') && <RiskScanPanel />}
        </>
      )}
    </div>
  );
}

function HealthByGroupChart({ data }: { data: { groupName: string; avgHealth: number }[] }) {
  const t = useChartTheme();
  const sorted = [...data].sort((a, b) => a.avgHealth - b.avgHealth);
  const ax = axisBase(t);
  const option = {
    grid: { left: 8, right: 36, top: 26, bottom: 24, containLabel: true },
    tooltip: {
      ...tooltipBase(t),
      trigger: 'item',
      formatter: (p: { name: string; value: number }) => `${escapeHtml(p.name)}<br/><b>${p.value}</b> avg health`,
    },
    xAxis: { type: 'value', min: 0, max: 100, ...ax, axisLine: { show: false } },
    yAxis: { type: 'category', data: sorted.map((d) => d.groupName), ...ax, splitLine: { show: false } },
    series: [
      {
        type: 'bar',
        data: sorted.map((d) => d.avgHealth),
        barMaxWidth: 18,
        itemStyle: { color: t.accent, borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right', color: t.ink2, fontFamily: t.fontMono, fontSize: 11 },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: t.muted, type: 'dashed', width: 1 },
          label: { color: t.muted, fontSize: 10, position: 'end', formatter: 'High risk below 45' },
          data: [{ xAxis: 45 }],
        },
      },
    ],
  };
  return <Chart option={option} height={Math.max(140, sorted.length * 46 + 40)} ariaLabel={`Average health by group: ${sorted.map((d) => `${d.groupName} ${d.avgHealth}`).join(', ')}`} />;
}

function AttentionList({ accounts }: { accounts: AccountSummary[] }) {
  const top = [...accounts]
    .filter((a) => a.riskLevel !== 'Low')
    .sort((a, b) => a.health - b.health)
    .slice(0, 4);
  return (
    <section className="panel" aria-labelledby="attn-title">
      <div className="panel__head">
        <h2 id="attn-title" className="panel__title">
          Needs attention
        </h2>
        <span className="xsmall muted">Lowest health first</span>
      </div>
      {top.length === 0 ? (
        <EmptyState title="Nothing flagged" icon="check">
          Every account in scope is at low risk.
        </EmptyState>
      ) : (
        <ul className="attn-list">
          {top.map((a) => (
            <li key={a.id}>
              <Link to={`/accounts/${a.id}`} className="attn-list__row">
                <span className="attn-list__score mono">{Math.round(a.health)}</span>
                <span className="grow">
                  <span className="strong">{a.name}</span>
                  <span className="xsmall muted" style={{ display: 'block' }}>
                    {a.overdueActions} overdue · {a.staleSections} stale · {a.captainName}
                  </span>
                </span>
                <RiskPill level={a.riskLevel} compact />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
