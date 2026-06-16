<script setup lang="ts">
import { computed } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, RadarChart, LineChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  RadarComponent,
  TitleComponent
} from 'echarts/components'
import VChart from 'vue-echarts'
import { usePrintStore } from '../stores/printStore'
import type { EChartsOption } from 'echarts'
import { GRID_WIDTH, COVERAGE_THRESHOLDS } from '../types'
import type { SimulationResult, SavedScheme } from '../types'

use([
  CanvasRenderer,
  BarChart,
  RadarChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  RadarComponent,
  TitleComponent
])

const store = usePrintStore()

const thicknessDistOption = computed<EChartsOption>(() => {
  const result: SimulationResult | null = store.currentResult
  if (!result) {
    return { title: { text: '墨厚分布', left: 'center', textStyle: { fontSize: 13 } } }
  }

  const buckets = new Array(10).fill(0)
  const total = GRID_WIDTH * 80

  for (let y = 0; y < 80; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      const t = result.thicknessMap[y][x]
      const idx = Math.min(9, Math.floor(t * 10))
      buckets[idx]++
    }
  }

  const percentages = buckets.map(v => ((v / total) * 100).toFixed(1))

  return {
    title: { text: '油墨厚度分布', left: 'center', textStyle: { fontSize: 13, color: '#334155' } },
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const p = params[0]
        return `${p.name}<br/>占比: ${p.value}%`
      }
    },
    grid: { left: '10%', right: '5%', bottom: '15%', top: '20%' },
    xAxis: {
      type: 'category',
      data: ['0-10%', '10-20%', '20-30%', '30-40%', '40-50%', '50-60%', '60-70%', '70-80%', '80-90%', '90-100%'],
      axisLabel: { fontSize: 9, rotate: 30, color: '#64748b' },
      axisLine: { lineStyle: { color: '#e2e8f0' } }
    },
    yAxis: {
      type: 'value',
      name: '占比(%)',
      nameTextStyle: { fontSize: 10, color: '#64748b' },
      axisLabel: { fontSize: 10, color: '#64748b' },
      splitLine: { lineStyle: { color: '#f1f5f9' } }
    },
    series: [{
      type: 'bar',
      data: percentages.map((v, i) => ({
        value: parseFloat(v),
        itemStyle: {
          color: i < 2 ? '#f87171' : i >= 8 ? '#fb923c' : i >= 5 ? '#60a5fa' : '#34d399',
          borderRadius: [3, 3, 0, 0]
        }
      })),
      barWidth: '60%'
    }]
  }
})

const radarOption = computed<EChartsOption>(() => {
  const schemes: SavedScheme[] = store.compareSchemeData
  const result = store.currentResult
  const allSchemes: { name: string; result: SimulationResult }[] = []

  if (result) {
    allSchemes.push({ name: '当前方案', result })
  }
  schemes.forEach(s => allSchemes.push({ name: s.name, result: s.result }))

  if (allSchemes.length === 0) {
    return { title: { text: '质量雷达对比', left: 'center', textStyle: { fontSize: 13 } } }
  }

  const colors = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed']

  return {
    title: { text: '印刷质量雷达图', left: 'center', textStyle: { fontSize: 13, color: '#334155' } },
    tooltip: {},
    legend: {
      bottom: 0,
      data: allSchemes.map(s => s.name),
      textStyle: { fontSize: 10, color: '#64748b' }
    },
    radar: {
      indicator: [
        { name: '覆盖率', max: 100 },
        { name: '均匀度', max: 100 },
        { name: '油墨效率', max: 100 },
        { name: '参数合规', max: 100 },
        { name: '低风险率', max: 100 }
      ],
      center: ['50%', '52%'],
      radius: '58%',
      axisName: { fontSize: 10, color: '#475569' },
      splitLine: { lineStyle: { color: '#e2e8f0' } },
      splitArea: { areaStyle: { color: ['#f8fafc', '#ffffff'] } }
    },
    series: [{
      type: 'radar',
      data: allSchemes.map((s, idx) => {
        const r = s.result
        const coverageScore = r.coverage > COVERAGE_THRESHOLDS.tooHigh 
          ? 100 - (r.coverage - COVERAGE_THRESHOLDS.optimalMax) * 2
          : r.coverage < COVERAGE_THRESHOLDS.tooLow
            ? r.coverage * 2
            : 70 + (r.coverage - COVERAGE_THRESHOLDS.optimalMin) / (COVERAGE_THRESHOLDS.optimalMax - COVERAGE_THRESHOLDS.optimalMin) * 30

        const riskLevel = r.riskAlerts.reduce((acc, a) => Math.max(acc, a.level), 0)
        const riskScore = Math.max(0, 100 - riskLevel * 25)

        return {
          name: s.name,
          value: [
            Math.max(0, Math.min(100, coverageScore)),
            r.uniformity,
            Math.max(0, Math.min(100, r.averageThickness * 150)),
            100,
            riskScore
          ],
          lineStyle: { color: colors[idx % colors.length], width: 2 },
          itemStyle: { color: colors[idx % colors.length] },
          areaStyle: { opacity: 0.15, color: colors[idx % colors.length] }
        }
      })
    }]
  }
})

