<script setup lang="ts">
import { computed, ref } from 'vue'
import { usePrintStore } from '../stores/printStore'
import type { RiskAlert, DetailedRiskAnalysis } from '../types'

const store = usePrintStore()

const alerts = computed(() => store.currentResult?.riskAlerts ?? [])
const showAdvanced = ref(false)

const typeStyles: Record<RiskAlert['type'], { bg: string; border: string; text: string; icon: string; badge: string }> = {
  success: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-700',
    icon: '#10b981',
    badge: 'bg-emerald-500'
  },
  info: {
    bg: 'bg-sky-50',
    border: 'border-sky-200',
    text: 'text-sky-700',
    icon: '#0ea5e9',
    badge: 'bg-sky-500'
  },
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    icon: '#f59e0b',
    badge: 'bg-amber-500'
  },
  danger: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    icon: '#ef4444',
    badge: 'bg-red-500'
  }
}

const levelLabels = ['优秀', '提示', '警告', '严重']

interface RiskDim {
  key: string;
  label: string;
  desc: string;
  color: string;
}

const RISK_DIMENSIONS: RiskDim[] = [
  { key: 'coverageRisk', label: '覆盖率风险', desc: '整体油墨覆盖率偏离最优区间', color: '#2563eb' },
  { key: 'uniformityRisk', label: '均匀度风险', desc: '油墨分布方差过大', color: '#059669' },
  { key: 'smearingRisk', label: '糊版风险', desc: '局部墨层过厚可能产生晕染', color: '#dc2626' },
  { key: 'missingInkRisk', label: '缺墨风险', desc: '局部墨层过薄出现白点', color: '#7c3aed' },
  { key: 'heightDifferenceRisk', label: '高度差风险', desc: '字模高度与参数匹配度', color: '#d97706' },
  { key: 'parameterCompatibilityRisk', label: '参数兼容风险', desc: '多参数组合的协同效应', color: '#0891b2' }
]

const detailedAnalysis = computed<DetailedRiskAnalysis | null>(() => {
  if (!store.currentResult) return null
  return store.generateReportFromResult()
})

function riskLevelClass(score: number): string {
  if (score <= 15) return 'low'
  if (score <= 40) return 'medium'
  if (score <= 65) return 'high'
  return 'critical'
}

function riskLevelText(score: number): string {
  if (score <= 15) return '低'
  if (score <= 40) return '中'
  if (score <= 65) return '高'
  return '极高'
}

const regionalTypeStyle: Record<string, { bg: string; text: string; border: string }> = {
  smearing: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  missing_ink: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  uniformity: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  coverage: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200' }
}

const regionalTypeLabel: Record<string, string> = {
  smearing: '糊版区',
  missing_ink: '缺墨区',
  uniformity: '不均区',
  coverage: '覆盖率'
}
</script>

