import { useEffect, useMemo, useRef } from 'react';
import { Card } from 'antd';
import { init, use, type EChartsCoreOption } from 'echarts/core';
import { BarChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import type { Dashboard } from '../types/api';
import { dashboardSeries } from '../utils/dashboard';

use([BarChart, PieChart, GridComponent, LegendComponent, TooltipComponent, SVGRenderer]);

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
    color: ['#b4c3b8', '#d0a85c', '#245e4f'],
    tooltip: { trigger: 'item', renderMode: 'richText', formatter: '{b}：{c} 篇（{d}%）' },
    legend: { bottom: 0 },
    series: [{ type: 'pie', radius: ['42%', '65%'], center: ['50%', '44%'],
      label: { show: false }, emphasis: { label: { show: true, formatter: '{b}\n{c} 篇' } },
      data: series.statuses }],
  }), [series]);
  const yearOption = useMemo<EChartsCoreOption>(() => ({
    color: ['#245e4f'],
    tooltip: { trigger: 'axis', renderMode: 'richText', axisPointer: { type: 'shadow' } },
    grid: { left: 8, right: 12, top: 30, bottom: 10, containLabel: true },
    xAxis: { type: 'category', data: series.years.map((item) => item.name),
      axisLabel: { rotate: series.years.length > 6 ? 40 : 0, hideOverlap: true } },
    yAxis: { type: 'value', name: '篇', minInterval: 1 },
    series: [{ name: '文献数量', type: 'bar', barMaxWidth: 42,
      data: series.years.map((item) => item.value), itemStyle: { borderRadius: [5, 5, 0, 0] } }],
  }), [series]);

  return <section className="dashboard-charts" aria-label="文献统计图表">
    <Card title="阅读状态分布">
      <Chart option={statusOption} description={`阅读状态分布：${series.statuses.map((item) => `${item.name} ${item.value} 篇`).join('，')}`} />
    </Card>
    <Card title="文献年份分布">
      <Chart option={yearOption} description={`文献年份分布：${series.years.map((item) => `${item.name} ${item.value} 篇`).join('，')}`} />
      <p className="muted">按出版年份统计，未填写年份的文献单独计入“未填写”。</p>
    </Card>
  </section>;
}