const compareBarOption = computed<EChartsOption>(() => {
  const schemes: SavedScheme[] = store.compareSchemeData
  const result = store.currentResult
  const allSchemes: { name: string; result: SimulationResult }[] = []

  if (result) {
    allSchemes.push({ name: '当前方案', result })
  }
  schemes.forEach(s => allSchemes.push({ name: s.name, result: s.result }))

  if (allSchemes.length < 2) {
    return { title: { text: '多方案指标对比', left: 'center', textStyle: { fontSize: 13 } } }
  }

  return {
    title: { text: '方案对比柱状图', left: 'center', textStyle: { fontSize: 13, color: '#334155' } },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { bottom: 0, textStyle: { fontSize: 10, color: '#64748b' } },
    grid: { left: '12%', right: '5%', bottom: '18%', top: '18%' },
    xAxis: {
      type: 'category',
      data: ['覆盖率(%)', '均匀度(%)', '平均墨厚(%)'],
      axisLabel: { fontSize: 10, color: '#64748b' },
      axisLine: { lineStyle: { color: '#e2e8f0' } }
    },
    yAxis: {
      type: 'value',
      max: 100,
      axisLabel: { fontSize: 10, color: '#64748b' },
      splitLine: { lineStyle: { color: '#f1f5f9' } }
    },
    series: allSchemes.map(s => ({
      name: s.name,
      type: 'bar',
      data: [
        parseFloat(s.result.coverage.toFixed(1)),
        parseFloat(s.result.uniformity.toFixed(1)),
        parseFloat((s.result.averageThickness * 100).toFixed(1))
      ],
      itemStyle: { borderRadius: [3, 3, 0, 0] },
      barGap: '10%'
    }))
  }
})

const crossSectionOption = computed<EChartsOption>(() => {
  const result: SimulationResult | null = store.currentResult
  if (!result) {
    return { title: { text: '横向剖面墨厚', left: 'center', textStyle: { fontSize: 13 } } }
  }

  const midY = 40
  const data: number[] = []
  for (let x = 0; x < GRID_WIDTH; x++) {
    data.push(parseFloat((result.thicknessMap[midY][x] * 100).toFixed(1)))
  }

  return {
    title: { text: '横向剖面墨厚分布', left: 'center', textStyle: { fontSize: 13, color: '#334155' } },
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const p = params[0]
        return `X位置: ${p.dataIndex}<br/>墨厚: ${p.value}%`
      }
    },
    grid: { left: '10%', right: '5%', bottom: '12%', top: '18%' },
    xAxis: {
      type: 'category',
      data: Array.from({ length: GRID_WIDTH }, (_, i) => i),
      axisLabel: { fontSize: 9, color: '#64748b', interval: 10 },
      axisLine: { lineStyle: { color: '#e2e8f0' } }
    },
    yAxis: {
      type: 'value',
      name: '墨厚(%)',
      max: 100,
      nameTextStyle: { fontSize: 10, color: '#64748b' },
      axisLabel: { fontSize: 10, color: '#64748b' },
      splitLine: { lineStyle: { color: '#f1f5f9' } }
    },
    series: [{
      type: 'line',
      data,
      smooth: true,
      showSymbol: false,
      lineStyle: { color: '#2563eb', width: 2 },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(37, 99, 235, 0.4)' },
            { offset: 1, color: 'rgba(37, 99, 235, 0.02)' }
          ]
        }
      },
      markLine: {
        silent: true,
        lineStyle: { color: '#94a3b8', type: 'dashed' },
        data: [
          { yAxis: 15, label: { formatter: '缺墨线', fontSize: 9, color: '#f87171' }, lineStyle: { color: '#f87171' } },
          { yAxis: 85, label: { formatter: '糊版线', fontSize: 9, color: '#fb923c' }, lineStyle: { color: '#fb923c' } }
        ]
      }
    }]
  }
})
</script>

<template>
  <div class="charts-grid">
    <div class="chart-card">
      <VChart class="chart" :option="thicknessDistOption" autoresize />
    </div>
    <div class="chart-card">
      <VChart class="chart" :option="crossSectionOption" autoresize />
    </div>
    <div class="chart-card">
      <VChart class="chart" :option="radarOption" autoresize />
    </div>
    <div class="chart-card">
      <VChart class="chart" :option="compareBarOption" autoresize />
    </div>
  </div>
</template>

<style scoped>
.charts-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.chart-card {
  background: #fff;
  border-radius: 10px;
  padding: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  border: 1px solid #e2e8f0;
  min-height: 280px;
}

.chart {
  width: 100%;
  height: 260px;
}

@media (max-width: 900px) {
  .charts-grid {
    grid-template-columns: 1fr;
  }
}
</style>
