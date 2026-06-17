<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  DataZoomComponent
} from 'echarts/components'
import VChart from 'vue-echarts'
import { usePrintStore } from '../stores/printStore'
import type { EChartsOption } from 'echarts'
import { ENV_PARAMS_RANGES, AGING_SIMULATION_CONFIG } from '../types'
import type { EnvironmentParams, AbnormalPhase, MaintenanceSuggestion } from '../types'

use([
  CanvasRenderer,
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  DataZoomComponent
])

const store = usePrintStore()

type TabType = 'params' | 'trends' | 'analysis' | 'suggestions'
const activeTab = ref<TabType>('params')

const playbackSpeeds = [
  { label: '0.5x', value: 1000 },
  { label: '1x', value: 500 },
  { label: '2x', value: 250 },
  { label: '4x', value: 125 }
]

const envParamConfigs = [
  {
    key: 'temperature' as const,
    label: '环境温度',
    icon: 'thermometer',
    description: '影响油墨黏度和流动性',
    color: '#ef4444',
    range: ENV_PARAMS_RANGES.temperature
  },
  {
    key: 'humidity' as const,
    label: '相对湿度',
    icon: 'droplet',
    description: '影响纸张吸墨和油墨干燥',
    color: '#3b82f6',
    range: ENV_PARAMS_RANGES.humidity
  },
  {
    key: 'rollerWear' as const,
    label: '滚筒磨损',
    icon: 'cog',
    description: '磨损降低压力传递效率',
    color: '#f59e0b',
    range: ENV_PARAMS_RANGES.rollerWear
  },
  {
    key: 'paperAbsorption' as const,
    label: '纸张吸墨性',
    icon: 'layers',
    description: '吸墨性影响墨层厚度',
    color: '#8b5cf6',
    range: ENV_PARAMS_RANGES.paperAbsorption
  },
  {
    key: 'printRunCount' as const,
    label: '累计印刷次数',
    icon: 'repeat',
    description: '连续印刷产生设备疲劳',
    color: '#06b6d4',
    range: ENV_PARAMS_RANGES.printRunCount
  }
]

const stepsInput = ref(String(store.agingSteps))

function onStepsInputChange(event: Event) {
  const target = event.target as HTMLInputElement
  stepsInput.value = target.value
  const val = parseInt(target.value)
  if (!isNaN(val)) {
    store.setAgingSteps(val)
  }
}

function onStepsInputBlur() {
  stepsInput.value = String(store.agingSteps)
}

async function handleStartAnalysis() {
  await store.startAgingAnalysis()
}

function onEnvSliderChange(key: keyof EnvironmentParams, event: Event) {
  const target = event.target as HTMLInputElement
  const value = parseFloat(target.value)
  if (!isNaN(value)) {
    store.updateEnvParam(key, value)
  }
}

function onEnvInputChange(key: keyof EnvironmentParams, event: Event) {
  const target = event.target as HTMLInputElement
  const value = parseFloat(target.value)
  if (!isNaN(value)) {
    store.updateEnvParam(key, value)
  }
}

function getEnvSliderFillPercent(key: keyof EnvironmentParams) {
  const range = ENV_PARAMS_RANGES[key]
  const value = store.envParams[key]
  return ((value - range.min) / (range.max - range.min)) * 100
}

