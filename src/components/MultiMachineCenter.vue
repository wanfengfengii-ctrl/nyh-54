<script setup lang="ts">
import { ref, computed } from 'vue'
import { usePrintStore } from '../stores/printStore'
import type { MachineStatus } from '../types'
import { MACHINE_CAPACITY_RANGES } from '../types'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart, PieChart, RadarChart } from 'echarts/charts'
import {
  TitleComponent, TooltipComponent, LegendComponent,
  GridComponent, DatasetComponent
} from 'echarts/components'

use([
  CanvasRenderer, BarChart, LineChart, PieChart, RadarChart,
  TitleComponent, TooltipComponent, LegendComponent, GridComponent, DatasetComponent
])

const store = usePrintStore()

type SubTab = 'machines' | 'quality' | 'anomaly' | 'comparison' | 'orders' | 'report'
const subTab = ref<SubTab>('machines')
const editingMachineId = ref<string | null>(null)
const newOrderForm = ref({
  name: '',
  totalQuantity: 500,
  requiredCoverage: 60,
  requiredUniformity: 70,
  deadline: Date.now() + 7 * 24 * 3600000,
  priority: 'medium' as 'high' | 'medium' | 'low',
  assignedMachines: [] as string[]
})

const activeResult = computed(() => store.activeMultiSimResult)

const statusLabel: Record<MachineStatus, string> = {
  running: '运行中', idle: '空闲', maintenance: '维护中', warning: '警告', offline: '离线'
}
const statusColor: Record<MachineStatus, string> = {
  running: '#059669', idle: '#64748b', maintenance: '#d97706', warning: '#dc2626', offline: '#94a3b8'
}
const severityLabel = { severe: '严重', moderate: '中等', mild: '轻微' }
const severityColor = { severe: '#dc2626', moderate: '#d97706', mild: '#059669' }
const riskLabel = { low: '低风险', medium: '中等风险', high: '高风险', critical: '极高风险' }
const riskColor = { low: '#059669', medium: '#d97706', high: '#dc2626', critical: '#7c3aed' }
const priorityLabel = { high: '紧急', medium: '重要', low: '一般' }
const gradeColor: Record<string, string> = { A: '#059669', B: '#2563eb', C: '#d97706', D: '#dc2626' }

function addNewMachine() {
  store.addMachine()
}

function removeMachine(id: string) {
  store.deleteMachine(id)
  if (editingMachineId.value === id) editingMachineId.value = null
}

function toggleMachineStatus(id: string) {
  const m = store.machines.find(x => x.id === id)
  if (!m) return
  const cycle: MachineStatus[] = ['idle', 'running', 'warning', 'maintenance', 'offline']
  const idx = cycle.indexOf(m.status)
  store.updateMachine(id, { status: cycle[(idx + 1) % cycle.length] })
}

function addNewOrder() {
  if (!newOrderForm.value.name.trim()) return
  store.addOrder({ ...newOrderForm.value, completedQuantity: 0 })
  newOrderForm.value = {
    name: '', totalQuantity: 500, requiredCoverage: 60, requiredUniformity: 70,
    deadline: Date.now() + 7 * 24 * 3600000, priority: 'medium', assignedMachines: []
  }
}

function toggleMachineAssignment(machineId: string) {
  const idx = newOrderForm.value.assignedMachines.indexOf(machineId)
  if (idx >= 0) newOrderForm.value.assignedMachines.splice(idx, 1)
  else newOrderForm.value.assignedMachines.push(machineId)
}

function removeOrder(id: string) {
  store.deleteOrder(id)
}

async function runSimulation() {
  if (store.machines.length === 0) return
  await store.startMultiMachineSimulation()
  subTab.value = 'quality'
}

function exportReport() {
  if (!activeResult.value) return
  store.downloadMultiMachineReport(activeResult.value)
}

const machineCoverageChart = computed(() => {
  const result = activeResult.value
  if (!result) return {}
  const metrics = result.crossMachineComparison.machineMetrics
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['平均覆盖率', '平均均匀度'], bottom: 0 },
    grid: { left: 50, right: 20, top: 20, bottom: 40 },
    xAxis: { type: 'category', data: metrics.map(m => m.machineName) },
    yAxis: { type: 'value', max: 100 },
    series: [
      { name: '平均覆盖率', type: 'bar', data: metrics.map(m => m.avgCoverage), itemStyle: { color: '#2563eb' } },
      { name: '平均均匀度', type: 'bar', data: metrics.map(m => m.avgUniformity), itemStyle: { color: '#059669' } }
    ]
  }
})

const qualityDistChart = computed(() => {
  const result = activeResult.value
  if (!result) return {}
  const d = result.summary.qualityDistribution
  return {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    series: [{
      type: 'pie', radius: ['35%', '65%'],
      data: [
        { value: d.A, name: 'A级', itemStyle: { color: '#059669' } },
        { value: d.B, name: 'B级', itemStyle: { color: '#2563eb' } },
        { value: d.C, name: 'C级', itemStyle: { color: '#d97706' } },
        { value: d.D, name: 'D级', itemStyle: { color: '#dc2626' } }
      ],
      label: { formatter: '{b}: {c}批 ({d}%)' }
    }]
  }
})

