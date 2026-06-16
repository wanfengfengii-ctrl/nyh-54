<script setup lang="ts">
import { computed, ref } from 'vue'
import { usePrintStore } from '../stores/printStore'
import { PLAYBACK_SPEEDS, type ParamHistoryEntry } from '../types'

const store = usePrintStore()
const expandedId = ref<string | null>(null)

const historyList = computed(() => [...store.history].reverse())

function toggleExpand(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}

function paramLabel(param: string): string {
  switch (param) {
    case 'viscosity': return '黏度'
    case 'pressure': return '压力'
    case 'rollingCount': return '滚动'
    case 'heightDiff': return '高差'
    default: return param
  }
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

function getCoverageColor(c: number): string {
  if (c < 30 || c > 95) return 'text-red-600'
  if (c < 50 || c > 85) return 'text-amber-600'
  return 'text-emerald-600'
}

function getUniformityColor(u: number): string {
  if (u < 50) return 'text-red-600'
  if (u < 70) return 'text-amber-600'
  return 'text-emerald-600'
}
</script>

<template>
  <div class="param-history">
    <div class="panel-header">
      <h3 class="panel-title">
        <svg class="title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        参数历史回放
      </h3>
      <button
        v-if="store.history.length > 0"
        class="icon-btn danger"
        @click="store.clearHistory"
        title="清空历史"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
        </svg>
      </button>
    </div>

    <div v-if="store.history.length === 0" class="history-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      <p>暂无调整记录</p>
      <span>修改参数后会自动记录，支持回溯与回放</span>
    </div>

    <template v-else>
      <div class="playback-controls">
        <div class="controls-row">
          <div class="control-btns">
            <button
              class="ctrl-btn"
              :disabled="store.playbackState.currentIndex <= 0"
              @click="store.jumpToHistory(0)"
              title="回到最早"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="19 20 9 12 19 4 19 20" />
                <line x1="5" y1="19" x2="5" y2="5" />
              </svg>
            </button>
            <button
              class="ctrl-btn"
              :disabled="store.playbackState.currentIndex <= 0"
              @click="store.setPlaybackDirection('backward'); store.startPlayback()"
              title="后退播放"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="11 19 2 12 11 5 11 19" />
                <polygon points="22 19 13 12 22 5 22 19" />
              </svg>
            </button>
            <button
              v-if="!store.playbackState.isPlaying || store.playbackState.isPaused"
              class="ctrl-btn primary"
              @click="store.playbackState.isPaused ? store.resumePlayback() : store.startPlayback()"
              :disabled="store.history.length < 2"
              title="播放"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </button>
            <button
              v-else
              class="ctrl-btn warning"
              @click="store.pausePlayback"
              title="暂停"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            </button>
            <button
              class="ctrl-btn"
              :disabled="store.playbackState.currentIndex >= store.history.length - 1"
              @click="store.setPlaybackDirection('forward'); store.startPlayback()"
              title="前进播放"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="13 19 22 12 13 5 13 19" />
                <polygon points="2 19 11 12 2 5 2 19" />
              </svg>
            </button>
            <button
              class="ctrl-btn"
              :disabled="store.playbackState.currentIndex >= store.history.length - 1"
              @click="store.jumpToHistory(store.history.length - 1)"
              title="跳到最新"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5 4 15 12 5 20 5 4" />
                <line x1="19" y1="5" x2="19" y2="19" />
              </svg>
            </button>
          </div>
        </div>

        <div class="controls-row">
          <div class="speed-selector">
            <span class="ctrl-label">速度：</span>
            <div class="speed-btns">
              <button
                v-for="s in PLAYBACK_SPEEDS"
                :key="s.value"
                class="speed-btn"
                :class="{ active: store.playbackState.speed === s.value }"
                @click="store.setPlaybackSpeed(s.value)"
              >
                {{ s.label }}
              </button>
            </div>
          </div>
          <div class="progress-info">
            {{ store.playbackState.currentIndex + 1 }} / {{ store.history.length }}
          </div>
        </div>

        <div class="progress-slider-wrap">
          <input
            type="range"
            :value="store.playbackState.currentIndex"
            :min="0"
            :max="store.history.length - 1"
            step="1"
            @input="(e: any) => store.jumpToHistory(parseInt(e.target.value))"
            class="progress-slider"
          />
        </div>
      </div>

      <div class="history-timeline">
        <div class="timeline-scroll">
          <div
            v-for="(entry, revIdx) in historyList"
            :key="entry.id"
            class="timeline-item"
            :class="{
              active: store.playbackState.currentIndex === store.history.length - 1 - revIdx,
              expanded: expandedId === entry.id
            }"
            @click="toggleExpand(entry.id)"
          >
            <div class="timeline-dot-wrap">
              <div
                class="timeline-dot"
                :class="{
                  playing: store.playbackState.isPlaying && store.playbackState.currentIndex === store.history.length - 1 - revIdx
                }"
                @click.stop="store.jumpToHistory(store.history.length - 1 - revIdx)"
              ></div>
              <div v-if="revIdx < historyList.length - 1" class="timeline-line"></div>
            </div>

            <div class="timeline-content">
              <div class="timeline-header" @click.stop="store.jumpToHistory(store.history.length - 1 - revIdx)">
                <div class="entry-time">{{ formatTime(entry.timestamp) }}</div>
                <div class="entry-metrics">
                  <span class="metric-dot" :class="getCoverageColor(entry.result.coverage)">
                    覆 {{ entry.result.coverage.toFixed(0) }}%
                  </span>
                  <span class="metric-dot" :class="getUniformityColor(entry.result.uniformity)">
                    均 {{ entry.result.uniformity.toFixed(0) }}%
                  </span>
                </div>
                <svg
                  v-if="entry.changes.length > 0"
                  class="expand-icon"
                  :class="{ rotated: expandedId === entry.id }"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>

              <div v-if="expandedId === entry.id" class="entry-detail">
                <div v-if="entry.changes.length > 0" class="changes-list">
                  <div
                    v-for="(c, ci) in entry.changes"
                    :key="ci"
                    class="change-row"
                  >
                    <span class="change-param">{{ paramLabel(c.param) }}</span>
                    <span class="change-old">{{ c.oldValue }}</span>
                    <svg class="change-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                    <span class="change-new" :class="c.newValue > c.oldValue ? 'up' : 'down'">
                      {{ c.newValue }}
                    </span>
                  </div>
                </div>
                <div class="params-row">
                  <span class="p-tag">黏{{ entry.params.viscosity }}</span>
                  <span class="p-tag">压{{ entry.params.pressure }}</span>
                  <span class="p-tag">滚{{ entry.params.rollingCount }}</span>
                  <span class="p-tag">差{{ entry.params.heightDiff }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.param-history {
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
  color: #059669;
}

.icon-btn {
  width: 32px;
  height: 32px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  transition: all 0.2s;
}

.icon-btn:hover:not(:disabled) {
  background: #e2e8f0;
}

.icon-btn.danger:hover {
  background: #fee2e2;
  color: #dc2626;
  border-color: #fecaca;
}

.icon-btn svg {
  width: 16px;
  height: 16px;
}

.history-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 30px 20px;
  text-align: center;
  color: #94a3b8;
}