const qualityTrendOption = computed<EChartsOption>(() => {
  const analysis = store.activeAgingAnalysis
  if (!analysis) {
    return {
      title: { text: '质量趋势图', left: 'center', textStyle: { fontSize: 14 } }
    }
  }

  const data = analysis.timeSeries
  const indices = data.map(d => d.index)
  const coverages = data.map(d => d.result.coverage.toFixed(1))
  const uniformities = data.map(d => d.result.uniformity.toFixed(1))
  const risks = data.map(d => d.riskScore.toFixed(0))

  const markAreas: any[] = []
  analysis.abnormalPhases.forEach(phase => {
    const color = phase.severity === 'severe' ? 'rgba(239,68,68,0.15)' :
                  phase.severity === 'moderate' ? 'rgba(245,158,11,0.15)' :
                  'rgba(59,130,246,0.1)'
    markAreas.push([
      { xAxis: phase.startIndex, itemStyle: { color } },
      { xAxis: phase.endIndex }
    ])
  })

  return {
    title: {
      text: '质量指标趋势',
      left: 'center',
      textStyle: { fontSize: 14, color: '#334155' }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      formatter: (params: any) => {
        const idx = params[0]?.dataIndex ?? 0
        const point = data[idx]
        if (!point) return ''
        let html = `<div style="font-weight:600;margin-bottom:6px;">第 ${idx + 1} 阶段</div>`
        html += `<div style="font-size:11px;color:#64748b;margin-bottom:4px;">`
        html += `温度: ${point.envParams.temperature}°C | 湿度: ${point.envParams.humidity}%<br/>`
        html += `磨损: ${point.envParams.rollerWear}% | 吸墨: ${point.envParams.paperAbsorption}%`
        html += `</div>`
        params.forEach((p: any) => {
          html += `<div style="display:flex;align-items:center;gap:6px;margin:3px 0;">`
          html += `<span style="width:8px;height:8px;border-radius:50%;background:${p.color};"></span>`
          html += `<span>${p.seriesName}: </span>`
          html += `<span style="font-weight:600;">${p.value}${p.seriesName.includes('风险') ? '' : '%'}</span>`
          html += `</div>`
        })
        return html
      }
    },
    legend: {
      bottom: 0,
      data: ['覆盖率', '均匀度', '风险评分'],
      textStyle: { fontSize: 11, color: '#64748b' }
    },
    grid: { left: '10%', right: '8%', bottom: '18%', top: '15%' },
    xAxis: {
      type: 'category',
      data: indices,
      name: '阶段',
      nameTextStyle: { fontSize: 10, color: '#94a3b8' },
      axisLabel: { fontSize: 10, color: '#94a3b8' },
      axisLine: { lineStyle: { color: '#e2e8f0' } }
    },
    yAxis: [
      {
        type: 'value',
        name: '覆盖率/均匀度(%)',
        min: 0,
        max: 100,
        nameTextStyle: { fontSize: 10, color: '#94a3b8' },
        axisLabel: { fontSize: 10, color: '#94a3b8' },
        splitLine: { lineStyle: { color: '#f1f5f9' } }
      },
      {
        type: 'value',
        name: '风险评分',
        min: 0,
        max: 100,
        nameTextStyle: { fontSize: 10, color: '#94a3b8' },
        axisLabel: { fontSize: 10, color: '#94a3b8' },
        splitLine: { show: false }
      }
    ],
    dataZoom: [
      {
        type: 'inside',
        start: 0,
        end: 100
      }
    ],
    series: [
      {
        name: '覆盖率',
        type: 'line',
        data: coverages,
        smooth: true,
        showSymbol: false,
        lineStyle: { color: '#2563eb', width: 2 },
        itemStyle: { color: '#2563eb' },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(37, 99, 235, 0.25)' },
              { offset: 1, color: 'rgba(37, 99, 235, 0.02)' }
            ]
          }
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#10b981', type: 'dashed', width: 1 },
          data: [
            { yAxis: 50, label: { formatter: '合格线', fontSize: 9, color: '#10b981' } }
          ]
        },
        markArea: {
          silent: true,
          data: markAreas
        }
      },
      {
        name: '均匀度',
        type: 'line',
        data: uniformities,
        smooth: true,
        showSymbol: false,
        lineStyle: { color: '#059669', width: 2 },
        itemStyle: { color: '#059669' },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(5, 150, 105, 0.2)' },
              { offset: 1, color: 'rgba(5, 150, 105, 0.02)' }
            ]
          }
        }
      },
      {
        name: '风险评分',
        type: 'line',
        yAxisIndex: 1,
        data: risks,
        smooth: true,
        showSymbol: false,
        lineStyle: { color: '#dc2626', width: 2 },
        itemStyle: { color: '#dc2626' },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(220, 38, 38, 0.15)' },
              { offset: 1, color: 'rgba(220, 38, 38, 0.02)' }
            ]
          }
        }
      }
    ]
  }
})

const envTrendOption = computed<EChartsOption>(() => {
  const analysis = store.activeAgingAnalysis
  if (!analysis) {
    return {
      title: { text: '环境参数趋势', left: 'center', textStyle: { fontSize: 14 } }
    }
  }

  const data = analysis.timeSeries
  const indices = data.map(d => d.index)

  return {
    title: {
      text: '环境参数变化趋势',
      left: 'center',
      textStyle: { fontSize: 14, color: '#334155' }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' }
    },
    legend: {
      bottom: 0,
      data: ['温度(°C)', '湿度(%)', '滚筒磨损(%)', '纸张吸墨(%)'],
      textStyle: { fontSize: 10, color: '#64748b' }
    },
    grid: { left: '10%', right: '5%', bottom: '18%', top: '15%' },
    xAxis: {
      type: 'category',
      data: indices,
      name: '阶段',
      nameTextStyle: { fontSize: 10, color: '#94a3b8' },
      axisLabel: { fontSize: 10, color: '#94a3b8' },
      axisLine: { lineStyle: { color: '#e2e8f0' } }
    },
    yAxis: {
      type: 'value',
      name: '数值',
      nameTextStyle: { fontSize: 10, color: '#94a3b8' },
      axisLabel: { fontSize: 10, color: '#94a3b8' },
      splitLine: { lineStyle: { color: '#f1f5f9' } }
    },
    dataZoom: [
      { type: 'inside', start: 0, end: 100 }
    ],
    series: [
      {
        name: '温度(°C)',
        type: 'line',
        data: data.map(d => d.envParams.temperature),
        smooth: true,
        showSymbol: false,
        lineStyle: { color: '#ef4444', width: 1.5 },
        itemStyle: { color: '#ef4444' }
      },
      {
        name: '湿度(%)',
        type: 'line',
        data: data.map(d => d.envParams.humidity),
        smooth: true,
        showSymbol: false,
        lineStyle: { color: '#3b82f6', width: 1.5 },
        itemStyle: { color: '#3b82f6' }
      },
      {
        name: '滚筒磨损(%)',
        type: 'line',
        data: data.map(d => d.envParams.rollerWear),
        smooth: true,
        showSymbol: false,
        lineStyle: { color: '#f59e0b', width: 2 },
        itemStyle: { color: '#f59e0b' }
      },
      {
        name: '纸张吸墨(%)',
        type: 'line',
        data: data.map(d => d.envParams.paperAbsorption),
        smooth: true,
        showSymbol: false,
        lineStyle: { color: '#8b5cf6', width: 1.5 },
        itemStyle: { color: '#8b5cf6' }
      }
    ]
  }
})

