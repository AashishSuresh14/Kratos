import { useState } from 'react';
import { useDiff, useTrend, useVersions } from '../../api/hooks';
import type { ScoreTrend } from '../../api/types';
import { axisBase, Chart, tooltipBase, useChartTheme } from '../../components/charts/Chart';
import { DataTable } from '../../components/DataTable';
import { RiskPill } from '../../components/RiskPill';
import { EmptyState, ErrorState, SkeletonLines, SkeletonTable } from '../../components/States';
import { escapeHtml, formatDateTime, formatShortDate, SECTION_INFO } from '../../lib/format';
import { usePlan } from './planContext';

const SERIES: { key: keyof Omit<ScoreTrend['points'][number], 'version' | 'date'>; label: string }[] = [
  { key: 'health', label: 'Health' },
  { key: 'opportunity', label: 'Opportunity' },
  { key: 'brickwall', label: 'Brickwall' },
  { key: 'checklist', label: 'Checklist' },
  { key: 'perception', label: 'Perception' },
];

export function HistoryTab() {
  const { accountId } = usePlan();
  const versions = useVersions(accountId);
  const trend = useTrend(accountId);
  const list = versions.data ?? [];
  const [a, setA] = useState<number | null>(null);
  const [b, setB] = useState<number | null>(null);
  // Default: newest against the one before it.
  const left = a ?? list[0]?.number ?? null;
  const right = b ?? list[1]?.number ?? null;
  const diff = useDiff(accountId, left, right);

  return (
    <div className="stack" style={{ ['--gap' as string]: '18px' }}>
      <section className="panel" aria-labelledby="trend-title">
        <div className="panel__head">
          <h2 id="trend-title" className="panel__title">
            Score trend by version
          </h2>
          <span className="xsmall muted">0–100, one point per saved version</span>
        </div>
        <div className="panel__body">
          {trend.isPending ? (
            <SkeletonLines lines={6} />
          ) : trend.isError ? (
            <ErrorState error={trend.error} onRetry={() => void trend.refetch()} />
          ) : trend.data.points.length === 0 ? (
            <EmptyState title="No versions yet" icon="history">
              Save a version to start the trend line.
            </EmptyState>
          ) : (
            <TrendChart points={trend.data.points} />
          )}
        </div>
      </section>

      <div className="history-grid">
        <section className="panel" aria-labelledby="versions-title">
          <div className="panel__head">
            <h2 id="versions-title" className="panel__title">
              Versions
            </h2>
            <span className="xsmall muted mono">{list.length}</span>
          </div>
          {versions.isPending ? (
            <SkeletonTable rows={4} cols={4} />
          ) : versions.isError ? (
            <ErrorState error={versions.error} onRetry={() => void versions.refetch()} />
          ) : (
            <DataTable
              caption="Plan versions"
              compact
              rows={list}
              rowKey={(v) => String(v.number)}
              empty={<span className="muted small">No versions saved yet.</span>}
              columns={[
                { key: 'n', header: 'Version', render: (v) => <span className="mono strong">v{v.number}</span> },
                {
                  key: 'what',
                  header: 'Change',
                  render: (v) => (
                    <div>
                      <span className="small">{v.changeSummary || <span className="muted">No summary</span>}</span>
                      <span className="xsmall muted" style={{ display: 'block' }}>
                        {v.createdBy} · {formatDateTime(v.createdAt)}
                      </span>
                    </div>
                  ),
                },
                { key: 'h', header: 'Health', align: 'right', render: (v) => <span className="num">{Math.round(v.scores.health)}</span> },
                { key: 'r', header: 'Risk', render: (v) => <RiskPill level={v.scores.riskLevel} compact /> },
              ]}
            />
          )}
        </section>

        <section className="panel" aria-labelledby="diff-title">
          <div className="panel__head">
            <h2 id="diff-title" className="panel__title">
              Compare versions
            </h2>
            {list.length >= 2 && (
              <div className="cluster small">
                <label className="cluster" style={{ ['--gap' as string]: '6px' }}>
                  <span className="muted">Version</span>
                  <select className="select select--sm" value={left ?? ''} onChange={(e) => setA(Number(e.target.value))} style={{ width: 84 }}>
                    {list.map((v) => (
                      <option key={v.number} value={v.number}>
                        v{v.number}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="cluster" style={{ ['--gap' as string]: '6px' }}>
                  <span className="muted">against</span>
                  <select className="select select--sm" value={right ?? ''} onChange={(e) => setB(Number(e.target.value))} style={{ width: 84 }}>
                    {list.map((v) => (
                      <option key={v.number} value={v.number}>
                        v{v.number}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </div>
          {list.length < 2 ? (
            <EmptyState title="Need two versions to compare" icon="history" />
          ) : left === right ? (
            <EmptyState title="Pick two different versions" icon="history" />
          ) : diff.isPending ? (
            <SkeletonTable rows={4} cols={4} />
          ) : diff.isError ? (
            <ErrorState error={diff.error} onRetry={() => void diff.refetch()} />
          ) : (
            <DataTable
              caption={`Changes between v${right} and v${left}`}
              compact
              rows={diff.data.changes.map((c, i) => ({ ...c, i }))}
              rowKey={(c) => String(c.i)}
              empty={<span className="muted small">No differences between these versions.</span>}
              columns={[
                {
                  key: 's',
                  header: 'Section',
                  render: (c) => <span className="code-badge" title={SECTION_INFO[c.section]?.title}>{SECTION_INFO[c.section]?.code ?? c.section}</span>,
                },
                { key: 'f', header: 'Field', render: (c) => <span className="small strong">{c.field}</span> },
                { key: 'b', header: `Before (v${right})`, render: (c) => <span className="small diff-before">{c.before || '–'}</span> },
                { key: 'a', header: `After (v${left})`, render: (c) => <span className="small diff-after">{c.after || '–'}</span> },
              ]}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function TrendChart({ points }: { points: ScoreTrend['points'] }) {
  const t = useChartTheme();
  const ax = axisBase(t);
  const colors = [t.accent, t.series[1], t.series[2], t.series[3], t.series[4]];
  const option = {
    grid: { left: 40, right: 110, top: 16, bottom: 32 },
    tooltip: {
      ...tooltipBase(t),
      trigger: 'axis',
      formatter: (ps: { seriesName: string; value: number; marker: string; dataIndex: number }[]) => {
        const p = points[ps[0]?.dataIndex ?? 0];
        return `<b>v${p.version}</b> · ${escapeHtml(formatShortDate(p.date))}<br/>${ps
          .map((x) => `${x.marker}${escapeHtml(x.seriesName)} <b>${Math.round(x.value)}</b>`)
          .join('<br/>')}`;
      },
    },
    xAxis: { type: 'category', data: points.map((p) => `v${p.version}`), boundaryGap: false, ...ax, splitLine: { show: false } },
    yAxis: { type: 'value', min: 0, max: 100, ...ax },
    series: SERIES.map((s, i) => ({
      type: 'line',
      name: s.label,
      data: points.map((p) => p[s.key]),
      smooth: false,
      symbolSize: s.key === 'health' ? 8 : 5,
      lineStyle: { width: s.key === 'health' ? 3 : 1.5, color: colors[i] },
      itemStyle: { color: colors[i] },
      endLabel: { show: true, formatter: s.label, color: colors[i], fontFamily: t.fontUi, fontSize: 11 },
      z: s.key === 'health' ? 5 : 2,
    })),
  };
  const last = points[points.length - 1];
  return (
    <Chart
      option={option}
      height={280}
      ariaLabel={`Score trend over ${points.length} versions. Latest health ${Math.round(last.health)}, opportunity ${Math.round(last.opportunity)}, brickwall ${Math.round(last.brickwall)}, checklist ${Math.round(last.checklist)}, perception ${Math.round(last.perception)}.`}
    />
  );
}