<template>
  <div class="risk-alerts">
    <div class="alerts-header">
      <h3 class="alerts-title">
        <svg class="title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        风险分析
      </h3>
      <div class="header-actions">
        <button
          v-if="detailedAnalysis"
          class="toggle-advanced"
          :class="{ active: showAdvanced }"
          @click="showAdvanced = !showAdvanced"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 7h7m-7 5h5m-5 5h-2m-10-8a2 2 0 0 1 2-2h1.5l.5-1h8l.5 1H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          </svg>
          {{ showAdvanced ? '精简' : '详细' }}
        </button>
        <div v-if="alerts.length" class="alerts-count">
          <span class="count-badge" :class="alerts.some(a => a.level >= 3) ? 'bg-red-500' : alerts.some(a => a.level >= 2) ? 'bg-amber-500' : 'bg-emerald-500'">
            {{ alerts.length }}
          </span>
          项
        </div>
      </div>
    </div>

    <div v-if="!alerts.length" class="alerts-empty">
      <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="10" />
        <path d="M8 14s1.5 2 4 2 4-2 4-2" />
        <line x1="9" y1="9" x2="9.01" y2="9" />
        <line x1="15" y1="9" x2="15.01" y2="9" />
      </svg>
      <p>暂无模拟结果，请调整参数</p>
    </div>

    <template v-else>
      <div v-if="showAdvanced && detailedAnalysis" class="advanced-section">
        <div class="overall-score-card" :class="riskLevelClass(detailedAnalysis.overallRiskScore)">
          <div class="osc-left">
            <div class="osc-label">综合风险评分</div>
            <div class="osc-value">
              {{ detailedAnalysis.overallRiskScore.toFixed(0) }}
              <small>/100</small>
            </div>
            <div class="osc-level">{{ riskLevelText(detailedAnalysis.overallRiskScore) }}</div>
          </div>
          <div class="osc-gauge">
            <div class="gauge-track">
              <div
                class="gauge-fill"
                :style="{ width: `${detailedAnalysis.overallRiskScore}%` }"
              ></div>
            </div>
            <div class="gauge-marks">
              <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
            </div>
          </div>
        </div>

        <div class="dim-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18" />
            <path d="M9 21V9" />
          </svg>
          风险维度拆解（6维）
        </div>
        <div class="dims-grid">
          <div
            v-for="dim in RISK_DIMENSIONS"
            :key="dim.key"
            class="dim-card"
            :class="riskLevelClass((detailedAnalysis.riskBreakdown as any)[dim.key]?.score ?? 0)"
          >
            <div class="dim-head">
              <div class="dim-color" :style="{ background: dim.color }"></div>
              <div class="dim-info">
                <div class="dim-name">{{ dim.label }}</div>
                <div class="dim-desc">{{ dim.desc }}</div>
              </div>
              <div class="dim-score">
                {{ ((detailedAnalysis.riskBreakdown as any)[dim.key]?.score ?? 0).toFixed(0) }}
              </div>
            </div>
            <div class="dim-bar">
              <div
                class="dim-bar-fill"
                :style="{
                  width: `${(detailedAnalysis.riskBreakdown as any)[dim.key]?.score ?? 0}%`,
                  background: dim.color
                }"
              ></div>
            </div>
            <div class="dim-level">
              <span class="level-tag">
                风险：{{ riskLevelText((detailedAnalysis.riskBreakdown as any)[dim.key]?.score ?? 0) }}
              </span>
              <span class="dim-suggest" v-if="(detailedAnalysis.riskBreakdown as any)[dim.key]?.recommendation">
                💡 {{ (detailedAnalysis.riskBreakdown as any)[dim.key].recommendation }}
              </span>
            </div>
          </div>
        </div>

        <div v-if="detailedAnalysis.regionalRisks && detailedAnalysis.regionalRisks.length > 0" class="regional-section">
          <div class="section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="6" />
              <circle cx="12" cy="12" r="2" />
            </svg>
            区域风险检测（{{ detailedAnalysis.regionalRisks.length }}处异常）
          </div>
          <div class="regional-grid">
            <div
              v-for="(r, _ri) in detailedAnalysis.regionalRisks.slice(0, 8)"
              :key="r.id"
              class="regional-card"
              :class="[regionalTypeStyle[r.riskType].bg, regionalTypeStyle[r.riskType].border]"
            >
              <div class="reg-head">
                <span class="reg-type" :class="regionalTypeStyle[r.riskType].text">
                  {{ regionalTypeLabel[r.riskType] }}
                </span>
                <span class="reg-severity" :class="regionalTypeStyle[r.riskType].text">
                  {{ r.severity.toFixed(0) }}%
                </span>
              </div>
              <div class="reg-name">{{ r.regionName }}</div>
              <div class="reg-desc">{{ r.description }}</div>
            </div>
          </div>
          <div v-if="detailedAnalysis.regionalRisks.length > 8" class="reg-more">
            ... 还有 {{ detailedAnalysis.regionalRisks.length - 8 }} 处异常区域
          </div>
        </div>

        <div v-if="detailedAnalysis.suggestions && detailedAnalysis.suggestions.length > 0" class="suggestions-section">
          <div class="section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-4" />
              <path d="M9 11V7a3 3 0 0 1 6 0v4" />
              <path d="M9 18v.01" />
              <path d="M12 18v.01" />
              <path d="M15 18v.01" />
            </svg>
            智能优化建议（{{ detailedAnalysis.suggestions.length }}条）
          </div>
          <div class="suggestions-list">
            <div
              v-for="(s, si) in detailedAnalysis.suggestions"
              :key="si"
              class="suggestion-card"
            >
              <span class="sug-num">{{ si + 1 }}</span>
              <span class="sug-text">{{ s }}</span>
            </div>
          </div>
        </div>

        <button
          v-if="store.savedSchemes.length >= 2"
          class="generate-report-btn"
          @click="store.generateReport"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="9" y1="15" x2="15" y2="15" />
            <line x1="9" y1="11" x2="15" y2="11" />
          </svg>
          生成多方案对比报告
        </button>
      </div>

      <div class="alerts-list">
        <div
          v-for="(alert, idx) in alerts"
          :key="idx"
          class="alert-card"
          :class="[typeStyles[alert.type].bg, typeStyles[alert.type].border]"
        >
          <div class="alert-left">
            <div class="alert-icon" :style="{ color: typeStyles[alert.type].icon }">
              <svg v-if="alert.type === 'success'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <svg v-else-if="alert.type === 'info'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <svg v-else-if="alert.type === 'warning'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <div class="alert-content">
              <div class="alert-header-row">
                <h4 class="alert-title" :class="typeStyles[alert.type].text">{{ alert.title }}</h4>
                <span class="level-badge" :class="typeStyles[alert.type].badge">
                  {{ levelLabels[alert.level] }}
                </span>
              </div>
              <p class="alert-message">{{ alert.message }}</p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.risk-alerts {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  border: 1px solid #e2e8f0;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.alerts-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f1f5f9;
}