const severityStyle: Record<AbnormalPhase['severity'], { bg: string; border: string; text: string; badge: string }> = {
  mild: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-700',
    badge: 'bg-blue-500'
  },
  moderate: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    badge: 'bg-amber-500'
  },
  severe: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    badge: 'bg-red-500'
  }
}

const severityLabels: Record<AbnormalPhase['severity'], string> = {
  mild: '轻微',
  moderate: '中等',
  severe: '严重'
}

const typeLabels: Record<AbnormalPhase['type'], string> = {
  coverage_drop: '覆盖率下降',
  uniformity_drop: '均匀度下降',
  risk_spike: '风险突增',
  sudden_change: '突变'
}

const priorityStyle: Record<MaintenanceSuggestion['priority'], { bg: string; border: string; text: string; badge: string }> = {
  high: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    badge: 'bg-red-500'
  },
  medium: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    badge: 'bg-amber-500'
  },
  low: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-700',
    badge: 'bg-green-500'
  }
}

const priorityLabels: Record<MaintenanceSuggestion['priority'], string> = {
  high: '高优先级',
  medium: '中优先级',
  low: '低优先级'
}

const categoryLabels: Record<MaintenanceSuggestion['category'], string> = {
  roller: '滚筒',
  ink: '油墨',
  paper: '纸张',
  environment: '环境',
  general: '综合'
}

function qualityColor(quality: string): string {
  const map: Record<string, string> = {
    excellent: '#10b981',
    good: '#3b82f6',
    fair: '#f59e0b',
    poor: '#ef4444'
  }
  return map[quality] || '#94a3b8'
}

function handlePlayPause() {
  if (store.agingPlaybackState.isPlaying && !store.agingPlaybackState.isPaused) {
    store.pauseAgingPlayback()
  } else if (store.agingPlaybackState.isPlaying && store.agingPlaybackState.isPaused) {
    store.resumeAgingPlayback()
  } else {
    store.startAgingPlayback()
  }
}

function handleJumpToPhase(phase: AbnormalPhase) {
  store.jumpToAgingIndex(phase.startIndex)
}

watch(() => store.agingPlaybackIndex, (idx) => {
  if (idx >= 0 && store.activeAgingAnalysis) {
    const point = store.currentAgingPoint
    if (point) {
      store.applyAgingPointParams(point)
    }
  }
}, { immediate: false })
</script>

