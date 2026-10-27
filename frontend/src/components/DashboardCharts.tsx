import { useEffect, useMemo, useRef } from 'react';
import { Card } from 'antd';
import { init, use, type EChartsCoreOption } from 'echarts/core';
import { BarChart, PieChart } from 'echarts/charts';
import { GraphicComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import type { Dashboard } from '../types/api';
import { dashboardSeries } from '../utils/dashboard';

use([BarChart, PieChart, GraphicComponent, GridComponent, LegendComponent, TooltipComponent, SVGRenderer]);

function Chart({ option, description }: { option: EChartsCoreOption; description: string }) {
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<ReturnType<typeof init> | null>(null);
  useEffect(() => {
    const chart = init(container.current!, undefined, { renderer: 'svg' });
    instance.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(container.current!);
    return () => {
      observer.disconnect();
      chart.dispose();
      instance.current = null;
    };
  }, []);
  useEffect(() => { instance.current?.setOption(option, { notMerge: true }); }, [option]);
  return <div ref={container} className="dashboard-chart" role="img" aria-label={description} />;
}

export function DashboardCharts({ data }: { data: Dashboard }) {
  const series = useMemo(() => dashboardSeries(data), [data]);
  const statusOption = useMemo<EChartsCoreOption>(() => ({
    color: ['#efc780', '#8fb7cb', '#78a58a'],
    tooltip: { trigger: 'item', renderMode: 'richText', formatter: '{b}：{c} 篇（{d}%）' },
    legend: { orient: 'vertical', right: '5%', top: 'middle', icon: 'circle', itemWidth: 8, itemHeight: 8, itemGap: 22, textStyle: { color: '#63746c', fontSize: 12 } },
    graphic: [{ type: 'group', left: '33%', top: '50%', bounding: 'raw', children: [
      { type: 'text', style: { x: 0, y: -4, text: String(data.total), fontSize: 28, fontWeight: 600, fill: '#29483c', align: 'center', verticalAlign: 'middle' } },
      { type: 'text', style: { x: 0, y: 19, text: '篇文献', fontSize: 11, fill: '#89978f', align: 'center' } },
    ] }],
    series: [{ type: 'pie', radius: ['52%', '72%'], center: ['33%', '50%'],
      label: { show: false },
      data: series.statuses }],
  }), [series, data.total]);
  const yearOption = useMemo<EChartsCoreOption>(() => ({
    color: ['#9dbba9'],
    tooltip: { trigger: 'axis', renderMode: 'richText', axisPointer: { type: 'shadow' } },
    grid: { left: 8, right: 8, top: 20, bottom: 6, containLabel: true },
    xAxis: { type: 'category', data: series.years.map((item) => item.name),
      axisLabel: { color: '#7d8b84', fontSize: 11, rotate: series.years.length > 6 ? 40 : 0, hideOverlap: true }, axisLine: { lineStyle: { color: '#d6dfd8' } }, axisTick: { show: false } },
    yAxis: { type: 'value', minInterval: 1, axisLabel: { color: '#8b9890', fontSize: 10 }, splitLine: { lineStyle: { color: '#f0f2ed' } } },
    series: [{ name: '文献数量', type: 'bar', barMaxWidth: 42,
      data: series.years.map((item, index) => ({ value: item.value, itemStyle: { color: index === series.years.length - 1 ? '#38634f' : '#a6c2af' } })), itemStyle: { borderRadius: [4, 4, 0, 0] } }],
  }), [series]);

  return <section className="dashboard-charts" aria-label="文献统计图表">
    <Card title="阅读状态分布">
      <Chart option={statusOption} description={`阅读状态分布：${series.statuses.map((item) => `${item.name} ${item.value} 篇`).join('，')}`} />
    </Card>
    <Card title="文献年份分布">
      <Chart option={yearOption} description={`文献年份分布：${series.years.map((item) => `${item.name} ${item.value} 篇`).join('，')}`} />
    </Card>
  </section>;
}
