import { Chart, useChartTheme } from './charts/Chart';

/** 0–100 health gauge; the arc colour follows the same thresholds as the risk bands. */
export function HealthGauge({ value, size = 132, caption = 'HEALTH' }: { value: number; size?: number; caption?: string }) {
  const t = useChartTheme();
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const color = v >= 70 ? t.good : v >= 50 ? t.warn : t.crit;
  const option = {
    series: [
      {
        type: 'gauge',
        startAngle: 210,
        endAngle: -30,
        min: 0,
        max: 100,
        radius: '96%',
        center: ['50%', '56%'],
        progress: { show: true, width: 10, roundCap: true, itemStyle: { color } },
        axisLine: { lineStyle: { width: 10, color: [[1, t.grid]] }, roundCap: true },
        pointer: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        anchor: { show: false },
        title: { show: false },
        detail: { show: false },
        data: [{ value: v }],
      },
    ],
  };
  return (
    <div className="gauge" style={{ width: size, height: size * 0.82 }}>
      <Chart option={option} height={size * 0.82} ariaLabel={`Health score ${v} out of 100`} />
      <div className="gauge__label" aria-hidden="true">
        <span className="gauge__value">{v}</span>
        <span className="gauge__caption">{caption}</span>
      </div>
    </div>
  );
}
