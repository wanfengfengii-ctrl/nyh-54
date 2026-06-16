<script setup lang="ts">
import { computed } from 'vue'
import { usePrintStore } from '../stores/printStore'
import InkCanvas from './InkCanvas.vue'
import type { SavedScheme } from '../types'

const store = usePrintStore()

const compareList = computed<{ name: string; result: any; params: any }[]>(() => {
  const list: { name: string; result: any; params: any }[] = []
  
  if (store.currentResult) {
    list.push({
      name: '当前方案',
      result: store.currentResult,
      params: store.params
    })
  }
  
  store.compareSchemeData.forEach((scheme: SavedScheme) => {
    list.push({
      name: scheme.name,
      result: scheme.result,
      params: scheme.params
    })
  })
  
  return list
})

function getCoverageColor(coverage: number): string {
  if (coverage < 30 || coverage > 95) return '#dc2626'
  if (coverage < 50 || coverage > 85) return '#d97706'
  return '#059669'
}

function getUniformityColor(uniformity: number): string {
  if (uniformity < 50) return '#dc2626'
  if (uniformity < 70) return '#d97706'
  return '#059669'
}
</script>

<template>
  <div v-if="compareList.length >= 2" class="compare-view">
    <div class="compare-header">
      <h3 class="compare-title">
        <svg class="title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
        方案对比视图
        <span class="badge">{{ compareList.length }} 个方案</span>
      </h3>
    </div>

    <div class="compare-grid" :style="{ gridTemplateColumns: `repeat(${Math.min(compareList.length, 4)}, 1fr)` }">
      <div v-for="(item, idx) in compareList" :key="idx" class="compare-card">
        <div class="compare-card-header">
          <div class="scheme-index" :style="{ background: idx === 0 ? '#2563eb' : `hsl(${idx * 70}, 70%, 45%)` }">
            {{ idx + 1 }}
          </div>
          <div class="scheme-info">
            <div class="scheme-name">{{ item.name }}</div>
            <div class="scheme-params-mini">
              黏{{ item.params.viscosity }} · 压{{ item.params.pressure }} · 滚{{ item.params.rollingCount }}
              <span v-if="item.params.heightDiff > 0"> · 差{{ item.params.heightDiff }}</span>
            </div>
          </div>
        </div>
        <div class="mini-canvas-wrapper">
          <InkCanvas :result="item.result" :show-legend="false" />
        </div>
        <div class="compare-metrics">
          <div class="metric-cell">
            <span class="metric-label">覆盖率</span>
            <span class="metric-value" :style="{ color: getCoverageColor(item.result.coverage) }">
              {{ item.result.coverage.toFixed(1) }}%
            </span>
          </div>
          <div class="metric-cell">
            <span class="metric-label">均匀度</span>
            <span class="metric-value" :style="{ color: getUniformityColor(item.result.uniformity) }">
              {{ item.result.uniformity.toFixed(1) }}%
            </span>
          </div>
          <div class="metric-cell">
            <span class="metric-label">墨厚</span>
            <span class="metric-value">{{ (item.result.averageThickness * 100).toFixed(1) }}%</span>
          </div>
        </div>
        <div class="risk-summary">
          <template v-for="(alert, alertIdx) in item.result.riskAlerts.slice(0, 2)" :key="alertIdx">
            <span class="risk-tag" :class="alert.type">
              <span class="dot"></span>
              {{ alert.title }}
            </span>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.compare-view {
  margin-top: 8px;
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  border: 1px solid #e2e8f0;
}

.compare-header {
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f1f5f9;
}

.compare-title {
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

.badge {
  padding: 2px 10px;
  font-size: 11px;
  font-weight: 500;
  color: #7c3aed;
  background: #f5f3ff;
  border-radius: 20px;
  margin-left: 4px;
}

.compare-grid {
  display: grid;
  gap: 14px;
}

.compare-card {
  background: #fafafa;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.compare-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.scheme-index {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.scheme-info {
  flex: 1;
  min-width: 0;
}

.scheme-name {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.scheme-params-mini {
  font-size: 10px;
  color: #94a3b8;
  margin-top: 2px;
}

.mini-canvas-wrapper {
  display: flex;
  justify-content: center;
  transform: scale(0.45);
  transform-origin: top center;
  height: 220px;
  margin: -30px 0 -40px 0;
  overflow: hidden;
}

.compare-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  padding-top: 6px;
  border-top: 1px dashed #e2e8f0;
}

.metric-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 4px;
  background: #fff;
  border-radius: 6px;
}

.metric-label {
  font-size: 10px;
  color: #94a3b8;
}

.metric-value {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  font-variant-numeric: tabular-nums;
}

.risk-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.risk-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 7px;
  font-size: 10px;
  border-radius: 4px;
  font-weight: 500;
}

.risk-tag .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.risk-tag.success {
  background: #ecfdf5;
  color: #059669;
}
.risk-tag.success .dot { background: #10b981; }

.risk-tag.info {
  background: #f0f9ff;
  color: #0284c7;
}
.risk-tag.info .dot { background: #0ea5e9; }

.risk-tag.warning {
  background: #fffbeb;
  color: #d97706;
}
.risk-tag.warning .dot { background: #f59e0b; }

.risk-tag.danger {
  background: #fef2f2;
  color: #dc2626;
}
.risk-tag.danger .dot { background: #ef4444; }
</style>