<template>
  <div class="aging-analysis">
    <div class="analysis-header">
      <h3 class="panel-title">
        <svg class="title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        环境扰动与设备老化分析
      </h3>
      <div v-if="store.agingAnalyses.length > 0" class="header-badge">
        {{ store.agingAnalyses.length }} 个分析
      </div>
    </div>

    <div class="analysis-tabs">
      <button
        v-for="tab in [
          { key: 'params', label: '环境参数' },
          { key: 'trends', label: '趋势图表' },
          { key: 'analysis', label: '质量分析' },
          { key: 'suggestions', label: '维护建议' }
        ]"
        :key="tab.key"
        class="analysis-tab"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key as TabType"
      >
        {{ tab.label }}
      </button>
    </div>

    <div v-show="activeTab === 'params'" class="tab-content">
      <div class="env-params-section">
        <div class="section-header">
          <h4 class="section-title">环境与设备参数</h4>
          <button class="reset-btn" @click="store.resetEnvParams()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            重置
          </button>
        </div>

        <div class="env-params-list">
          <div v-for="config in envParamConfigs" :key="config.key" class="env-param-item">
            <div class="param-top-row">
              <div class="param-info">
                <div class="param-icon" :style="{ background: config.color + '15', color: config.color }">
                  <svg v-if="config.icon === 'thermometer'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
                  </svg>
                  <svg v-else-if="config.icon === 'droplet'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                  </svg>
                  <svg v-else-if="config.icon === 'cog'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  <svg v-else-if="config.icon === 'layers'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="12 2 2 7 12 12 22 7 12 2" />
                    <polyline points="2 17 12 22 22 17" />
                    <polyline points="2 12 12 17 22 12" />
                  </svg>
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17 1l4 4-4 4" />
                    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                    <path d="M7 23l-4-4 4-4" />
                    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                  </svg>
                </div>
                <div class="param-text">
                  <div class="param-name">{{ config.label }}</div>
                  <div class="param-desc">{{ config.description }}</div>
                </div>
              </div>
              <div class="param-value-wrap">
                <input
                  type="number"
                  :value="store.envParams[config.key]"
                  :step="config.range.step"
                  :min="config.range.min"
                  :max="config.range.max"
                  @input="onEnvInputChange(config.key, $event)"
                  class="param-input"
                />
                <span class="param-unit">{{ config.range.unit }}</span>
              </div>
            </div>
            <div class="param-slider-wrap">
              <div class="slider-track">
                <div
                  class="slider-fill"
                  :style="{ width: getEnvSliderFillPercent(config.key) + '%', background: config.color }"
                ></div>
              </div>
              <input
                type="range"
                :value="store.envParams[config.key]"
                :step="config.range.step"
                :min="config.range.min"
                :max="config.range.max"
                @input="onEnvSliderChange(config.key, $event)"
                class="param-slider"
                :style="{ '--slider-color': config.color }"
              />
              <div class="slider-labels">
                <span>{{ config.range.min }}</span>
                <span>{{ config.range.max }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="start-section">
        <div class="steps-config">
          <label class="steps-label">
            模拟阶段数
            <input
              :value="stepsInput"
              type="number"
              :min="AGING_SIMULATION_CONFIG.minSteps"
              :max="AGING_SIMULATION_CONFIG.maxSteps"
              step="10"
              @input="onStepsInputChange"
              @blur="onStepsInputBlur"
              class="steps-input"
            />
            <span class="steps-hint">({{ AGING_SIMULATION_CONFIG.minSteps }}-{{ AGING_SIMULATION_CONFIG.maxSteps }})</span>
          </label>
        </div>

        <button
          class="start-btn"
          :disabled="!store.paramsValid || store.agingRunning"
          @click="handleStartAnalysis"
        >
          <svg v-if="!store.agingRunning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <svg v-else class="spinning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          {{ store.agingRunning ? '分析中...' : '开始老化分析' }}
        </button>

        <div v-if="store.agingProgress" class="progress-bar">
          <div
            class="progress-fill"
            :style="{ width: (store.agingProgress.completed / store.agingProgress.total * 100) + '%' }"
          ></div>
          <span class="progress-text">
            {{ store.agingProgress.completed }} / {{ store.agingProgress.total }}
          </span>
        </div>
      </div>

      <div v-if="store.agingAnalyses.length > 0" class="history-section">
        <div class="section-header">
          <h4 class="section-title">历史分析</h4>
        </div>
        <div class="analysis-history-list">
          <div
            v-for="a in store.agingAnalyses"
            :key="a.id"
            class="history-item"
            :class="{ active: a.id === store.activeAgingId }"
            @click="store.setActiveAgingAnalysis(a.id === store.activeAgingId ? null : a.id)"
          >
            <div class="history-info">
              <div class="history-name">{{ a.name }}</div>
              <div class="history-meta">{{ a.totalSteps }} 阶段 · {{ new Date(a.startTime).toLocaleDateString() }}</div>
            </div>
            <button
              class="delete-btn"
              @click.stop="store.deleteAgingAnalysis(a.id)"
              title="删除"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-show="activeTab === 'trends'" class="tab-content">
      <div v-if="!store.activeAgingAnalysis" class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
        <p>请先运行老化分析</p>
        <span>在「环境参数」标签中设置参数并开始分析</span>
      </div>

      <template v-else>
        <div class="timeline-player">
          <div class="player-controls">
            <button class="ctrl-btn" @click="store.setAgingPlaybackDirection('backward')" title="反向播放">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="11 19 2 12 11 5 11 19" />
                <polygon points="22 19 13 12 22 5 22 19" />
              </svg>
            </button>
            <button class="ctrl-btn play-btn" @click="handlePlayPause">
              <svg v-if="!store.agingPlaybackState.isPlaying || store.agingPlaybackState.isPaused" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            </button>
            <button class="ctrl-btn" @click="store.setAgingPlaybackDirection('forward')" title="正向播放">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="13 19 22 12 13 5 13 19" />
                <polygon points="2 19 11 12 2 5 2 19" />
              </svg>
            </button>

            <div class="speed-selector">
              <button
                v-for="s in playbackSpeeds"
                :key="s.value"
                class="speed-btn"
                :class="{ active: store.agingPlaybackState.speed === s.value }"
                @click="store.setAgingPlaybackSpeed(s.value)"
              >
                {{ s.label }}
              </button>
            </div>
          </div>

          <div class="timeline-info">
            <span class="current-phase">
              第 {{ store.agingPlaybackIndex + 1 }} / {{ store.activeAgingAnalysis?.totalSteps }} 阶段
            </span>
            <span v-if="store.currentAgingPoint" class="phase-stats">
              覆盖率 {{ store.currentAgingPoint.result.coverage.toFixed(1) }}%
              · 均匀度 {{ store.currentAgingPoint.result.uniformity.toFixed(1) }}%
              · 风险 {{ store.currentAgingPoint.riskScore.toFixed(0) }}
            </span>
          </div>

          <div class="timeline-slider-wrap">
            <input
              type="range"
              :min="0"
              :max="(store.activeAgingAnalysis?.totalSteps ?? 1) - 1"
              :value="store.agingPlaybackIndex"
              @input="(e: any) => store.jumpToAgingIndex(parseInt(e.target.value))"
              class="timeline-slider"
            />
          </div>
        </div>

        <div class="charts-container">
          <div class="chart-card">
            <VChart class="chart" :option="qualityTrendOption" autoresize />
          </div>
          <div class="chart-card">
            <VChart class="chart" :option="envTrendOption" autoresize />
          </div>
        </div>
      </template>
    </div>

    <div v-show="activeTab === 'analysis'" class="tab-content">
      <div v-if="!store.activeAgingAnalysis" class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <p>请先运行老化分析</p>
      </div>

      <template v-else>
        <div class="quality-summary-card">
          <div class="summary-item">
            <div class="summary-label">整体稳定性</div>
            <div
              class="summary-value"
              :class="{
                'text-green-600': store.activeAgingAnalysis.qualityAnalysis.overallStability >= 70,
                'text-amber-600': store.activeAgingAnalysis.qualityAnalysis.overallStability >= 40 && store.activeAgingAnalysis.qualityAnalysis.overallStability < 70,
                'text-red-600': store.activeAgingAnalysis.qualityAnalysis.overallStability < 40
              }"
            >
              {{ store.activeAgingAnalysis.qualityAnalysis.overallStability }}%
            </div>
          </div>
          <div class="summary-item">
            <div class="summary-label">质量衰减率</div>
            <div
              class="summary-value"
              :class="{
                'text-green-600': store.activeAgingAnalysis.qualityAnalysis.degradationRate <= 0.2,
                'text-amber-600': store.activeAgingAnalysis.qualityAnalysis.degradationRate > 0.2 && store.activeAgingAnalysis.qualityAnalysis.degradationRate <= 0.5,
                'text-red-600': store.activeAgingAnalysis.qualityAnalysis.degradationRate > 0.5
              }"
            >
              {{ store.activeAgingAnalysis.qualityAnalysis.degradationRate.toFixed(2) }}/步
            </div>
          </div>
          <div class="summary-item">
            <div class="summary-label">预估剩余寿命</div>
            <div class="summary-value text-blue-600">
              {{ store.activeAgingAnalysis.qualityAnalysis.estimatedRemainingLife }} 阶段
            </div>
          </div>
        </div>

        <div class="section-block">
          <h4 class="block-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 21V9" />
            </svg>
            关键影响因素
          </h4>
          <div class="factors-list">
            <div
              v-for="(factor, idx) in store.activeAgingAnalysis.qualityAnalysis.keyFactors"
              :key="factor.factor"
              class="factor-item"
            >
              <div class="factor-rank">{{ idx + 1 }}</div>
              <div class="factor-info">
                <div class="factor-name">{{ factor.factor }}</div>
                <div class="factor-desc">{{ factor.description }}</div>
                <div class="factor-bar">
                  <div
                    class="factor-bar-fill"
                    :style="{
                      width: factor.impact + '%',
                      background: idx === 0 ? '#ef4444' : idx === 1 ? '#f59e0b' : idx === 2 ? '#3b82f6' : '#94a3b8'
                    }"
                  ></div>
                </div>
              </div>
              <div class="factor-impact">{{ factor.impact.toFixed(0) }}%</div>
            </div>
          </div>
        </div>

        <div class="section-block">
          <h4 class="block-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            质量阶段划分
          </h4>
          <div class="phases-list">
            <div
              v-for="phase in store.activeAgingAnalysis.qualityAnalysis.qualityPhases"
              :key="phase.name + phase.startIndex"
              class="phase-item"
              :style="{ borderLeftColor: qualityColor(phase.quality) }"
            >
              <div class="phase-header">
                <span class="phase-name" :style="{ color: qualityColor(phase.quality) }">{{ phase.name }}</span>
                <span class="phase-range">第 {{ phase.startIndex + 1 }} - {{ phase.endIndex + 1 }} 阶段</span>
              </div>
              <div class="phase-duration">
                持续 {{ phase.endIndex - phase.startIndex + 1 }} 阶段
              </div>
            </div>
          </div>
        </div>

        <div class="section-block">
          <h4 class="block-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            异常阶段预警 ({{ store.activeAgingAnalysis.abnormalPhases.length }})
          </h4>
          <div v-if="store.activeAgingAnalysis.abnormalPhases.length === 0" class="no-abnormal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            未检测到明显异常阶段
          </div>
          <div v-else class="abnormal-list">
            <div
              v-for="phase in store.activeAgingAnalysis.abnormalPhases"
              :key="phase.id"
              class="abnormal-card"
              :class="[severityStyle[phase.severity].bg, severityStyle[phase.severity].border]"
            >
              <div class="abn-header">
                <span class="abn-type" :class="severityStyle[phase.severity].text">
                  {{ typeLabels[phase.type] }}
                </span>
                <span class="abn-badge" :class="severityStyle[phase.severity].badge">
                  {{ severityLabels[phase.severity] }}
                </span>
              </div>
              <div class="abn-desc">{{ phase.description }}</div>
              <div class="abn-meta">
                阶段: {{ phase.startIndex + 1 }} - {{ phase.endIndex + 1 }}
                · 幅度: {{ phase.magnitude.toFixed(1) }}%
              </div>
              <div class="abn-cause">
                <span class="cause-label">可能原因:</span>
                {{ phase.suspectedCause }}
              </div>
              <button class="abn-jump-btn" @click="handleJumpToPhase(phase)">
                跳转到该阶段
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>

    <div v-show="activeTab === 'suggestions'" class="tab-content">
      <div v-if="!store.activeAgingAnalysis" class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-4" />
          <path d="M9 11V7a3 3 0 0 1 6 0v4" />
          <path d="M9 18v.01" />
          <path d="M12 18v.01" />
          <path d="M15 18v.01" />
        </svg>
        <p>请先运行老化分析</p>
      </div>

      <template v-else>
        <div class="suggestions-header">
          <div class="sug-count">
            共 {{ store.activeAgingAnalysis.maintenanceSuggestions.length }} 条维护建议
          </div>
        </div>

        <div class="suggestions-list">
          <div
            v-for="sug in store.activeAgingAnalysis.maintenanceSuggestions"
            :key="sug.id"
            class="suggestion-card"
            :class="[priorityStyle[sug.priority].bg, priorityStyle[sug.priority].border]"
          >
            <div class="sug-header">
              <span class="sug-category">{{ categoryLabels[sug.category] }}</span>
              <span class="sug-priority" :class="priorityStyle[sug.priority].badge">
                {{ priorityLabels[sug.priority] }}
              </span>
            </div>
            <h4 class="sug-title" :class="priorityStyle[sug.priority].text">
              {{ sug.title }}
            </h4>
            <p class="sug-desc">{{ sug.description }}</p>
            <div class="sug-action">
              <span class="action-label">建议措施:</span>
              {{ sug.suggestedAction }}
            </div>
            <div class="sug-impact">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              预期效果: {{ sug.estimatedImpact }}
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.aging-analysis {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  border: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.analysis-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f1f5f9;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
}

