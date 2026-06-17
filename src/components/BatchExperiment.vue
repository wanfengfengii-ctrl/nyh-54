<script setup lang="ts">
import { ref, computed } from 'vue'
import { usePrintStore } from '../stores/printStore'
import type { BatchVariable, OptimizationTarget, BatchRunResult } from '../types'
import { PARAMS_RANGES } from '../types'

const store = usePrintStore()
const showConfigDialog = ref(false)
const experimentName = ref('')

const variables = ref<BatchVariable[]>([
  { param: 'viscosity', min: 30, max: 80, steps: 6, type: 'linear' },
  { param: 'pressure', min: 30, max: 80, steps: 6, type: 'linear' }
])

const optimizationTarget = ref<OptimizationTarget>('balanced')
const customWeights = ref({
  coverage: 50,
  uniformity: 50
})
const isRunning = ref(false)
const expandedRunId = ref<string | null>(null)

const paramOptions = [
  { key: 'viscosity', label: '油墨黏度', unit: 'cP', color: '#2563eb' },
  { key: 'pressure', label: '滚筒压力', unit: 'MPa', color: '#059669' },
  { key: 'rollingCount', label: '滚动次数', unit: '次', color: '#d97706' },
  { key: 'heightDiff', label: '字面高度差', unit: 'μm', color: '#7c3aed' }
]

const targetOptions = [
  { key: 'coverage', label: '覆盖率优先', desc: '追求最高覆盖率' },
  { key: 'uniformity', label: '均匀度优先', desc: '追求最佳均匀度' },
  { key: 'balanced', label: '综合平衡', desc: '覆盖率与均匀度兼顾' },
  { key: 'custom', label: '自定义权重', desc: '自定义各指标权重' }
]

function openConfigDialog() {
  experimentName.value = `批量实验 ${new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`
  optimizationTarget.value = 'balanced'
  customWeights.value = { coverage: 50, uniformity: 50 }
  showConfigDialog.value = true
}

function addVariable() {
  const usedParams = variables.value.map(v => v.param)
  const available = paramOptions.find(p => !usedParams.includes(p.key as any))
  if (!available) return
  const range = PARAMS_RANGES[available.key as keyof typeof PARAMS_RANGES]
  variables.value.push({
    param: available.key as any,
    min: range.min,
    max: range.max,
    steps: 5,
    type: 'linear'
  })
}

function removeVariable(idx: number) {
  variables.value.splice(idx, 1)
}

const totalCombinations = computed(() => {
  return variables.value.reduce((acc, v) => acc * Math.max(1, v.steps), 1)
})

const displayResults = computed(() => {
  if (!store.activeExperiment) return []
  return store.activeExperiment.results.slice(0, 100)
})

function toggleExpand(runId: string) {
  expandedRunId.value = expandedRunId.value === runId ? null : runId
}

async function runExperiment() {
  if (variables.value.length === 0) return
  isRunning.value = true
  showConfigDialog.value = false

  const config: any = {
    name: experimentName.value || '未命名实验',
    baseParams: { ...store.params },
    variables: JSON.parse(JSON.stringify(variables.value)),
    optimizationTarget: optimizationTarget.value
  }

  if (optimizationTarget.value === 'custom') {
    config.customWeights = {
      coverage: customWeights.value.coverage,
      uniformity: customWeights.value.uniformity
    }
  }

  const result = await store.startBatchExperiment(config)

  isRunning.value = false
  if (result) {
    store.setActiveExperiment(result.id)
  }
}

function applyRun(run: BatchRunResult) {
  store.applyExperimentScheme(run.params)
}

function handleDeleteExperiment() {
  if (window.confirm('确定删除该实验？') && store.activeExperiment) {
    store.deleteExperiment(store.activeExperiment.id)
  }
}

function getColorClass(v: number): string {
  if (v >= 85) return 'text-emerald-600'
  if (v >= 70) return 'text-sky-600'
  if (v >= 50) return 'text-amber-600'
  return 'text-red-600'
}

