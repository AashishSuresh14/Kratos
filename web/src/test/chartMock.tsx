// jsdom has no canvas: replace echarts with a labelled placeholder in component tests.
export const chartModuleMock = () => ({
  Chart: ({ ariaLabel }: { ariaLabel: string }) => <div role="img" aria-label={ariaLabel} />,
  useChartTheme: () => ({
    ink: '#000', ink2: '#000', muted: '#000', line: '#000', grid: '#000', surface: '#fff', accent: '#0f7c75',
    accentSoft: '#eee', ai: '#a2600f', good: '#0a0', warn: '#aa0', crit: '#a00', series: ['#1', '#2', '#3', '#4', '#5'],
    fontUi: 'sans-serif', fontMono: 'monospace',
  }),
  tooltipBase: () => ({}),
  axisBase: () => ({}),
});