const riskTrendChart = computed(() => {
  const result = activeResult.value
  if (!result || result.batches.length === 0) return {}
  const batches = result.batches.slice(0, 30)
  return {
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0, data: ['覆盖率', '风险评分'] },
    grid: { left: 50, right: 20, top: 20, bottom: 40 },
    xAxis: { type: 'category', data: batches.map((_, i) => `批次${i + 1}`) },
    yAxis: [
      { type: 'value', max: 100, name: '覆盖率%' },
      { type: 'value', max: 100, name: '风险' }
    ],
    series: [
      { name: '覆盖率', type: 'line', data: batches.map(b => b.result.coverage.toFixed(1)), smooth: true, itemStyle: { color: '#2563eb' } },
      { name: '风险评分', type: 'line', yAxisIndex: 1, data: batches.map(b => b.riskScore), smooth: true, itemStyle: { color: '#dc2626' } }
    ]
  }
})

const machineRadarChart = computed(() => {
  const result = activeResult.value
  if (!result || result.crossMachineComparison.machineMetrics.length === 0) return {}
  const metrics = result.crossMachineComparison.machineMetrics
  return {
    tooltip: {},
    legend: { bottom: 0, data: metrics.map(m => m.machineName) },
    radar: {
      indicator: [
        { name: '覆盖率', max: 100 },
        { name: '均匀度', max: 100 },
        { name: '低风险', max: 100 },
        { name: '稳定性', max: 100 },
        { name: '有效产能', max: 100 }
      ]
    },
    series: [{
      type: 'radar',
      data: metrics.map(m => ({
        value: [
          m.avgCoverage,
          m.avgUniformity,
          100 - m.avgRiskScore,
          Math.max(0, 100 - m.coverageStdDev * 3),
          Math.min(100, m.effectiveCapacity)
        ],
        name: m.machineName,
        lineStyle: { color: m.color },
        areaStyle: { color: m.color, opacity: 0.1 }
      }))
    }]
  }
})
</script>