.title-icon {
  width: 18px;
  height: 18px;
  color: #7c3aed;
}

.header-badge {
  padding: 2px 8px;
  background: #f0f9ff;
  color: #0284c7;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.analysis-tabs {
  display: flex;
  gap: 2px;
  padding: 4px;
  background: #f8fafc;
  border-radius: 8px;
  margin-bottom: 14px;
}

.analysis-tab {
  flex: 1;
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.analysis-tab:hover {
  color: #1e293b;
}

.analysis-tab.active {
  background: #fff;
  color: #7c3aed;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}

.tab-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.env-params-section {
  margin-bottom: 16px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  margin: 0;
}

.reset-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: 11px;
  color: #64748b;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.reset-btn:hover {
  background: #ef4444;
  color: #fff;
  border-color: #ef4444;
}

.reset-btn svg {
  width: 12px;
  height: 12px;
}

.env-params-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.env-param-item {
  padding: 10px 12px;
  background: #f8fafc;
  border-radius: 10px;
}

.param-top-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 10px;
  gap: 10px;
}

.param-info {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.param-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.param-icon svg {
  width: 16px;
  height: 16px;
}

.param-text {
  flex: 1;
  min-width: 0;
}

.param-name {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
}

.param-desc {
  font-size: 10.5px;
  color: #94a3b8;
  margin-top: 2px;
}

.param-value-wrap {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.param-input {
  width: 56px;
  padding: 5px 7px;
  font-size: 13px;
  font-weight: 600;
  text-align: right;
  color: #1e293b;
  background: #fff;
  border: 1.5px solid #e2e8f0;
  border-radius: 6px;
  outline: none;
  font-variant-numeric: tabular-nums;
}

.param-input:focus {
  border-color: #7c3aed;
  box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.1);
}

.param-unit {
  font-size: 10px;
  color: #64748b;
  min-width: 20px;
}

.param-slider-wrap {
  position: relative;
  padding: 0 2px;
}

.slider-track {
  position: absolute;
  top: 7px;
  left: 2px;
  right: 2px;
  height: 5px;
  background: #e2e8f0;
  border-radius: 3px;
  pointer-events: none;
  overflow: hidden;
}

.slider-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.15s ease-out;
}

