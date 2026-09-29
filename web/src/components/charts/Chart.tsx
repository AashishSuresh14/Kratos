import { useEffect, useState } from 'react';
import ReactEChartsCoreImport from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';

// echarts-for-react/lib/core is CommonJS. Depending on the bundler's interop it arrives as the component
// or as `{ default: component }` (Vite dev pre-bundling does the latter). Normalise so both work.
const ReactEChartsCore =
  (ReactEChartsCoreImport as unknown as { default?: typeof ReactEChartsCoreImport }).default ?? ReactEChartsCoreImport;
import { BarChart, GaugeChart, LineChart, ScatterChart } from 'echarts/charts';
import { GridComponent, MarkAreaComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  BarChart,
  GaugeChart,
  LineChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  MarkAreaComponent,
  CanvasRenderer,
]);

export interface ChartTheme {
  ink: string;
  ink2: string;
  muted: string;
  line: string;
  grid: string;
  surface: string;
  accent: string;
  accentSoft: string;
  ai: string;
  good: string;
  warn: string;
  crit: string;
  series: string[];
  fontUi: string;
  fontMono: string;
}

function readTheme(): ChartTheme {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  return {
    ink: v('--ink', '#142b29'),
    ink2: v('--ink-2', '#33504c'),
    muted: v('--muted', '#58706c'),
    line: v('--line', '#cfdcd9'),
    grid: v('--chart-grid', '#e2eae8'),
    surface: v('--surface', '#ffffff'),
    accent: v('--accent', '#0f7c75'),
    accentSoft: v('--accent-soft', '#e1f0ee'),
    ai: v('--ai', '#a2600f'),
    good: v('--good', '#2d7a4c'),
    warn: v('--warn', '#8a6400'),
    crit: v('--crit', '#b3261e'),
    series: [1, 2, 3, 4, 5].map((i) => v(`--chart-${i}`, '#0f7c75')),
    fontUi: v('--font-ui', 'sans-serif'),
    fontMono: v('--font-mono', 'monospace'),
  };
}

/** Chart colours come from the CSS tokens and follow light/dark changes live. */
export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(() => readTheme());
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const update = () => setTheme(readTheme());
    mq?.addEventListener?.('change', update);
    return () => mq?.removeEventListener?.('change', update);
  }, []);
  return theme;
}

/** Tooltip base shared by every chart: surface card, token text colours. */
export function tooltipBase(t: ChartTheme) {
  return {
    backgroundColor: t.surface,
    borderColor: t.line,
    borderWidth: 1,
    padding: [8, 10],
    textStyle: { color: t.ink, fontFamily: t.fontUi, fontSize: 12 },
    extraCssText: 'box-shadow: 0 6px 20px -6px rgba(0,0,0,.25); border-radius: 6px;',
  };
}

export function axisBase(t: ChartTheme) {
  return {
    axisLine: { lineStyle: { color: t.line } },
    axisTick: { show: false },
    axisLabel: { color: t.muted, fontFamily: t.fontUi, fontSize: 11 },
    splitLine: { lineStyle: { color: t.grid } },
    nameTextStyle: { color: t.muted, fontFamily: t.fontUi, fontSize: 11 },
  };
}

export function Chart({
  option,
  height,
  ariaLabel,
  onEvents,
}: {
  option: Record<string, unknown>;
  height: number;
  ariaLabel: string;
  onEvents?: Record<string, (params: unknown) => void>;
}) {
  return (
    <div className="chart" role="img" aria-label={ariaLabel}>
      <ReactEChartsCore
        echarts={echarts}
        option={{ animationDuration: 400, ...option }}
        notMerge
        lazyUpdate
        style={{ height, width: '100%' }}
        opts={{ renderer: 'canvas' }}
        onEvents={onEvents}
      />
    </div>
  );
}
