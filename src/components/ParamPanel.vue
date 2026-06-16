<script setup lang="ts">
import { ref, computed } from 'vue'
import { usePrintStore } from '../stores/printStore'
import { PARAMS_RANGES, DEFAULT_PARAMS } from '../types'
import type { PrintParams } from '../types'

const store = usePrintStore()

const sliderRefs = {
  viscosity: ref<HTMLInputElement | null>(null),
  pressure: ref<HTMLInputElement | null>(null),
  rollingCount: ref<HTMLInputElement | null>(null),
  heightDiff: ref<HTMLInputElement | null>(null)
}

const inputValues = ref<Record<keyof PrintParams, string>>({
  viscosity: String(store.params.viscosity),
  pressure: String(store.params.pressure),
  rollingCount: String(store.params.rollingCount),
  heightDiff: String(store.params.heightDiff)
})

const paramConfigs = computed(() => [
  {
    key: 'viscosity' as const,
    label: '油墨黏度',
    icon: 'droplet',
    description: '影响油墨流动性和转移效率',
    color: '#2563eb',
    range: PARAMS_RANGES.viscosity
  },
  {
    key: 'pressure' as const,
    label: '滚筒压力',
    icon: 'press',
    description: '影响油墨压印深度和均匀度',
    color: '#059669',
    range: PARAMS_RANGES.pressure
  },
  {
    key: 'rollingCount' as const,
    label: '滚动次数',
    icon: 'repeat',
    description: '越多越均匀但效率越低',
    color: '#d97706',
    range: PARAMS_RANGES.rollingCount
  },
  {
    key: 'heightDiff' as const,
    label: '字面高度差',
    icon: 'layers',
    description: '图文区域与空白区高度差',
    color: '#7c3aed',
    range: PARAMS_RANGES.heightDiff
  }
])

function onSliderChange(key: keyof PrintParams, event: Event) {
  const target = event.target as HTMLInputElement
  const value = parseFloat(target.value)
  if (!isNaN(value)) {
    inputValues.value[key] = String(value)
    store.updateParam(key, value)
  }
}

function onInputChange(key: keyof PrintParams, event: Event) {
  const target = event.target as HTMLInputElement
  const raw = target.value
  inputValues.value[key] = raw
  
  const value = parseFloat(raw)
  if (!isNaN(value)) {
    const range = PARAMS_RANGES[key]
    const clamped = Math.max(range.min, Math.min(range.max, value))
    store.updateParam(key, clamped)
    if (clamped !== value) {
      inputValues.value[key] = String(clamped)
    }
  }
}

function onInputBlur(key: keyof PrintParams) {
  const value = parseFloat(inputValues.value[key])
  const range = PARAMS_RANGES[key]
  
  if (isNaN(value)) {
    inputValues.value[key] = String(store.params[key])
    return
  }
  
  const clamped = Math.max(range.min, Math.min(range.max, value))
  inputValues.value[key] = String(clamped)
  store.updateParam(key, clamped)
}

function handleReset() {
  store.resetParams()
  Object.keys(DEFAULT_PARAMS).forEach(k => {
    inputValues.value[k as keyof PrintParams] = String(DEFAULT_PARAMS[k as keyof PrintParams])
  })
}

function getSliderFillPercent(key: keyof PrintParams) {
  const range = PARAMS_RANGES[key]
  const value = store.params[key]
  return ((value - range.min) / (range.max - range.min)) * 100
}

function isParamError(key: keyof PrintParams) {
  return store.validationErrors.some(e => {
    if (key === 'viscosity') return e.includes('黏度')
    if (key === 'pressure') return e.includes('压力')
    if (key === 'rollingCount') return e.includes('滚动次数')
    if (key === 'heightDiff') return e.includes('高度差')
    return false
  })
}
</script>