.param-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 18px;
  background: transparent;
  cursor: pointer;
  position: relative;
  z-index: 1;
}

.param-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  background: #fff;
  border: 3px solid var(--slider-color, #7c3aed);
  border-radius: 50%;
  cursor: pointer;
  margin-top: -1px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  transition: transform 0.15s;
}

.param-slider::-webkit-slider-thumb:hover {
  transform: scale(1.1);
}

.param-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: #fff;
  border: 3px solid var(--slider-color, #7c3aed);
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  font-size: 9.5px;
  color: #94a3b8;
  margin-top: 2px;
  padding: 0 2px;
}

.start-section {
  padding: 14px;
  background: linear-gradient(135deg, #f5f3ff, #ede9fe);
  border-radius: 10px;
  border: 1px solid #ddd6fe;
  margin-bottom: 16px;
}

.steps-config {
  margin-bottom: 12px;
}

.steps-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #5b21b6;
  font-weight: 500;
}

.steps-input {
  width: 60px;
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 600;
  color: #4c1d95;
  background: #fff;
  border: 1.5px solid #c4b5fd;
  border-radius: 6px;
  outline: none;
  text-align: center;
}

.steps-hint {
  font-size: 10.5px;
  color: #a78bfa;
}

.start-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, #7c3aed, #5b21b6);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.start-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(124, 58, 237, 0.35);
}

