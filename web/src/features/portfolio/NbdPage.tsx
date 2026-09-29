import { Link, useNavigate } from 'react-router-dom';
import { useNbdView } from '../../api/hooks';
import type { NbdAccount } from '../../api/types';
import { axisBase, Chart, tooltipBase, useChartTheme } from '../../components/charts/Chart';
import { DataTable } from '../../components/DataTable';
import { PageHeader, useDocumentTitle } from '../../components/PageHeader';
import { RiskPill } from '../../components/RiskPill';
import { ScoreBar } from '../../components/ScoreBar';
import { EmptyState, ErrorState, SkeletonTable } from '../../components/States';
import { escapeHtml, formatMoney } from '../../lib/format';

export default function NbdPage() {
  useDocumentTitle('New business');
  const q = useNbdView();
  return (
    <div className="page">
      <PageHeader
        eyebrow="NBD view"
        title="New business accounts"
        subtitle="How ready each pursuit is to win, and where the best opportunities sit on potential versus effort."
      />
      {q.isPending ? (
        <div className="panel">
          <SkeletonTable />
        </div>
      ) : q.isError ? (
        <div className="panel">
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </div>
      ) : q.data.accounts.length === 0 ? (
        <div className="panel">
          <EmptyState title="No new business accounts in your scope" icon="target" />
        </div>
      ) : (
        <>
          <section className="panel" aria-labelledby="matrix-title">
            <div className="panel__head">
              <h2 id="matrix-title" className="panel__title">
                Opportunity matrix
              </h2>
              <div className="legend" aria-hidden="true">
                <span className="legend__item">
                  <span className="legend__swatch" style={{ background: 'var(--chart-1)', borderRadius: '50%' }} /> Priority
                </span>
                <span className="legend__item">
                  <span className="legend__swatch" style={{ background: 'var(--faint)', borderRadius: '50%' }} /> Other
                </span>
                <span className="legend__item muted">Bubble size = estimated value</span>
              </div>
            </div>
            <div className="panel__body">
              <OpportunityMatrix accounts={q.data.accounts} />
            </div>
          </section>

          <section className="panel" aria-labelledby="nbd-title">
            <div className="panel__head">
              <h2 id="nbd-title" className="panel__title">
                Readiness to win
              </h2>
              <span className="xsmall muted">Readiness blends the tactical checklist, brickwall and plan completeness</span>
            </div>
            <DataTable
              caption="New business accounts"
              rows={q.data.accounts}
              rowKey={(r) => r.id}
              initialSort={{ key: 'readiness', dir: 'desc' }}
              columns={[
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
                        {r.industry} · {r.captainName}
                      </span>
                    </div>
                  ),
                },
                {
                  key: 'readiness',
                  header: 'Readiness',
                  width: 160,
                  sortValue: (r) => r.readiness,
                  render: (r) => <ScoreBar value={r.readiness} tone="auto" label={`Readiness of ${r.name}`} />,
                },
                { key: 'health', header: 'Health', align: 'right', sortValue: (r) => r.health, render: (r) => <span className="num">{Math.round(r.health)}</span> },
                { key: 'risk', header: 'Risk', render: (r) => <RiskPill level={r.riskLevel} compact /> },
                {
                  key: 'opps',
                  header: 'Top opportunities',
                  render: (r) =>
                    r.topOpportunities.length ? (
                      <ul className="opp-list">
                        {r.topOpportunities.map((o) => (
                          <li key={o.id}>
                            <span className="mono xsmall opp-list__score">{Math.round(o.score)}</span>
                            <span className="small">{o.title}</span>
                            {o.isPriority && <span className="pill pill--accent" style={{ height: 18, fontSize: 10.5 }}>priority</span>}
                            <span className="muted xsmall mono">{formatMoney(o.estimatedValue)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="muted small">No opportunities yet</span>
                    ),
                },
              ]}
            />
          </section>
        </>
      )}
    </div>
  );
}

function OpportunityMatrix({ accounts }: { accounts: NbdAccount[] }) {
  const t = useChartTheme();
  const navigate = useNavigate();
  const points = accounts.flatMap((a) =>
    a.topOpportunities.map((o, i) => ({
      // Small deterministic offsets so opportunities on the same 1–5 cell stay visible.
      value: [o.effort + ((i % 3) - 1) * 0.12, o.potential + (((a.id.length + i) % 3) - 1) * 0.12, o.estimatedValue ?? 0],
      accountId: a.id,
      accountName: a.name,
      title: o.title,
      score: o.score,
      isPriority: o.isPriority,
      money: o.estimatedValue,
    })),
  );
  const maxV = Math.max(1, ...points.map((p) => p.money ?? 0));
  const size = (v: number) => 10 + Math.sqrt(v / maxV) * 30;
  const ax = axisBase(t);
  const mk = (priority: boolean) => ({
    type: 'scatter',
    name: priority ? 'Priority' : 'Other',
    data: points.filter((p) => p.isPriority === priority),
    symbolSize: (v: number[]) => size(v[2]),
    itemStyle: {
      color: priority ? t.series[0] : t.muted,
      opacity: priority ? 0.85 : 0.55,
      borderColor: t.surface,
      borderWidth: 2,
    },
    emphasis: { scale: 1.1 },
  });
  const option = {
    grid: { left: 48, right: 24, top: 16, bottom: 44 },
    tooltip: {
      ...tooltipBase(t),
      trigger: 'item',
      formatter: (p: { data: (typeof points)[number] }) =>
        `<b>${escapeHtml(p.data.title)}</b><br/>${escapeHtml(p.data.accountName)}<br/>Score ${p.data.score} · ${escapeHtml(formatMoney(p.data.money))}`,
    },
    xAxis: { type: 'value', name: 'Effort (1 low – 5 high)', nameLocation: 'middle', nameGap: 28, min: 0.5, max: 5.5, interval: 1, ...ax },
    yAxis: { type: 'value', name: 'Potential', nameLocation: 'middle', nameGap: 32, min: 0.5, max: 5.5, interval: 1, ...ax },
    series: [
      {
        ...mk(true),
        markArea: {
          silent: true,
          itemStyle: { color: t.accentSoft, opacity: 0.5 },
          label: { color: t.accent, fontSize: 11, position: 'insideTopLeft', fontFamily: t.fontUi },
          data: [[{ name: 'Quick wins', xAxis: 0.5, yAxis: 3.5 }, { xAxis: 3, yAxis: 5.5 }]],
        },
      },
      mk(false),
    ],
  };
  return (
    <Chart
      option={option}
      height={340}
      ariaLabel={`Opportunity matrix with ${points.length} opportunities plotted by effort and potential`}
      onEvents={{
        click: (p) => {
          const d = (p as { data?: { accountId?: string } }).data;
          if (d?.accountId) navigate(`/accounts/${d.accountId}?section=opportunities`);
        },
      }}
    />
  );
}