.history-empty svg {
  width: 48px;
  height: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}

.history-empty p {
  font-size: 14px;
  color: #64748b;
  margin: 0 0 6px 0;
}

.history-empty span {
  font-size: 12px;
  color: #94a3b8;
}

.playback-controls {
  background: #f8fafc;
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.controls-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.control-btns {
  display: flex;
  gap: 4px;
}

.ctrl-btn {
  width: 34px;
  height: 34px;
  border: 1.5px solid #e2e8f0;
  background: #fff;
  border-radius: 8px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  transition: all 0.2s;
}

.ctrl-btn:hover:not(:disabled) {
  background: #e2e8f0;
  color: #1e293b;
}

.ctrl-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ctrl-btn.primary {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}

.ctrl-btn.primary:hover:not(:disabled) {
  background: #1d4ed8;
}

.ctrl-btn.warning {
  background: #f59e0b;
  border-color: #f59e0b;
  color: #fff;
}

.ctrl-btn svg {
  width: 16px;
  height: 16px;
}

.speed-selector {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ctrl-label {
  font-size: 11px;
  color: #64748b;
  font-weight: 500;
}

.speed-btns {
  display: flex;
  gap: 2px;
  background: #fff;
  padding: 2px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
}

.speed-btn {
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 500;
  color: #64748b;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.speed-btn:hover {
  background: #f1f5f9;
  color: #334155;
}

.speed-btn.active {
  background: #2563eb;
  color: #fff;
}

.progress-info {
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  font-variant-numeric: tabular-nums;
}

.progress-slider-wrap {
  padding: 0 2px;
}

.progress-slider {
  width: 100%;
  -webkit-appearance: none;
  appearance: none;
  height: 6px;
  background: #e2e8f0;
  border-radius: 3px;
  outline: none;
}

.progress-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  background: #fff;
  border: 3px solid #059669;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
}

.history-timeline {
  max-height: 340px;
  overflow-y: auto;
  padding-right: 4px;
  margin-right: -4px;
}

.timeline-scroll {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.timeline-item {
  display: flex;
  gap: 10px;
  cursor: pointer;
  padding: 4px;
  border-radius: 8px;
  transition: background 0.15s;
}

.timeline-item:hover {
  background: #f8fafc;
}

.timeline-item.active {
  background: #ecfdf5;
}

.timeline-item.active:hover {
  background: #d1fae5;
}

.timeline-dot-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 16px;
  flex-shrink: 0;
}

.timeline-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #cbd5e1;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px #cbd5e1;
  flex-shrink: 0;
  margin-top: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.timeline-dot:hover {
  background: #2563eb;
  box-shadow: 0 0 0 1px #2563eb;
  transform: scale(1.2);
}

.timeline-item.active .timeline-dot {
  background: #059669;
  box-shadow: 0 0 0 1px #059669;
}

.timeline-dot.playing {
  animation: pulse 1s infinite;
  background: #059669;
  box-shadow: 0 0 0 1px #059669;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.4); opacity: 0.7; }
}

.timeline-line {
  width: 2px;
  flex: 1;
  background: #e2e8f0;
  margin: 3px 0;
  min-height: 10px;
}

.timeline-content {
  flex: 1;
  min-width: 0;
  padding: 2px 0;
}

.timeline-header {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: space-between;
}

.entry-time {
  font-size: 12px;
  font-weight: 600;
  color: #334155;
  font-family: 'SF Mono', Consolas, monospace;
  flex-shrink: 0;
}

.entry-metrics {
  display: flex;
  gap: 4px;
  flex: 1;
}

.metric-dot {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(0,0,0,0.04);
  font-variant-numeric: tabular-nums;
}

.metric-dot.text-red-600 { color: #dc2626; }
.metric-dot.text-amber-600 { color: #d97706; }
.metric-dot.text-emerald-600 { color: #059669; }

.expand-icon {
  width: 14px;
  height: 14px;
  color: #94a3b8;
  transition: transform 0.2s;
  flex-shrink: 0;
}

.expand-icon.rotated {
  transform: rotate(180deg);
}

.entry-detail {
  margin-top: 8px;
  padding: 10px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.changes-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.change-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.change-param {
  font-weight: 600;
  color: #475569;
  width: 40px;
  flex-shrink: 0;
}

.change-old {
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
  text-decoration: line-through;
  font-size: 11px;
}

.change-arrow {
  width: 14px;
  height: 14px;
  color: #cbd5e1;
  flex-shrink: 0;
}

.change-new {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.change-new.up {
  color: #dc2626;
}

.change-new.down {
  color: #059669;
}

.params-row {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  padding-top: 6px;
  border-top: 1px dashed #e2e8f0;
}

.p-tag {
  font-size: 10px;
  padding: 2px 6px;
  background: #f1f5f9;
  border-radius: 4px;
  color: #475569;
  font-weight: 500;
}
</style>