<template>
  <div class="multi-machine-center">
    <div class="mmc-header">
      <h3 class="panel-title">
        <svg class="title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
        多机台协同生产与质量追溯中心
      </h3>
      <div class="header-actions">
        <button class="btn btn-primary" @click="runSimulation" :disabled="store.machines.length === 0 || store.multiSimRunning">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          {{ store.multiSimRunning ? '模拟中...' : '运行模拟' }}
        </button>
        <button class="btn btn-secondary" @click="exportReport" :disabled="!activeResult">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          导出报告
        </button>
      </div>
    </div>

    <div class="sub-tabs">
      <button class="sub-tab" :class="{ active: subTab === 'machines' }" @click="subTab = 'machines'">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><line x1="9" y1="9" x2="13" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/></svg>
        机台管理
        <span class="st-badge" v-if="store.machines.length">{{ store.machines.length }}</span>
      </button>
      <button class="sub-tab" :class="{ active: subTab === 'quality' }" @click="subTab = 'quality'" :disabled="!activeResult">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
        批次质量
      </button>
      <button class="sub-tab" :class="{ active: subTab === 'anomaly' }" @click="subTab = 'anomaly'" :disabled="!activeResult">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        异常溯源
        <span class="st-badge st-badge-warn" v-if="activeResult?.anomalies.length">{{ activeResult.anomalies.length }}</span>
      </button>
      <button class="sub-tab" :class="{ active: subTab === 'comparison' }" @click="subTab = 'comparison'" :disabled="!activeResult">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
        跨机台对比
      </button>
      <button class="sub-tab" :class="{ active: subTab === 'orders' }" @click="subTab = 'orders'">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        订单风险
        <span class="st-badge st-badge-warn" v-if="activeResult?.deliveryRisks.filter(r => r.overallRisk === 'high' || r.overallRisk === 'critical').length">
          {{ activeResult.deliveryRisks.filter(r => r.overallRisk === 'high' || r.overallRisk === 'critical').length }}
        </span>
      </button>
      <button class="sub-tab" :class="{ active: subTab === 'report' }" @click="subTab = 'report'" :disabled="!activeResult">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        优化建议
      </button>
    </div>

    <div class="sub-content">
      <!-- 机台管理 -->
      <div v-if="subTab === 'machines'" class="tab-section">
        <div class="section-bar">
          <span class="section-title">机台列表</span>
          <button class="btn btn-sm btn-primary" @click="addNewMachine">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            添加机台
          </button>
        </div>

        <div v-if="store.machines.length === 0" class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          <p>尚未添加任何机台</p>
          <span>点击"添加机台"开始配置多机台协同生产环境</span>
        </div>

        <div v-else class="machine-grid">
          <div v-for="machine in store.machines" :key="machine.id" class="machine-card">
            <div class="mc-header" :style="{ borderLeftColor: machine.color }">
              <div class="mc-name">{{ machine.name }}</div>
              <div class="mc-status" :style="{ color: statusColor[machine.status], background: statusColor[machine.status] + '15' }">
                {{ statusLabel[machine.status] }}
              </div>
            </div>
            <div class="mc-body">
              <div class="mc-row">
                <span class="mc-label">黏度</span>
                <span class="mc-value">{{ machine.params.viscosity }} cP</span>
              </div>
              <div class="mc-row">
                <span class="mc-label">压力</span>
                <span class="mc-value">{{ machine.params.pressure }} MPa</span>
              </div>
              <div class="mc-row">
                <span class="mc-label">滚动次数</span>
                <span class="mc-value">{{ machine.params.rollingCount }} 次</span>
              </div>
              <div class="mc-row">
                <span class="mc-label">产能</span>
                <span class="mc-value">{{ machine.capacity }} 件/批</span>
              </div>
              <div class="mc-row">
                <span class="mc-label">磨损度</span>
                <span class="mc-value" :style="{ color: machine.rollerWear > 60 ? '#dc2626' : machine.rollerWear > 30 ? '#d97706' : '#059669' }">
                  {{ machine.rollerWear }}%
                </span>
              </div>
              <div class="mc-row">
                <span class="mc-label">温度/湿度</span>
                <span class="mc-value">{{ machine.envParams.temperature }}°C / {{ machine.envParams.humidity }}%</span>
              </div>
            </div>
            <div class="mc-actions">
              <button class="mc-btn" @click="toggleMachineStatus(machine.id)" title="切换状态">状态</button>
              <button class="mc-btn" @click="editingMachineId = editingMachineId === machine.id ? null : machine.id" title="编辑">编辑</button>
              <button class="mc-btn mc-btn-danger" @click="removeMachine(machine.id)" title="删除">删除</button>
            </div>
            <div v-if="editingMachineId === machine.id" class="mc-edit">
              <div class="edit-grid">
                <label>黏度(cP)<input type="number" :value="machine.params.viscosity" min="1" max="100" @input="(e: any) => store.updateMachine(machine.id, { params: { ...machine.params, viscosity: +e.target.value } })"></label>
                <label>压力(MPa)<input type="number" :value="machine.params.pressure" min="1" max="100" @input="(e: any) => store.updateMachine(machine.id, { params: { ...machine.params, pressure: +e.target.value } })"></label>
                <label>滚动次数<input type="number" :value="machine.params.rollingCount" min="1" max="20" @input="(e: any) => store.updateMachine(machine.id, { params: { ...machine.params, rollingCount: +e.target.value } })"></label>
                <label>高度差(μm)<input type="number" :value="machine.params.heightDiff" min="0" max="50" step="0.5" @input="(e: any) => store.updateMachine(machine.id, { params: { ...machine.params, heightDiff: +e.target.value } })"></label>
                <label>产能(件/批)<input type="number" :value="machine.capacity" :min="MACHINE_CAPACITY_RANGES.capacity.min" :max="MACHINE_CAPACITY_RANGES.capacity.max" :step="MACHINE_CAPACITY_RANGES.capacity.step" @input="(e: any) => store.updateMachine(machine.id, { capacity: +e.target.value })"></label>
                <label>磨损度(%)<input type="number" :value="machine.rollerWear" min="0" max="100" step="1" @input="(e: any) => store.updateMachine(machine.id, { rollerWear: +e.target.value, envParams: { ...machine.envParams, rollerWear: +e.target.value } })"></label>
                <label>温度(°C)<input type="number" :value="machine.envParams.temperature" min="10" max="40" step="0.5" @input="(e: any) => store.updateMachine(machine.id, { envParams: { ...machine.envParams, temperature: +e.target.value } })"></label>
                <label>湿度(%)<input type="number" :value="machine.envParams.humidity" min="20" max="90" step="1" @input="(e: any) => store.updateMachine(machine.id, { envParams: { ...machine.envParams, humidity: +e.target.value } })"></label>
              </div>
            </div>
          </div>
        </div>

        <div class="section-bar" style="margin-top: 20px;">
          <span class="section-title">订单管理</span>
          <button class="btn btn-sm btn-primary" @click="subTab = 'orders'">管理订单</button>
        </div>
        <div v-if="store.orders.length > 0" class="order-summary-row">
          <div v-for="order in store.orders" :key="order.id" class="order-chip">
            <span class="oc-dot" :style="{ background: order.priority === 'high' ? '#dc2626' : order.priority === 'medium' ? '#d97706' : '#059669' }"></span>
            {{ order.name }}
            <span class="oc-qty">{{ order.completedQuantity }}/{{ order.totalQuantity }}</span>
          </div>
        </div>
        <div v-else class="empty-hint">暂无订单，点击"管理订单"添加</div>
      </div>

      <!-- 批次质量 -->
      <div v-else-if="subTab === 'quality' && activeResult" class="tab-section">
        <div class="summary-cards">
          <div class="scard">
            <div class="scard-label">总批次数</div>
            <div class="scard-value">{{ activeResult.summary.totalBatches }}</div>
          </div>
          <div class="scard">
            <div class="scard-label">平均覆盖率</div>
            <div class="scard-value">{{ activeResult.summary.avgCoverage.toFixed(1) }}%</div>
          </div>
          <div class="scard">
            <div class="scard-label">平均均匀度</div>
            <div class="scard-value">{{ activeResult.summary.avgUniformity.toFixed(1) }}%</div>
          </div>
          <div class="scard">
            <div class="scard-label">平均风险</div>
            <div class="scard-value" :style="{ color: activeResult.summary.avgRiskScore > 50 ? '#dc2626' : '#059669' }">{{ activeResult.summary.avgRiskScore.toFixed(1) }}</div>
          </div>
        </div>

        <div class="chart-row">
          <div class="chart-box">
            <VChart :option="machineCoverageChart" autoresize style="height: 280px;" />
          </div>
          <div class="chart-box">
            <VChart :option="qualityDistChart" autoresize style="height: 280px;" />
          </div>
        </div>

        <div class="chart-box full">
          <VChart :option="riskTrendChart" autoresize style="height: 260px;" />
        </div>

        <div class="section-bar">
          <span class="section-title">批次明细</span>
        </div>
        <div class="batch-table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>批次</th><th>机台</th><th>覆盖率</th><th>均匀度</th><th>风险</th><th>等级</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="batch in activeResult.batches.slice(0, 20)" :key="batch.batchId">
                <td>{{ batch.sequenceIndex + 1 }}</td>
                <td><span class="machine-dot" :style="{ background: batch.result.templateId ? '#64748b' : '#2563eb' }"></span>{{ batch.machineName }}</td>
                <td>{{ batch.result.coverage.toFixed(1) }}%</td>
                <td>{{ batch.result.uniformity.toFixed(1) }}%</td>
                <td :style="{ color: batch.riskScore > 50 ? '#dc2626' : '#059669' }">{{ batch.riskScore }}</td>
                <td><span class="grade-badge" :style="{ background: gradeColor[batch.qualityGrade] + '18', color: gradeColor[batch.qualityGrade] }">{{ batch.qualityGrade }}</span></td>
              </tr>
            </tbody>
          </table>
          <div v-if="activeResult.batches.length > 20" class="more-hint">显示前20条，共{{ activeResult.batches.length }}条</div>
        </div>
      </div>

      <!-- 异常溯源 -->
      <div v-else-if="subTab === 'anomaly' && activeResult" class="tab-section">
        <div class="summary-cards">
          <div class="scard">
            <div class="scard-label">异常总数</div>
            <div class="scard-value" :style="{ color: activeResult.anomalies.length > 5 ? '#dc2626' : '#059669' }">{{ activeResult.anomalies.length }}</div>
          </div>
          <div class="scard">
            <div class="scard-label">严重</div>
            <div class="scard-value" style="color: #dc2626">{{ activeResult.anomalies.filter(a => a.severity === 'severe').length }}</div>
          </div>
          <div class="scard">
            <div class="scard-label">中等</div>
            <div class="scard-value" style="color: #d97706">{{ activeResult.anomalies.filter(a => a.severity === 'moderate').length }}</div>
          </div>
          <div class="scard">
            <div class="scard-label">轻微</div>
            <div class="scard-value" style="color: #059669">{{ activeResult.anomalies.filter(a => a.severity === 'mild').length }}</div>
          </div>
        </div>

        <div v-if="activeResult.anomalies.length === 0" class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <p>未检测到异常</p>
          <span>所有批次质量表现正常</span>
        </div>

        <div v-else class="anomaly-list">
          <div v-for="anom in activeResult.anomalies" :key="anom.id" class="anomaly-card" :style="{ borderLeftColor: severityColor[anom.severity] }">
            <div class="anom-header">
              <span class="anom-severity" :style="{ background: severityColor[anom.severity] + '18', color: severityColor[anom.severity] }">{{ severityLabel[anom.severity] }}</span>
              <span class="anom-machine">{{ anom.machineName }}</span>
              <span class="anom-type">{{ anom.anomalyType.replace(/_/g, ' ') }}</span>
            </div>
            <div class="anom-desc">{{ anom.description }}</div>
            <div class="anom-detail">
              <div class="anom-row"><span>根因分析</span><span>{{ anom.rootCause }}</span></div>
              <div class="anom-row"><span>偏差值</span><span :style="{ color: anom.deviation > 15 ? '#dc2626' : '#d97706' }">{{ anom.deviation.toFixed(1) }}</span></div>
              <div class="anom-row"><span>置信度</span><span>{{ anom.confidence.toFixed(0) }}%</span></div>
              <div class="anom-row"><span>修复建议</span><span class="fix-text">{{ anom.suggestedFix }}</span></div>
            </div>
          </div>
        </div>
      </div>

      <!-- 跨机台对比 -->
      <div v-else-if="subTab === 'comparison' && activeResult" class="tab-section">
        <div class="cmp-highlight">
          <div class="cmp-box best">
            <div class="cmp-box-label">最优机台</div>
            <div class="cmp-box-name">{{ activeResult.crossMachineComparison.bestMachine.name }}</div>
            <div class="cmp-box-reason">{{ activeResult.crossMachineComparison.bestMachine.reason }}</div>
          </div>
          <div class="cmp-box worst">
            <div class="cmp-box-label">最差机台</div>
            <div class="cmp-box-name">{{ activeResult.crossMachineComparison.worstMachine.name }}</div>
            <div class="cmp-box-reason">{{ activeResult.crossMachineComparison.worstMachine.reason }}</div>
          </div>
        </div>

        <div class="chart-box full">
          <VChart :option="machineRadarChart" autoresize style="height: 320px;" />
        </div>

        <div class="section-bar"><span class="section-title">机台指标对比</span></div>
        <div class="metric-table-wrap">
          <table class="data-table">
            <thead>
              <tr><th>机台</th><th>平均覆盖率</th><th>平均均匀度</th><th>平均风险</th><th>覆盖率标准差</th><th>异常数</th><th>有效产能</th></tr>
            </thead>
            <tbody>
              <tr v-for="m in activeResult.crossMachineComparison.machineMetrics" :key="m.machineId">
                <td><span class="machine-dot" :style="{ background: m.color }"></span>{{ m.machineName }}</td>
                <td>{{ m.avgCoverage.toFixed(1) }}%</td>
                <td>{{ m.avgUniformity.toFixed(1) }}%</td>
                <td :style="{ color: m.avgRiskScore > 50 ? '#dc2626' : '#059669' }">{{ m.avgRiskScore.toFixed(1) }}</td>
                <td>{{ m.coverageStdDev.toFixed(1) }}</td>
                <td :style="{ color: m.anomalyCount > 2 ? '#dc2626' : m.anomalyCount > 0 ? '#d97706' : '#059669' }">{{ m.anomalyCount }}</td>
                <td>{{ m.effectiveCapacity }} 件/批</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="activeResult.crossMachineComparison.insights.length > 0" class="insight-list">
          <div class="section-bar"><span class="section-title">洞察</span></div>
          <div v-for="(insight, i) in activeResult.crossMachineComparison.insights" :key="i" class="insight-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            {{ insight }}
          </div>
        </div>
      </div>

      <!-- 订单风险 -->
      <div v-else-if="subTab === 'orders'" class="tab-section">
        <div class="order-form">
          <div class="form-title">新建订单</div>
          <div class="form-grid">
            <label>订单名称<input v-model="newOrderForm.name" type="text" placeholder="例：高档画册印刷"></label>
            <label>总数量<input v-model.number="newOrderForm.totalQuantity" type="number" min="1"></label>
            <label>要求覆盖率(%)<input v-model.number="newOrderForm.requiredCoverage" type="number" min="0" max="100"></label>
            <label>要求均匀度(%)<input v-model.number="newOrderForm.requiredUniformity" type="number" min="0" max="100"></label>
            <label>优先级
              <select v-model="newOrderForm.priority">
                <option value="high">高</option>
                <option value="medium">中</option>
                <option value="low">低</option>
              </select>
            </label>
            <label>截止日期<input type="date" :value="new Date(newOrderForm.deadline).toISOString().slice(0, 10)" @input="(e: any) => newOrderForm.deadline = new Date(e.target.value).getTime()"></label>
          </div>
          <div v-if="store.machines.length > 0" class="machine-assign">
            <span class="assign-label">分配机台：</span>
            <button v-for="m in store.machines" :key="m.id" class="assign-chip" :class="{ selected: newOrderForm.assignedMachines.includes(m.id) }" @click="toggleMachineAssignment(m.id)">
              <span class="ac-dot" :style="{ background: m.color }"></span>{{ m.name }}
            </button>
          </div>
          <button class="btn btn-sm btn-primary" @click="addNewOrder" :disabled="!newOrderForm.name.trim()">添加订单</button>
        </div>

        <div v-if="store.orders.length > 0" class="order-list">
          <div class="section-bar"><span class="section-title">已有订单</span></div>
          <div v-for="order in store.orders" :key="order.id" class="order-card">
            <div class="oc-top">
              <div class="oc-info">
                <span class="oc-priority" :style="{ background: order.priority === 'high' ? '#dc262618' : order.priority === 'medium' ? '#d9770618' : '#05966918', color: order.priority === 'high' ? '#dc2626' : order.priority === 'medium' ? '#d97706' : '#059669' }">{{ order.priority === 'high' ? '高' : order.priority === 'medium' ? '中' : '低' }}</span>
                <span class="oc-name">{{ order.name }}</span>
              </div>
              <button class="mc-btn mc-btn-danger" @click="removeOrder(order.id)">删除</button>
            </div>
            <div class="oc-meta">
              <span>数量：{{ order.completedQuantity }}/{{ order.totalQuantity }}</span>
              <span>要求：覆盖≥{{ order.requiredCoverage }}% 均匀≥{{ order.requiredUniformity }}%</span>
              <span>截止：{{ new Date(order.deadline).toLocaleDateString() }}</span>
              <span>分配：{{ order.assignedMachines.length }}台</span>
            </div>
          </div>
        </div>

        <div v-if="activeResult && activeResult.deliveryRisks.length > 0" class="delivery-risks">
          <div class="section-bar"><span class="section-title">交付风险预警</span></div>
          <div v-for="risk in activeResult.deliveryRisks" :key="risk.orderId" class="risk-card" :style="{ borderLeftColor: riskColor[risk.overallRisk] }">
            <div class="risk-header">
              <span class="risk-badge" :style="{ background: riskColor[risk.overallRisk] + '18', color: riskColor[risk.overallRisk] }">{{ riskLabel[risk.overallRisk] }}</span>
              <span class="risk-name">{{ risk.orderName }}</span>
              <span class="risk-score">评分 {{ risk.riskScore }}</span>
            </div>
            <div class="risk-progress">
              <div class="progress-bar">
                <div class="progress-fill" :style="{ width: risk.progressPercent + '%', background: riskColor[risk.overallRisk] }"></div>
              </div>
              <span>进度 {{ risk.progressPercent }}% · 按时概率 {{ risk.onTimeProbability }}%</span>
            </div>
            <div v-if="risk.riskFactors.length > 0" class="risk-factors">
              <div v-for="(rf, i) in risk.riskFactors" :key="i" class="rf-item">
                <span class="rf-name">{{ rf.factor }}</span>
                <span class="rf-desc">{{ rf.description }}</span>
                <span class="rf-mit">缓解：{{ rf.mitigation }}</span>
              </div>
            </div>
            <div v-if="risk.recommendations.length > 0" class="risk-recs">
              <div v-for="(rec, i) in risk.recommendations" :key="i" class="rr-item">→ {{ rec }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 优化建议与维护排程 -->
      <div v-else-if="subTab === 'report' && activeResult" class="tab-section">
        <div class="section-bar"><span class="section-title">生产优化建议</span></div>
        <div v-if="activeResult.optimizations.length === 0" class="empty-hint">暂无优化建议</div>
        <div v-else class="opt-list">
          <div v-for="opt in activeResult.optimizations" :key="opt.id" class="opt-card">
            <div class="opt-header">
              <span class="opt-pri" :style="{ background: opt.priority === 'high' ? '#dc262618' : opt.priority === 'medium' ? '#d9770618' : '#05966918', color: opt.priority === 'high' ? '#dc2626' : opt.priority === 'medium' ? '#d97706' : '#059669' }">{{ priorityLabel[opt.priority] }}</span>
              <span class="opt-cat">{{ opt.category }}</span>
              <span class="opt-title">{{ opt.title }}</span>
            </div>
            <div class="opt-body">{{ opt.description }}</div>
            <div class="opt-meta">
              <div class="opt-row"><span>当前状态</span><span>{{ opt.currentStatus }}</span></div>
              <div class="opt-row"><span>建议变更</span><span>{{ opt.suggestedChange }}</span></div>
              <div class="opt-row"><span>预期效果</span><span class="fix-text">{{ opt.expectedImprovement }}</span></div>
              <div class="opt-row"><span>工作量</span><span>{{ opt.effortLevel === 'high' ? '大' : opt.effortLevel === 'medium' ? '中' : '小' }}</span></div>
            </div>
          </div>
        </div>

        <div class="section-bar" style="margin-top: 20px;"><span class="section-title">维护排程方案</span></div>
        <div v-if="activeResult.maintenanceSchedule.length === 0" class="empty-hint">暂无维护计划</div>
        <div v-else class="maint-timeline">
          <div v-for="item in activeResult.maintenanceSchedule" :key="item.id" class="maint-item" :style="{ borderLeftColor: item.type === 'emergency' ? '#dc2626' : item.type === 'corrective' ? '#d97706' : '#059669' }">
            <div class="maint-header">
              <span class="maint-type" :style="{ background: item.type === 'emergency' ? '#dc262618' : item.type === 'corrective' ? '#d9770618' : '#05966918', color: item.type === 'emergency' ? '#dc2626' : item.type === 'corrective' ? '#d97706' : '#059669' }">
                {{ item.type === 'emergency' ? '紧急' : item.type === 'corrective' ? '纠正' : '预防' }}
              </span>
              <span class="maint-machine">{{ item.machineName }}</span>
              <span class="maint-title">{{ item.title }}</span>
            </div>
            <div class="maint-meta">
              <span>建议时间：{{ new Date(item.suggestedTime).toLocaleString('zh-CN') }}</span>
              <span>预计工时：{{ item.estimatedDuration }}小时</span>
              <span>原因：{{ item.reason }}</span>
            </div>
            <div v-if="item.impactIfDelayed" class="maint-impact">延迟影响：{{ item.impactIfDelayed }}</div>
            <div v-if="item.parts && item.parts.length > 0" class="maint-parts">所需配件：{{ item.parts.join('、') }}</div>
          </div>
        </div>
      </div>

      <div v-else class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
        <p>请先运行多机台模拟</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.multi-machine-center { background: #fff; border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
.mmc-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid #f1f5f9; }
.panel-title { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 16px; font-weight: 600; color: #1e293b; }
.title-icon { width: 18px; height: 18px; color: #7c3aed; }
.header-actions { display: flex; gap: 8px; }
.btn { display: inline-flex; align-items: center; gap: 5px; padding: 8px 14px; font-size: 13px; font-weight: 500; border-radius: 6px; border: none; cursor: pointer; transition: all 0.15s; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn svg { width: 14px; height: 14px; }
.btn-primary { background: #2563eb; color: #fff; }
.btn-primary:hover:not(:disabled) { background: #1d4ed8; }
.btn-secondary { background: #f1f5f9; color: #475569; }
.btn-secondary:hover:not(:disabled) { background: #e2e8f0; }
.btn-sm { padding: 5px 10px; font-size: 12px; }
.sub-tabs { display: flex; gap: 2px; padding: 4px; background: #f1f5f9; border-radius: 10px; margin-bottom: 16px; overflow-x: auto; flex-wrap: nowrap; }
.sub-tab { display: inline-flex; align-items: center; gap: 5px; padding: 7px 12px; font-size: 12px; font-weight: 600; color: #64748b; background: transparent; border: none; border-radius: 7px; cursor: pointer; transition: all 0.18s; white-space: nowrap; }
.sub-tab svg { width: 13px; height: 13px; flex-shrink: 0; }
.sub-tab:hover:not(:disabled) { color: #1e293b; background: #e2e8f0; }
.sub-tab.active { background: #fff; color: #2563eb; box-shadow: 0 1px 3px rgba(15,23,42,0.06); }
.sub-tab:disabled { opacity: 0.4; cursor: not-allowed; }
.st-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 16px; height: 16px; padding: 0 4px; background: #dbeafe; color: #1d4ed8; border-radius: 8px; font-size: 10px; font-weight: 700; }
.st-badge-warn { background: #fef3c7; color: #92400e; }
.section-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.section-title { font-size: 13px; font-weight: 600; color: #1e293b; }
.empty-state { display: flex; flex-direction: column; align-items: center; padding: 40px 20px; color: #94a3b8; text-align: center; }
.empty-state svg { width: 40px; height: 40px; margin-bottom: 10px; opacity: 0.5; }
.empty-state p { font-size: 14px; color: #64748b; margin: 0 0 4px; }
.empty-state span { font-size: 12px; }
.empty-hint { text-align: center; padding: 20px; color: #94a3b8; font-size: 12px; background: #f8fafc; border-radius: 8px; border: 1px dashed #e2e8f0; }
.machine-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.machine-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; transition: box-shadow 0.2s; }
.machine-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.mc-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: #fff; border-left: 3px solid; border-bottom: 1px solid #f1f5f9; }
.mc-name { font-size: 13px; font-weight: 600; color: #1e293b; }
.mc-status { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; }
.mc-body { padding: 10px 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; }
.mc-row { display: flex; justify-content: space-between; }
.mc-label { font-size: 11px; color: #64748b; }
.mc-value { font-size: 11px; color: #1e293b; font-weight: 500; }
.mc-actions { display: flex; gap: 4px; padding: 8px 12px; border-top: 1px solid #f1f5f9; }
.mc-btn { padding: 4px 10px; font-size: 11px; font-weight: 500; color: #475569; background: #fff; border: 1px solid #e2e8f0; border-radius: 5px; cursor: pointer; transition: all 0.15s; }
.mc-btn:hover { background: #f1f5f9; }
.mc-btn-danger:hover { background: #fee2e2; color: #dc2626; border-color: #fecaca; }
.mc-edit { padding: 10px 12px; border-top: 1px solid #e2e8f0; background: #fff; }
.edit-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.edit-grid label { display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: #64748b; font-weight: 500; }
.edit-grid input, .edit-grid select { padding: 5px 7px; font-size: 12px; color: #1e293b; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 5px; outline: none; }
.edit-grid input:focus { border-color: #2563eb; }
.summary-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
.scard { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; }
.scard-label { font-size: 11px; color: #64748b; margin-bottom: 4px; }
.scard-value { font-size: 20px; font-weight: 700; color: #1e293b; }
.chart-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
.chart-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; }
.chart-box.full { margin-bottom: 16px; }
.batch-table-wrap { overflow-x: auto; }
.data-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.data-table th { background: #f1f5f9; padding: 8px 10px; text-align: left; font-weight: 600; color: #475569; border-bottom: 1px solid #e2e8f0; white-space: nowrap; }
.data-table td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; color: #1e293b; }
.data-table tr:hover td { background: #f8fafc; }
.more-hint { text-align: center; padding: 8px; font-size: 11px; color: #94a3b8; }
.machine-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; vertical-align: middle; }
.grade-badge { display: inline-block; padding: 1px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; }
.anomaly-list { display: flex; flex-direction: column; gap: 10px; }
.anomaly-card { background: #f8fafc; border: 1px solid #e2e8f0; border-left: 3px solid; border-radius: 8px; padding: 12px; }
.anom-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.anom-severity { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.anom-machine { font-size: 13px; font-weight: 600; color: #1e293b; }
.anom-type { font-size: 11px; color: #64748b; }
.anom-desc { font-size: 12px; color: #334155; margin-bottom: 8px; }
.anom-detail { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; }
.anom-row { display: flex; justify-content: space-between; font-size: 11px; }
.anom-row span:first-child { color: #64748b; }
.anom-row span:last-child { color: #1e293b; font-weight: 500; }
.fix-text { color: #2563eb !important; }
.cmp-highlight { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
.cmp-box { padding: 14px; border-radius: 8px; }
.cmp-box.best { background: #ecfdf5; border: 1px solid #a7f3d0; }
.cmp-box.worst { background: #fef2f2; border: 1px solid #fecaca; }
.cmp-box-label { font-size: 11px; color: #64748b; margin-bottom: 4px; }
.cmp-box-name { font-size: 16px; font-weight: 700; margin-bottom: 2px; }
.best .cmp-box-name { color: #059669; }
.worst .cmp-box-name { color: #dc2626; }
.cmp-box-reason { font-size: 11px; color: #64748b; }
.metric-table-wrap { overflow-x: auto; margin-bottom: 16px; }
.insight-list { margin-top: 12px; }
.insight-item { display: flex; align-items: flex-start; gap: 6px; padding: 8px 10px; font-size: 12px; color: #334155; background: #eff6ff; border-radius: 6px; margin-bottom: 6px; }
.insight-item svg { width: 14px; height: 14px; color: #2563eb; flex-shrink: 0; margin-top: 1px; }
.order-form { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; margin-bottom: 16px; }
.form-title { font-size: 13px; font-weight: 600; color: #1e293b; margin-bottom: 10px; }
.form-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 10px; }
.form-grid label { display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: #64748b; font-weight: 500; }
.form-grid input, .form-grid select { padding: 6px 8px; font-size: 13px; color: #1e293b; background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; outline: none; }
.form-grid input:focus, .form-grid select:focus { border-color: #2563eb; }
.machine-assign { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.assign-label { font-size: 11px; color: #64748b; font-weight: 500; }
.assign-chip { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; font-size: 11px; color: #475569; background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; cursor: pointer; transition: all 0.15s; }
.assign-chip.selected { background: #eff6ff; border-color: #93c5fd; color: #1d4ed8; }
.ac-dot { width: 8px; height: 8px; border-radius: 50%; }
.order-list { margin-top: 4px; }
.order-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; }
.oc-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.oc-info { display: flex; align-items: center; gap: 6px; }
.oc-priority { padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; }
.oc-name { font-size: 13px; font-weight: 600; color: #1e293b; }
.oc-meta { display: flex; gap: 12px; font-size: 11px; color: #64748b; flex-wrap: wrap; }
.order-summary-row { display: flex; gap: 6px; flex-wrap: wrap; }
.order-chip { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; font-size: 11px; color: #475569; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; }
.oc-dot { width: 6px; height: 6px; border-radius: 50%; }
.oc-qty { font-weight: 600; color: #1e293b; }
.delivery-risks { margin-top: 16px; }
.risk-card { background: #f8fafc; border: 1px solid #e2e8f0; border-left: 3px solid; border-radius: 8px; padding: 12px; margin-bottom: 10px; }
.risk-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.risk-badge { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.risk-name { font-size: 13px; font-weight: 600; color: #1e293b; }
.risk-score { font-size: 11px; color: #64748b; margin-left: auto; }
.risk-progress { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 11px; color: #64748b; }
.progress-bar { flex: 1; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden; }
.progress-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
.risk-factors { margin-bottom: 6px; }
.rf-item { padding: 4px 0; font-size: 11px; }
.rf-name { font-weight: 600; color: #1e293b; margin-right: 6px; }
.rf-desc { color: #475569; }
.rf-mit { display: block; color: #2563eb; margin-top: 2px; }
.risk-recs { padding-top: 6px; border-top: 1px solid #f1f5f9; }
.rr-item { font-size: 11px; color: #475569; padding: 2px 0; }
.opt-list { display: flex; flex-direction: column; gap: 10px; }
.opt-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
.opt-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.opt-pri { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.opt-cat { font-size: 11px; color: #64748b; background: #f1f5f9; padding: 1px 6px; border-radius: 3px; }
.opt-title { font-size: 13px; font-weight: 600; color: #1e293b; }
.opt-body { font-size: 12px; color: #475569; margin-bottom: 8px; }
.opt-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; }
.opt-row { display: flex; justify-content: space-between; font-size: 11px; }
.opt-row span:first-child { color: #64748b; }
.opt-row span:last-child { color: #1e293b; font-weight: 500; }
.maint-timeline { display: flex; flex-direction: column; gap: 10px; }
.maint-item { background: #f8fafc; border: 1px solid #e2e8f0; border-left: 3px solid; border-radius: 8px; padding: 12px; }
.maint-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.maint-type { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.maint-machine { font-size: 13px; font-weight: 600; color: #1e293b; }
.maint-title { font-size: 12px; color: #475569; }
.maint-meta { display: flex; gap: 16px; font-size: 11px; color: #64748b; flex-wrap: wrap; }
.maint-impact { font-size: 11px; color: #dc2626; margin-top: 4px; }
.maint-parts { font-size: 11px; color: #475569; margin-top: 2px; }
@media (max-width: 900px) {
  .summary-cards { grid-template-columns: repeat(2, 1fr); }
  .chart-row { grid-template-columns: 1fr; }
  .cmp-highlight { grid-template-columns: 1fr; }
  .form-grid { grid-template-columns: 1fr 1fr; }
  .machine-grid { grid-template-columns: 1fr; }
}
</style>