function getBgClass(v: number): string {
  if (v >= 85) return 'bg-emerald-50 border-emerald-200'
  if (v >= 70) return 'bg-sky-50 border-sky-200'
  if (v >= 50) return 'bg-amber-50 border-amber-200'
  return 'bg-red-50 border-red-200'
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}秒`
  return `${Math.floor(s / 60)}分${s % 60}秒`
}
</script>

<template>
  <div class="batch-experiment">
    <div class="panel-header">
      <h3 class="panel-title">
        <svg class="title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-4" />
          <path d="M9 11V7a3 3 0 0 1 6 0v4" />
        </svg>
        批量实验与自动推荐
      </h3>
      <div class="header-actions">
        <button
          class="action-btn primary"
          @click="openConfigDialog"
          :disabled="isRunning"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          新建实验
        </button>
      </div>
    </div>

    <div v-if="store.experimentProgress" class="progress-overlay">
      <div class="progress-card">
        <div class="progress-spinner"></div>
        <div class="progress-text">
          <strong>正在批量运行实验...</strong>
          <div>{{ store.experimentProgress.completed }} / {{ store.experimentProgress.total }}</div>
          <div class="progress-bar-wrap">
            <div
              class="progress-bar-fill"
              :style="{ width: `${(store.experimentProgress.completed / store.experimentProgress.total) * 100}%` }"
            ></div>
          </div>
        </div>
        <button class="cancel-btn" @click="store.cancelBatchExperiment">取消</button>
      </div>
    </div>

    <div v-if="store.experiments.length === 0 && !store.experimentProgress" class="exp-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M9 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-4" />
        <path d="M9 11V7a3 3 0 0 1 6 0v4" />
      </svg>
      <p>暂无批量实验</p>
      <span>创建实验可自动遍历多组参数并筛选最优方案</span>
    </div>

    <div v-else-if="store.experiments.length > 0 && !store.activeExperiment" class="exp-list">
      <div
        v-for="exp in store.experiments"
        :key="exp.id"
        class="exp-card"
        @click="store.setActiveExperiment(exp.id)"
      >
        <div class="exp-card-header">
          <h4>{{ exp.name }}</h4>
          <span
            class="status-tag"
            :class="exp.status"
          >
            {{ exp.status === 'completed' ? '已完成' : exp.status === 'cancelled' ? '已取消' : '进行中' }}
          </span>
        </div>
        <div class="exp-stats">
          <div class="stat">
            <span class="label">总运行</span>
            <span class="value">{{ exp.results.length }}</span>
          </div>
          <div class="stat">
            <span class="label">用时</span>
            <span class="value">{{ formatDuration(exp.completedAt - exp.startedAt) }}</span>
          </div>
          <div class="stat">
            <span class="label">最优分</span>
            <span class="value highlight">{{ exp.recommendedScheme?.score.balanced ?? '-' }}</span>
          </div>
        </div>
        <div class="exp-date">{{ new Date(exp.startedAt).toLocaleString('zh-CN') }}</div>
      </div>
    </div>

    <template v-else-if="store.activeExperiment">
      <div class="exp-detail-header">
        <button class="back-btn" @click="store.setActiveExperiment(null)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          返回列表
        </button>
        <div class="exp-meta">
          <h3 class="exp-name">{{ store.activeExperiment.name }}</h3>
          <div class="exp-tags">
            <span class="info-tag">{{ store.activeExperiment.results.length }} 组参数</span>
            <span class="info-tag">{{ formatDuration(store.activeExperiment.completedAt - store.activeExperiment.startedAt) }}</span>
            <span
              class="info-tag target"
            >
              目标：{{ targetOptions.find(t => t.key === store.activeExperiment!.config.optimizationTarget)?.label }}
            </span>
          </div>
        </div>
        <button
          class="icon-btn danger"
          @click="handleDeleteExperiment"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
          </svg>
        </button>
      </div>

      <div v-if="store.activeExperiment.recommendedScheme" class="recommend-card">
        <div class="recommend-badge">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          推荐最优方案
        </div>
        <div class="recommend-body">
          <div class="rec-metrics">
            <div class="rec-metric">
              <div class="rec-label">综合评分</div>
              <div class="rec-value big">{{ store.activeExperiment.recommendedScheme.score.balanced }}</div>
            </div>
            <div class="rec-metric">
              <div class="rec-label">覆盖率</div>
              <div class="rec-value">{{ store.activeExperiment.recommendedScheme.result.coverage.toFixed(1) }}%</div>
            </div>
            <div class="rec-metric">
              <div class="rec-label">均匀度</div>
              <div class="rec-value">{{ store.activeExperiment.recommendedScheme.result.uniformity.toFixed(1) }}%</div>
            </div>
            <div class="rec-metric">
              <div class="rec-label">排名</div>
              <div class="rec-value">#{{ store.activeExperiment.recommendedScheme.rank }}</div>
            </div>
          </div>
          <div class="rec-params">
            <div
              v-for="(opt, _i) in paramOptions"
              :key="opt.key"
              class="rec-param"
              :style="{ '--pc': opt.color }"
            >
              <span class="rp-label">{{ opt.label }}</span>
              <span class="rp-value">
                {{ (store.activeExperiment!.recommendedScheme!.params as any)[opt.key] }}
                <small>{{ opt.unit }}</small>
              </span>
            </div>
          </div>
          <button
            class="apply-btn"
            @click="applyRun(store.activeExperiment!.recommendedScheme!)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              <polyline points="21 3 12 3 12 12" />
            </svg>
            应用此方案
          </button>
        </div>
      </div>

      <div v-if="store.activeExperiment.paretoFront && store.activeExperiment.paretoFront.length > 0" class="pareto-section">
        <div class="pareto-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 17 9 11 13 15 21 7" />
            <polyline points="14 7 21 7 21 14" />
          </svg>
          帕累托最优解集 ({{ store.activeExperiment.paretoFront.length }}个)
        </div>
        <div class="pareto-chips">
          <button
            v-for="(p, idx) in store.activeExperiment.paretoFront"
            :key="p.runId"
            class="pareto-chip"
            @click="applyRun(p)"
            title="点击应用此方案"
          >
            <span class="chip-idx">#{{ idx + 1 }}</span>
            <span>覆{{ p.result.coverage.toFixed(0) }}%</span>
            <span>均{{ p.result.uniformity.toFixed(0) }}%</span>
          </button>
        </div>
      </div>

      <div class="results-section">
        <div class="results-header">
          <h4>实验结果列表（前100项）</h4>
        </div>
        <div class="results-table-wrap">
          <table class="results-table">
            <thead>
              <tr>
                <th>排名</th>
                <th>综合</th>
                <th>覆盖率</th>
                <th>均匀度</th>
                <th>黏度</th>
                <th>压力</th>
                <th>滚动</th>
                <th>高差</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="run in displayResults"
                :key="run.runId"
                :class="{ expanded: expandedRunId === run.runId, recommended: run.rank === 1 }"
              >
                <td>
                  <span class="rank" :class="`rank-${run.rank}`">
                    {{ run.rank === 1 ? '🥇' : run.rank === 2 ? '🥈' : run.rank === 3 ? '🥉' : '#' + run.rank }}
                  </span>
                </td>
                <td>
                  <span class="score-badge" :class="getBgClass(run.score.balanced)">
                    <span :class="getColorClass(run.score.balanced)">{{ run.score.balanced }}</span>
                  </span>
                </td>
                <td>
                  <span :class="getColorClass(run.result.coverage)">
                    {{ run.result.coverage.toFixed(1) }}%
                  </span>
                </td>
                <td>
                  <span :class="getColorClass(run.result.uniformity)">
                    {{ run.result.uniformity.toFixed(1) }}%
                  </span>
                </td>
                <td class="num">{{ run.params.viscosity }}</td>
                <td class="num">{{ run.params.pressure }}</td>
                <td class="num">{{ run.params.rollingCount }}</td>
                <td class="num">{{ run.params.heightDiff }}</td>
                <td>
                  <div class="row-actions">
                    <button class="row-btn" @click="toggleExpand(run.runId)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" :class="{rot: expandedRunId === run.runId}">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    <button class="row-btn apply" @click="applyRun(run)" title="应用此参数">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        <polyline points="21 3 12 3 12 12" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="expandedRunId && displayResults.find(r => r.runId === expandedRunId)" class="detail-row">
                <td colspan="9">
                  <div class="detail-inner">
                    <div class="detail-metrics">
                      <div class="det-m">
                        <div class="det-label">覆盖率评分</div>
                        <div class="det-val" :class="getColorClass(displayResults.find(r=>r.runId===expandedRunId)!.score.coverage)">
                          {{ displayResults.find(r=>r.runId===expandedRunId)!.score.coverage }}
                        </div>
                      </div>
                      <div class="det-m">
                        <div class="det-label">均匀度评分</div>
                        <div class="det-val" :class="getColorClass(displayResults.find(r=>r.runId===expandedRunId)!.score.uniformity)">
                          {{ displayResults.find(r=>r.runId===expandedRunId)!.score.uniformity }}
                        </div>
                      </div>
                      <div class="det-m">
                        <div class="det-label">平均墨厚</div>
                        <div class="det-val">
                          {{ (displayResults.find(r=>r.runId===expandedRunId)!.result.averageThickness * 100).toFixed(1) }}%
                        </div>
                      </div>
                    </div>
                    <div class="detail-alerts">
                      <div
                        v-for="(a, ai) in displayResults.find(r=>r.runId===expandedRunId)!.result.riskAlerts.slice(0, 3)"
                        :key="ai"
                        class="alert-mini"
                        :class="a.type"
                      >
                        <strong>{{ a.title }}</strong>
                        <span>{{ a.message }}</span>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <Teleport to="body">
      <div v-if="showConfigDialog" class="dialog-overlay" @click.self="showConfigDialog = false">
        <div class="dialog exp-dialog">
          <div class="dialog-header">
            <h4>配置批量实验</h4>
            <button class="dialog-close" @click="showConfigDialog = false">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div class="dialog-body">
            <div class="form-group">
              <label class="form-label">实验名称</label>
              <input
                v-model="experimentName"
                type="text"
                class="form-input"
                placeholder="请输入实验名称"
                maxlength="50"
              />
            </div>

            <div class="form-group">
              <label class="form-label">
                变量参数
                <span class="form-hint">将对这些参数的组合进行遍历</span>
              </label>
              <div class="var-list">
                <div
                  v-for="(v, idx) in variables"
                  :key="idx"
                  class="var-row"
                >
                  <div class="var-param">
                    <select
                      v-model="v.param"
                      class="var-select"
                    >
                      <option
                        v-for="p in paramOptions"
                        :key="p.key"
                        :value="p.key"
                      >
                        {{ p.label }}
                      </option>
                    </select>
                  </div>
                  <div class="var-range">
                    <input
                      type="number"
                      v-model.number="v.min"
                      class="var-input"
                      :min="(PARAMS_RANGES as any)[v.param].min"
                      :max="(PARAMS_RANGES as any)[v.param].max"
                    />
                    <span class="var-sep">~</span>
                    <input
                      type="number"
                      v-model.number="v.max"
                      class="var-input"
                      :min="(PARAMS_RANGES as any)[v.param].min"
                      :max="(PARAMS_RANGES as any)[v.param].max"
                    />
                  </div>
                  <div class="var-steps">
                    <span class="steps-label">{{ v.steps }}个值</span>
                    <input
                      type="range"
                      v-model.number="v.steps"
                      min="2"
                      max="10"
                      class="steps-slider"
                    />
                  </div>
                  <button
                    v-if="variables.length > 1"
                    class="icon-btn tiny danger"
                    @click="removeVariable(idx)"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                </div>
              </div>
              <button
                v-if="variables.length < 4"
                class="add-var-btn"
                @click="addVariable"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                添加变量
              </button>
              <div class="combo-hint">
                共需运行 <strong>{{ totalCombinations }}</strong> 组模拟
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">优化目标</label>
              <div class="target-options">
                <label
                  v-for="t in targetOptions"
                  :key="t.key"
                  class="target-option"
                  :class="{ active: optimizationTarget === t.key }"
                >
                  <input
                    type="radio"
                    :value="t.key"
                    v-model="optimizationTarget"
                    style="display:none"
                  />
                  <div class="target-body">
                    <div class="target-name">{{ t.label }}</div>
                    <div class="target-desc">{{ t.desc }}</div>
                  </div>
                </label>
              </div>
            </div>

            <div v-if="optimizationTarget === 'custom'" class="form-group custom-weights-group">
              <label class="form-label">自定义权重配置</label>
              <div class="weight-item">
                <div class="weight-header">
                  <span class="weight-label">覆盖率权重</span>
                  <span class="weight-value">{{ customWeights.coverage }}%</span>
                </div>
                <div class="weight-slider-wrap">
                  <input
                    type="range"
                    v-model.number="customWeights.coverage"
                    min="0"
                    max="100"
                    step="5"
                    class="weight-slider"
                  />
                </div>
              </div>
              <div class="weight-item">
                <div class="weight-header">
                  <span class="weight-label">均匀度权重</span>
                  <span class="weight-value">{{ customWeights.uniformity }}%</span>
                </div>
                <div class="weight-slider-wrap">
                  <input
                    type="range"
                    v-model.number="customWeights.uniformity"
                    min="0"
                    max="100"
                    step="5"
                    class="weight-slider"
                  />
                </div>
              </div>
              <div class="weight-note">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                权重将自动归一化，当前比例：覆盖率 {{ Math.round(customWeights.coverage / (customWeights.coverage + customWeights.uniformity) * 100) }}% : 均匀度 {{ Math.round(customWeights.uniformity / (customWeights.coverage + customWeights.uniformity) * 100) }}%
              </div>
            </div>
          </div>
          <div class="dialog-footer">
            <button class="btn-secondary" @click="showConfigDialog = false">取消</button>
            <button
              class="btn-primary"
              :disabled="variables.length === 0 || totalCombinations === 0 || isRunning"
              @click="runExperiment"
            >
              {{ isRunning ? '运行中...' : '开始实验' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.batch-experiment {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  border: 1px solid #e2e8f0;
}

.panel-header {
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
  color: #d97706;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  border: 1.5px solid #e2e8f0;
  background: #fff;
  color: #334155;
  transition: all 0.2s;
}

.action-btn:hover:not(:disabled) {
  background: #f8fafc;
  border-color: #cbd5e1;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn.primary {
  background: #d97706;
  color: #fff;
  border-color: #d97706;
}

.action-btn.primary:hover:not(:disabled) {
  background: #b45309;
}

.action-btn svg {
  width: 16px;
  height: 16px;
}

.progress-overlay {
  position: relative;
  padding: 20px;
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 10px;
  margin-bottom: 16px;
}

.progress-card {
  display: flex;
  align-items: center;
  gap: 16px;
}

.progress-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #fde68a;
  border-top-color: #d97706;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.progress-text {
  flex: 1;
  font-size: 13px;
  color: #78350f;
}

.progress-text strong {
  display: block;
  margin-bottom: 4px;
}

.progress-bar-wrap {
  height: 6px;
  background: #fde68a;
  border-radius: 3px;
  margin-top: 8px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: #d97706;
  border-radius: 3px;
  transition: width 0.2s;
}

.cancel-btn {
  padding: 6px 12px;
  font-size: 12px;
  color: #b91c1c;
  background: #fee2e2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  cursor: pointer;
}

.exp-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
  color: #94a3b8;
}

.exp-empty svg {
  width: 48px;
  height: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}

.exp-empty p {
  font-size: 14px;
  color: #64748b;
  margin: 0 0 6px 0;
}

.exp-empty span {
  font-size: 12px;
  color: #94a3b8;
}

.exp-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}

.exp-card {
  padding: 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.exp-card:hover {
  border-color: #d97706;
  background: #fffbeb;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(217, 119, 6, 0.1);
}

.exp-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 10px;
}

.exp-card-header h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-tag {
  padding: 2px 8px;
  font-size: 10px;
  font-weight: 600;
  border-radius: 4px;
  flex-shrink: 0;
}

.status-tag.completed { background: #dcfce7; color: #166534; }
.status-tag.cancelled { background: #fee2e2; color: #991b1b; }
.status-tag.running { background: #fef3c7; color: #92400e; }

.exp-stats {
  display: flex;
  gap: 10px;
  margin-bottom: 8px;
}

.stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat .label {
  font-size: 10px;
  color: #94a3b8;
}

.stat .value {
  font-size: 14px;
  font-weight: 700;
  color: #334155;
  font-variant-numeric: tabular-nums;
}

.stat .value.highlight {
  color: #d97706;
}

.exp-date {
  font-size: 11px;
  color: #94a3b8;
}

.exp-detail-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f1f5f9;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  font-size: 12px;
  color: #64748b;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  cursor: pointer;
  flex-shrink: 0;
}

.back-btn:hover {
  background: #e2e8f0;
  color: #1e293b;
}

.back-btn svg {
  width: 14px;
  height: 14px;
}

.exp-meta {
  flex: 1;
  min-width: 0;
}

.exp-name {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #1e293b;
  margin-bottom: 4px;
}

.exp-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.info-tag {
  padding: 2px 8px;
  font-size: 11px;
  background: #f1f5f9;
  color: #475569;
  border-radius: 4px;
  font-weight: 500;
}

.info-tag.target {
  background: #fef3c7;
  color: #92400e;
}

.icon-btn {
  width: 34px;
  height: 34px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  flex-shrink: 0;
  transition: all 0.2s;
}

.icon-btn:hover { background: #e2e8f0; }
.icon-btn.danger:hover { background: #fee2e2; color: #dc2626; border-color: #fecaca; }
.icon-btn.tiny { width: 28px; height: 28px; }
.icon-btn svg { width: 16px; height: 16px; }
.icon-btn.tiny svg { width: 14px; height: 14px; }

.recommend-card {
  background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
  border: 2px solid #fcd34d;
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 16px;
}

.recommend-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: #d97706;
  color: #fff;
  font-weight: 700;
  font-size: 14px;
}

.recommend-badge svg {
  width: 18px;
  height: 18px;
}

.recommend-body {
  padding: 16px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 20px;
  align-items: center;
}

.rec-metrics {
  display: flex;
  gap: 20px;
}

.rec-metric {
  text-align: center;
}

.rec-label {
  font-size: 11px;
  color: #92400e;
  margin-bottom: 4px;
}

.rec-value {
  font-size: 18px;
  font-weight: 700;
  color: #78350f;
  font-variant-numeric: tabular-nums;
}

.rec-value.big {
  font-size: 28px;
  color: #d97706;
}

.rec-params {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.rec-param {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  background: #fff;
  border-left: 3px solid var(--pc);
  border-radius: 4px;
  font-size: 13px;
}

.rp-label {
  color: #64748b;
  font-size: 12px;
}

.rp-value {
  font-weight: 700;
  color: #1e293b;
  font-variant-numeric: tabular-nums;
}

.rp-value small {
  font-weight: 400;
  color: #94a3b8;
  font-size: 10px;
}

.apply-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 18px;
  font-size: 14px;
  font-weight: 600;
  background: #1e293b;
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.apply-btn:hover {
  background: #0f172a;
  transform: translateY(-1px);
}

.apply-btn svg {
  width: 16px;
  height: 16px;
}

.pareto-section {
  margin-bottom: 16px;
  padding: 12px;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 10px;
}

.pareto-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #0369a1;
  margin-bottom: 10px;
}

.pareto-title svg {
  width: 16px;
  height: 16px;
}

.pareto-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pareto-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  font-size: 11px;
  font-weight: 600;
  background: #fff;
  border: 1px solid #7dd3fc;
  border-radius: 6px;
  cursor: pointer;
  color: #0369a1;
  transition: all 0.2s;
  font-variant-numeric: tabular-nums;
}

.pareto-chip:hover {
  background: #e0f2fe;
  border-color: #0ea5e9;
}

.chip-idx {
  padding: 1px 5px;
  background: #0ea5e9;
  color: #fff;
  border-radius: 4px;
}

.results-section {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
}

.results-header {
  padding: 10px 14px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.results-header h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.results-table-wrap {
  max-height: 400px;
  overflow-y: auto;
}

.results-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.results-table thead {
  position: sticky;
  top: 0;
  background: #f8fafc;
  z-index: 1;
}

.results-table th,
.results-table td {
  padding: 8px 10px;
  text-align: left;
  border-bottom: 1px solid #f1f5f9;
}

.results-table th {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  background: #f1f5f9;
}

.results-table tbody tr {
  transition: background 0.15s;
  cursor: pointer;
}

.results-table tbody tr:hover {
  background: #f8fafc;
}

.results-table tbody tr.recommended {
  background: #fffbeb;
}

.results-table tbody tr.recommended:hover {
  background: #fef3c7;
}

.results-table tbody tr.expanded {
  background: #eff6ff;
}

.results-table td.num {
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  color: #334155;
}

.rank {
  font-size: 12px;
  font-weight: 700;
}

.score-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.row-actions {
  display: inline-flex;
  gap: 4px;
}

.row-btn {
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  transition: all 0.2s;
}

.row-btn:hover {
  background: #e2e8f0;
  color: #1e293b;
}

.row-btn.apply:hover {
  background: #dbeafe;
  color: #1d4ed8;
  border-color: #93c5fd;
}

.row-btn svg {
  width: 14px;
  height: 14px;
  transition: transform 0.2s;
}

.row-btn svg.rot {
  transform: rotate(180deg);
}

.detail-row td {
  padding: 0;
  background: #f8fafc;
}

.detail-inner {
  padding: 14px 20px;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 20px;
}

.detail-metrics {
  display: flex;
  gap: 20px;
  align-items: flex-start;
}

.det-m {
  text-align: center;
  padding: 10px 14px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  min-width: 80px;
}

.det-label {
  font-size: 10px;
  color: #94a3b8;
  margin-bottom: 4px;
}

.det-val {
  font-size: 18px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.detail-alerts {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.alert-mini {
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  display: flex;
  gap: 8px;
}

.alert-mini strong { flex-shrink: 0; }
.alert-mini span { color: #475569; }
.alert-mini.success { background: #ecfdf5; border: 1px solid #a7f3d0; }
.alert-mini.success strong { color: #059669; }
.alert-mini.info { background: #f0f9ff; border: 1px solid #bae6fd; }
.alert-mini.info strong { color: #0284c7; }
.alert-mini.warning { background: #fffbeb; border: 1px solid #fde68a; }
.alert-mini.warning strong { color: #d97706; }
.alert-mini.danger { background: #fef2f2; border: 1px solid #fecaca; }
.alert-mini.danger strong { color: #dc2626; }

.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(2px);
}

.dialog {
  width: 600px;
  max-width: calc(100vw - 32px);
  max-height: 90vh;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #f1f5f9;
}

.dialog-header h4 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
}

.dialog-close {
  width: 30px;
  height: 30px;
  border: none;
  background: #f8fafc;
  border-radius: 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
}

.dialog-close:hover { background: #e2e8f0; }
.dialog-close svg { width: 16px; height: 16px; }

.dialog-body {
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-hint {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 400;
}

.form-input {
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  color: #1e293b;
  background: #fff;
  border: 1.5px solid #e2e8f0;
  border-radius: 8px;
  outline: none;
  box-sizing: border-box;
}

.form-input:focus {
  border-color: #d97706;
  box-shadow: 0 0 0 3px rgba(217, 119, 6, 0.1);
}

.var-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.var-row {
  display: grid;
  grid-template-columns: 110px 1fr auto auto;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  background: #f8fafc;
  border-radius: 8px;
}

.var-select {
  padding: 6px 8px;
  font-size: 12px;
  font-weight: 500;
  color: #1e293b;
  background: #fff;
  border: 1.5px solid #e2e8f0;
  border-radius: 6px;
  outline: none;
  cursor: pointer;
  width: 100%;
}

.var-range {
  display: flex;
  align-items: center;
  gap: 6px;
}

.var-input {
  width: 80px;
  padding: 6px 8px;
  font-size: 12px;
  border: 1.5px solid #e2e8f0;
  border-radius: 6px;
  outline: none;
  font-variant-numeric: tabular-nums;
}

.var-input:focus {
  border-color: #d97706;
}

.var-sep {
  color: #94a3b8;
  font-size: 12px;
}

.var-steps {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
}

.steps-label {
  font-size: 11px;
  color: #64748b;
  font-weight: 500;
  min-width: 36px;
}

.steps-slider {
  width: 80px;
  accent-color: #d97706;
}

.add-var-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 500;
  color: #d97706;
  background: #fffbeb;
  border: 1.5px dashed #fcd34d;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  margin-top: 4px;
}

.add-var-btn:hover {
  background: #fef3c7;
}

.add-var-btn svg {
  width: 14px;
  height: 14px;
}

.combo-hint {
  margin-top: 8px;
  padding: 8px 12px;
  background: #eff6ff;
  border-radius: 6px;
  font-size: 12px;
  color: #1d4ed8;
}

.combo-hint strong {
  font-size: 14px;
  color: #1e40af;
}

.target-options {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.target-option {
  padding: 10px 12px;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.target-option:hover {
  border-color: #fcd34d;
  background: #fffbeb;
}

.target-option.active {
  border-color: #d97706;
  background: #fffbeb;
}

.target-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.target-name {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
}

.target-desc {
  font-size: 11px;
  color: #94a3b8;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid #f1f5f9;
  background: #fafafa;
}

.btn-secondary, .btn-primary {
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary {
  background: #fff;
  color: #475569;
  border: 1px solid #e2e8f0;
}

.btn-secondary:hover { background: #f8fafc; }

.btn-primary {
  background: #d97706;
  color: #fff;
  border: 1px solid #d97706;
}

.btn-primary:hover:not(:disabled) { background: #b45309; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

@media (max-width: 900px) {
  .recommend-body {
    grid-template-columns: 1fr;
    gap: 14px;
  }
  .rec-metrics { justify-content: center; }
  .target-options { grid-template-columns: 1fr; }
  .var-row { grid-template-columns: 1fr; }
}

.custom-weights-group {
  margin-top: 12px;
  padding: 14px;
  background: linear-gradient(135deg, #f5f3ff, #ede9fe);
  border-radius: 10px;
  border: 1px solid #ddd6fe;
}

.weight-item {
  margin-bottom: 14px;
}

.weight-item:last-of-type {
  margin-bottom: 10px;
}

.weight-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.weight-label {
  font-size: 12px;
  font-weight: 600;
  color: #5b21b6;
}

.weight-value {
  font-size: 12px;
  font-weight: 700;
  color: #7c3aed;
  font-variant-numeric: tabular-nums;
}

.weight-slider-wrap {
  position: relative;
}

.weight-slider {
  width: 100%;
  -webkit-appearance: none;
  appearance: none;
  height: 6px;
  background: #ddd6fe;
  border-radius: 3px;
  cursor: pointer;
}

.weight-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  background: #fff;
  border: 3px solid #7c3aed;
  border-radius: 50%;
  cursor: pointer;
  margin-top: -6px;
  box-shadow: 0 2px 6px rgba(124, 58, 237, 0.3);
  transition: transform 0.15s;
}

.weight-slider::-webkit-slider-thumb:hover {
  transform: scale(1.1);
}

.weight-slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  background: #fff;
  border: 3px solid #7c3aed;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(124, 58, 237, 0.3);
}

.weight-note {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.7);
  border-radius: 6px;
  font-size: 11px;
  color: #6b21a8;
  line-height: 1.4;
}

.weight-note svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  margin-top: 1px;
}
</style>
