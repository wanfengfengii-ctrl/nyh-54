<script setup lang="ts">
import { computed } from 'vue'
import { usePrintStore } from '../stores/printStore'
import type { RiskAlert } from '../types'

const store = usePrintStore()

const alerts = computed(() => store.currentResult?.riskAlerts ?? [])

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
        风险提示
      </h3>
      <div v-if="alerts.length" class="alerts-count">
        <span class="count-badge" :class="alerts.some(a => a.level >= 3) ? 'bg-red-500' : alerts.some(a => a.level >= 2) ? 'bg-amber-500' : 'bg-emerald-500'">
          {{ alerts.length }}
        </span>
        项
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

    <div v-else class="alerts-list">
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
</style>