.start-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.start-btn svg {
  width: 16px;
  height: 16px;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.progress-bar {
  position: relative;
  margin-top: 10px;
  height: 20px;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 10px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #7c3aed, #a78bfa);
  border-radius: 10px;
  transition: width 0.3s ease;
}

.progress-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 11px;
  font-weight: 600;
  color: #4c1d95;
}

.history-section {
  margin-bottom: 8px;
}

.analysis-history-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.history-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.history-item:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
}

.history-item.active {
  background: #f5f3ff;
  border-color: #a78bfa;
}

.history-info {
  flex: 1;
  min-width: 0;
}

.history-name {
  font-size: 12.5px;
  font-weight: 600;
  color: #1e293b;
}

.history-item.active .history-name {
  color: #5b21b6;
}

.history-meta {
  font-size: 10.5px;
  color: #94a3b8;
  margin-top: 2px;
}

.delete-btn {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  background: transparent;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.2s;
}

.delete-btn:hover {
  color: #dc2626;
  background: #fef2f2;
}

.delete-btn svg {
  width: 14px;
  height: 14px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: #94a3b8;
  text-align: center;
}

.empty-state svg {
  width: 48px;
  height: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}

.empty-state p {
  font-size: 13px;
  color: #64748b;
  margin: 0 0 4px 0;
}

.empty-state span {
  font-size: 11px;
  color: #94a3b8;
}

.timeline-player {
  padding: 12px;
  background: #f8fafc;
  border-radius: 10px;
  margin-bottom: 14px;
}

.player-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 10px;
}

.ctrl-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  border: 1.5px solid #e2e8f0;
  border-radius: 8px;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s;
}

.ctrl-btn:hover {
  border-color: #7c3aed;
  color: #7c3aed;
}

.ctrl-btn svg {
  width: 14px;
  height: 14px;
}

.play-btn {
  width: 40px;
  height: 40px;
  background: #7c3aed;
  border-color: #7c3aed;
  color: #fff;
}

.play-btn:hover {
  background: #6d28d9;
  border-color: #6d28d9;
  color: #fff;
}

.play-btn svg {
  width: 16px;
  height: 16px;
}

.speed-selector {
  display: flex;
  margin-left: 12px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 2px;
  gap: 2px;
}

.speed-btn {
  padding: 3px 8px;
  font-size: 10px;
  font-weight: 600;
  color: #64748b;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.speed-btn:hover {
  color: #1e293b;
}

.speed-btn.active {
  background: #7c3aed;
  color: #fff;
}

.timeline-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: #64748b;
  margin-bottom: 8px;
}

.current-phase {
  font-weight: 600;
  color: #334155;
}

.phase-stats {
  font-variant-numeric: tabular-nums;
}

.timeline-slider-wrap {
  padding: 0 4px;
}

.timeline-slider {
  width: 100%;
  -webkit-appearance: none;
  appearance: none;
  height: 6px;
  background: #e2e8f0;
  border-radius: 3px;
  cursor: pointer;
}

.timeline-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  background: #fff;
  border: 3px solid #7c3aed;
  border-radius: 50%;
  cursor: pointer;
  margin-top: -6px;
  box-shadow: 0 2px 6px rgba(124, 58, 237, 0.3);
}

.timeline-slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  background: #fff;
  border: 3px solid #7c3aed;
  border-radius: 50%;
  cursor: pointer;
}

.charts-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chart-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px;
  height: 220px;
}

.chart {
  width: 100%;
  height: 100%;
}