.alerts-title {
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
  color: #f59e0b;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.toggle-advanced {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 500;
  color: #64748b;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.toggle-advanced:hover { color: #1e293b; border-color: #cbd5e1; }
.toggle-advanced.active { color: #d97706; background: #fffbeb; border-color: #fcd34d; }
.toggle-advanced svg { width: 14px; height: 14px; }

.alerts-count {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #64748b;
}

.count-badge {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.alerts-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  padding: 40px 20px;
}

.empty-icon {
  width: 48px;
  height: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}

.alerts-empty p {
  font-size: 13px;
  margin: 0;
}

.advanced-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 14px;
  padding-bottom: 14px;
  border-bottom: 1px solid #f1f5f9;
}

.overall-score-card {
  padding: 16px;
  border-radius: 12px;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 20px;
  align-items: center;
}

.overall-score-card.low {
  background: linear-gradient(135deg, #ecfdf5, #d1fae5);
  border: 1px solid #6ee7b7;
}
.overall-score-card.medium {
  background: linear-gradient(135deg, #eff6ff, #dbeafe);
  border: 1px solid #93c5fd;
}
.overall-score-card.high {
  background: linear-gradient(135deg, #fffbeb, #fef3c7);
  border: 1px solid #fcd34d;
}
.overall-score-card.critical {
  background: linear-gradient(135deg, #fef2f2, #fee2e2);
  border: 1px solid #fca5a5;
}

.osc-left {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.osc-label {
  font-size: 11px;
  color: #64748b;
  font-weight: 500;
}

.osc-value {
  font-size: 32px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.osc-value.low { color: #059669; }
.osc-value.medium { color: #2563eb; }
.osc-value.high { color: #d97706; }
.osc-value.critical { color: #dc2626; }

.overall-score-card.low .osc-value { color: #059669; }
.overall-score-card.medium .osc-value { color: #2563eb; }
.overall-score-card.high .osc-value { color: #d97706; }
.overall-score-card.critical .osc-value { color: #dc2626; }

.osc-value small {
  font-size: 14px;
  font-weight: 500;
  color: #94a3b8;
}

.osc-level {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.6);
  margin-top: 4px;
}

.overall-score-card.low .osc-level { color: #059669; }
.overall-score-card.medium .osc-level { color: #2563eb; }
.overall-score-card.high .osc-level { color: #d97706; }
.overall-score-card.critical .osc-level { color: #dc2626; }

.osc-gauge {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.gauge-track {
  height: 14px;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 7px;
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.gauge-fill {
  height: 100%;
  background: linear-gradient(90deg, #10b981 0%, #f59e0b 50%, #ef4444 100%);
  border-radius: 7px;
  transition: width 0.5s ease;
}

.gauge-marks {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
}

.dim-header, .section-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.dim-header svg, .section-title svg {
  width: 16px;
  height: 16px;
  color: #d97706;
}

.dims-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.dim-card {
  padding: 10px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #fff;
}

.dim-card.low { border-color: #a7f3d0; background: #f0fdf4; }
.dim-card.medium { border-color: #bfdbfe; background: #eff6ff; }
.dim-card.high { border-color: #fde68a; background: #fffbeb; }
.dim-card.critical { border-color: #fecaca; background: #fef2f2; }

.dim-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.dim-color {
  width: 4px;
  height: 24px;
  border-radius: 2px;
  flex-shrink: 0;
}

.dim-info {
  flex: 1;
  min-width: 0;
}

.dim-name {
  font-size: 12px;
  font-weight: 600;
  color: #1e293b;
  line-height: 1.3;
}

.dim-desc {
  font-size: 10px;
  color: #94a3b8;
  line-height: 1.3;
  margin-top: 1px;
}

.dim-score {
  font-size: 18px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
  line-height: 1;
}

.dim-card.low .dim-score { color: #059669; }
.dim-card.medium .dim-score { color: #2563eb; }
.dim-card.high .dim-score { color: #d97706; }
.dim-card.critical .dim-score { color: #dc2626; }

.dim-bar {
  height: 5px;
  background: #f1f5f9;
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 6px;
}

.dim-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.4s;
}

.dim-level {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.level-tag {
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.8);
}

.dim-card.low .level-tag { color: #059669; }
.dim-card.medium .level-tag { color: #2563eb; }
.dim-card.high .level-tag { color: #d97706; }
.dim-card.critical .level-tag { color: #dc2626; }

.dim-suggest {
  font-size: 10px;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.regional-section, .suggestions-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.regional-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}

.regional-card {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid;
  font-size: 11px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.reg-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.reg-type {
  font-weight: 700;
  font-size: 11px;
}

.reg-severity {
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.reg-name {
  font-size: 11px;
  font-weight: 600;
  color: #334155;
}

.reg-desc {
  font-size: 10.5px;
  color: #64748b;
  line-height: 1.4;
}

.reg-more {
  font-size: 11px;
  color: #94a3b8;
  text-align: center;
  padding: 4px;
}

.suggestions-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.suggestion-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 12px;
  background: #fef3c7;
  border: 1px solid #fde68a;
  border-radius: 8px;
}

.sug-num {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #d97706;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.sug-text {
  font-size: 12px;
  color: #78350f;
  line-height: 1.5;
}

.generate-report-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, #1e293b, #334155);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  justify-content: center;
}

.generate-report-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(30, 41, 59, 0.25);
}

.generate-report-btn svg {
  width: 16px;
  height: 16px;
}

.alerts-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  overflow-y: auto;
}

.alert-card {
  border-radius: 10px;
  border: 1px solid;
  padding: 12px;
  transition: all 0.2s;
}

.alert-card:hover {
  transform: translateX(2px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.alert-left {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.alert-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.6);
}

.alert-icon svg {
  width: 18px;
  height: 18px;
}

.alert-content {
  flex: 1;
  min-width: 0;
}

.alert-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.alert-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.level-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 500;
  color: #fff;
  white-space: nowrap;
  flex-shrink: 0;
}

.alert-message {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.55;
  color: #475569;
}

@media (max-width: 900px) {
  .dims-grid, .regional-grid {
    grid-template-columns: 1fr;
  }
  .overall-score-card {
    grid-template-columns: 1fr;
    gap: 12px;
  }
}
</style>