<template>
  <div class="param-panel">
    <div class="panel-header">
      <h3 class="panel-title">
        <svg class="title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        参数控制
      </h3>
      <button class="reset-btn" @click="handleReset" title="重置为默认值">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
        </svg>
        重置
      </button>
    </div>

    <div v-if="!store.paramsValid" class="validation-errors">
      <div
        v-for="(err, idx) in store.validationErrors"
        :key="idx"
        class="error-item"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        {{ err }}
      </div>
    </div>

    <div class="params-list">
      <div
        v-for="config in paramConfigs"
        :key="config.key"
        class="param-item"
        :class="{ 'has-error': isParamError(config.key) }"
      >
        <div class="param-header">
          <div class="param-label-row">
            <div class="param-icon" :style="{ background: config.color + '15', color: config.color }">
              <svg v-if="config.icon === 'droplet'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
              </svg>
              <svg v-else-if="config.icon === 'press'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 1v6m-4 0h8M5 7h14v3H5zM5 10h14M6 10v10h12V10" />
              </svg>
              <svg v-else-if="config.icon === 'repeat'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 1l4 4-4 4" />
                <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <path d="M7 23l-4-4 4-4" />
                <path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
              <svg v-else-if="config.icon === 'layers'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            </div>
            <div class="param-info">
              <div class="param-label">{{ config.label }}</div>
              <div class="param-desc">{{ config.description }}</div>
            </div>
          </div>
          <div class="param-value-input">
            <input
              type="number"
              :value="inputValues[config.key]"
              :step="config.range.step"
              :min="config.range.min"
              :max="config.range.max"
              @input="onInputChange(config.key, $event)"
              @blur="onInputBlur(config.key)"
              class="value-input"
              :class="{ 'input-error': isParamError(config.key) }"
            />
            <span class="unit">{{ config.range.unit }}</span>
          </div>
        </div>
        <div class="slider-wrapper">
          <div class="slider-track">
            <div
              class="slider-fill"
              :style="{ width: getSliderFillPercent(config.key) + '%', background: config.color }"
            ></div>
          </div>
          <input
            :ref="(el: any) => sliderRefs[config.key] = el"
            type="range"
            :value="store.params[config.key]"
            :step="config.range.step"
            :min="config.range.min"
            :max="config.range.max"
            @input="onSliderChange(config.key, $event)"
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

    <div class="panel-footer-hint">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      滚动参数变化后，系统会自动重新计算油墨覆盖分布
    </div>
  </div>
</template>

<style scoped>
.param-panel {
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
  margin-bottom: 16px;
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
  color: #2563eb;
}

.reset-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  font-size: 12px;
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
  width: 14px;
  height: 14px;
}

.validation-errors {
  margin-bottom: 16px;
  padding: 12px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
}

.error-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  color: #dc2626;
  padding: 4px 0;
}

.error-item + .error-item {
  border-top: 1px dashed #fecaca;
  padding-top: 8px;
  margin-top: 4px;
}

.error-item svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  margin-top: 1px;
}

.params-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.param-item {
  padding: 12px;
  background: #f8fafc;
  border-radius: 10px;
  border: 1px solid transparent;
  transition: all 0.2s;
}

.param-item.has-error {
  border-color: #fecaca;
  background: #fef2f2;
}

.param-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
  gap: 12px;
}

.param-label-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.param-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.param-icon svg {
  width: 18px;
  height: 18px;
}

.param-info {
  flex: 1;
  min-width: 0;
}

.param-label {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 2px;
}

.param-desc {
  font-size: 11px;
  color: #94a3b8;
}

.param-value-input {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.value-input {
  width: 70px;
  padding: 6px 8px;
  font-size: 14px;
  font-weight: 600;
  text-align: right;
  color: #1e293b;
  background: #fff;
  border: 1.5px solid #e2e8f0;
  border-radius: 6px;
  outline: none;
  transition: all 0.2s;
  font-variant-numeric: tabular-nums;
}

.value-input:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.value-input.input-error {
  border-color: #ef4444;
  background: #fef2f2;
  color: #dc2626;
}

.unit {
  font-size: 11px;
  color: #64748b;
  min-width: 24px;
}

.slider-wrapper {
  position: relative;
  padding: 0 2px;
}

.slider-track {
  position: absolute;
  top: 7px;
  left: 2px;
  right: 2px;
  height: 6px;
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
  height: 20px;
  background: transparent;
  cursor: pointer;
  position: relative;
  z-index: 1;
}

.param-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  background: #fff;
  border: 3px solid var(--slider-color, #2563eb);
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
  width: 18px;
  height: 18px;
  background: #fff;
  border: 3px solid var(--slider-color, #2563eb);
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: #94a3b8;
  margin-top: 2px;
  padding: 0 2px;
}

.panel-footer-hint {
  margin-top: 16px;
  padding: 10px 12px;
  background: #eff6ff;
  border-radius: 8px;
  font-size: 12px;
  color: #1d4ed8;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.panel-footer-hint svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  margin-top: 1px;
}
</style>