.quality-summary-card {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  padding: 14px;
  background: linear-gradient(135deg, #f0fdf4, #ecfdf5);
  border: 1px solid #bbf7d0;
  border-radius: 10px;
  margin-bottom: 14px;
}

.summary-item {
  text-align: center;
}

.summary-label {
  font-size: 11px;
  color: #64748b;
  margin-bottom: 4px;
}

.summary-value {
  font-size: 18px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.text-green-600 { color: #16a34a; }
.text-amber-600 { color: #d97706; }
.text-red-600 { color: #dc2626; }
.text-blue-600 { color: #2563eb; }

.section-block {
  margin-bottom: 16px;
}

.block-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  margin: 0 0 10px 0;
}

.block-title svg {
  width: 14px;
  height: 14px;
  color: #7c3aed;
}

.factors-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.factor-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: #f8fafc;
  border-radius: 8px;
}

.factor-rank {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  background: #94a3b8;
  border-radius: 50%;
  flex-shrink: 0;
}

.factor-item:nth-child(1) .factor-rank { background: #ef4444; }
.factor-item:nth-child(2) .factor-rank { background: #f59e0b; }
.factor-item:nth-child(3) .factor-rank { background: #3b82f6; }

.factor-info {
  flex: 1;
  min-width: 0;
}

.factor-name {
  font-size: 12px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 2px;
}

.factor-desc {
  font-size: 10.5px;
  color: #94a3b8;
  margin-bottom: 4px;
}

.factor-bar {
  height: 4px;
  background: #e2e8f0;
  border-radius: 2px;
  overflow: hidden;
}

.factor-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease;
}

.factor-impact {
  font-size: 12px;
  font-weight: 700;
  color: #334155;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.phases-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.phase-item {
  padding: 8px 12px;
  background: #f8fafc;
  border-left: 3px solid #94a3b8;
  border-radius: 6px;
}

.phase-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 3px;
}

.phase-name {
  font-size: 12px;
  font-weight: 600;
}

.phase-range {
  font-size: 10.5px;
  color: #94a3b8;
}

.phase-duration {
  font-size: 10.5px;
  color: #64748b;
}

.no-abnormal {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 20px;
  color: #10b981;
  background: #f0fdf4;
  border-radius: 8px;
  font-size: 12px;
}

.no-abnormal svg {
  width: 16px;
  height: 16px;
}

.abnormal-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.abnormal-card {
  padding: 12px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
}

.abn-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.abn-type {
  font-size: 13px;
  font-weight: 700;
}

.abn-badge {
  padding: 2px 8px;
  font-size: 10px;
  font-weight: 600;
  color: #fff;
  border-radius: 10px;
}

.abn-desc {
  font-size: 11.5px;
  color: #475569;
  margin-bottom: 6px;
}

.abn-meta {
  font-size: 10.5px;
  color: #64748b;
  margin-bottom: 6px;
}

.abn-cause {
  font-size: 11px;
  color: #475569;
  margin-bottom: 8px;
}

.cause-label {
  font-weight: 600;
  color: #334155;
}

.abn-jump-btn {
  width: 100%;
  padding: 6px;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background: #7c3aed;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
}

.abn-jump-btn:hover {
  background: #6d28d9;
}

.suggestions-header {
  margin-bottom: 12px;
}

.sug-count {
  font-size: 12px;
  color: #64748b;
  font-weight: 500;
}

.suggestions-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.suggestion-card {
  padding: 12px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
}

.sug-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.sug-category {
  font-size: 10.5px;
  padding: 2px 7px;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 10px;
  color: #64748b;
  font-weight: 500;
}

.sug-priority {
  padding: 2px 8px;
  font-size: 10px;
  font-weight: 600;
  color: #fff;
  border-radius: 10px;
}

.sug-title {
  font-size: 13px;
  font-weight: 700;
  margin: 0 0 5px 0;
}

.sug-desc {
  font-size: 11.5px;
  color: #475569;
  margin: 0 0 8px 0;
  line-height: 1.5;
}

.sug-action {
  font-size: 11px;
  color: #334155;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.7);
  border-radius: 6px;
  margin-bottom: 8px;
}

.action-label {
  font-weight: 600;
  margin-right: 4px;
}

.sug-impact {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  color: #64748b;
}

.sug-impact svg {
  width: 12px;
  height: 12px;
  color: #10b981;
}

.bg-blue-50 { background-color: #eff6ff; }
.bg-blue-200 { background-color: #bfdbfe; }
.text-blue-700 { color: #1d4ed8; }
.bg-blue-500 { background-color: #3b82f6; }

.bg-amber-50 { background-color: #fffbeb; }
.bg-amber-200 { background-color: #fde68a; }
.text-amber-700 { color: #b45309; }
.bg-amber-500 { background-color: #f59e0b; }

.bg-red-50 { background-color: #fef2f2; }
.bg-red-200 { background-color: #fecaca; }
.text-red-700 { color: #b91c1c; }
.bg-red-500 { background-color: #ef4444; }

.bg-green-50 { background-color: #f0fdf4; }
.bg-green-200 { background-color: #bbf7d0; }
.text-green-700 { color: #15803d; }
.bg-green-500 { background-color: #22c55e; }

@media (max-width: 768px) {
  .quality-summary-card {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  
  .analysis-tabs {
    flex-wrap: wrap;
  }
  
  .analysis-tab {
    flex: 1 0 40%;
  }
}
</style>
