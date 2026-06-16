<script setup lang="ts">
import { ref, computed } from 'vue'
import { usePrintStore } from '../stores/printStore'
import type { SavedScheme } from '../types'

const store = usePrintStore()

const showSaveDialog = ref(false)
const newSchemeName = ref('')
const importError = ref('')
const importSuccess = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)

const canSave = computed(() => store.paramsValid && store.currentResult !== null)

function openSaveDialog() {
  if (!canSave.value) return
  const now = new Date()
  newSchemeName.value = `方案 ${now.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`
  showSaveDialog.value = true
}

function confirmSave() {
  if (!newSchemeName.value.trim()) return
  const result = store.saveScheme(newSchemeName.value.trim())
  if (result) {
    showSaveDialog.value = false
    newSchemeName.value = ''
  }
}

function exportScheme(scheme: SavedScheme) {
  const jsonStr = JSON.stringify(scheme, null, 2)
  const blob = new Blob([jsonStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${scheme.name.replace(/[^\w\u4e00-\u9fa5]/g, '_')}_${Date.now()}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function triggerImport() {
  importError.value = ''
  importSuccess.value = ''
  fileInputRef.value?.click()
}

async function onFileSelected(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    const result = store.importScheme(text)
    if (result.success) {
      importSuccess.value = result.message
      setTimeout(() => importSuccess.value = '', 3000)
    } else {
      importError.value = result.message
    }
  } catch (e) {
    importError.value = '文件读取失败'
  } finally {
    target.value = ''
  }
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getCoverageColor(coverage: number): string {
  if (coverage < 30 || coverage > 95) return 'text-red-600'
  if (coverage < 50 || coverage > 85) return 'text-amber-600'
  return 'text-emerald-600'
}

function getUniformityColor(uniformity: number): string {
  if (uniformity < 50) return 'text-red-600'
  if (uniformity < 70) return 'text-amber-600'
  return 'text-emerald-600'
}
</script>

<template>
  <div class="scheme-manager">
    <div class="manager-header">
      <h3 class="manager-title">
        <svg class="title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
          <polyline points="17 21 17 13 7 13 7 21" />
          <polyline points="7 3 7 8 15 8" />
        </svg>
        方案管理
      </h3>
      <div class="manager-actions">
        <button
          class="action-btn primary"
          :disabled="!canSave"
          @click="openSaveDialog"
          :title="canSave ? '保存当前方案' : '请先设置有效参数'"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
          </svg>
          保存
        </button>
        <button class="action-btn" @click="triggerImport" title="导入JSON方案文件">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          导入
        </button>
        <input
          ref="fileInputRef"
          type="file"
          accept=".json,application/json"
          style="display: none"
          @change="onFileSelected"
        />
      </div>
    </div>

    <div v-if="importError" class="import-msg error">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
      {{ importError }}
    </div>
    <div v-if="importSuccess" class="import-msg success">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
      {{ importSuccess }}
    </div>

    <div v-if="store.compareSchemes.length > 0" class="compare-bar">
      <div class="compare-label">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
        已选 {{ store.compareSchemes.length }} 个方案参与对比
      </div>
      <button class="clear-compare-btn" @click="store.clearCompare()">清空对比</button>
    </div>

    <div v-if="store.savedSchemes.length === 0" class="schemes-empty">
      <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <p>暂无保存的方案</p>
      <span>调整参数后点击「保存」可记录当前配置</span>
    </div>

    <div v-else class="schemes-list">
      <div
        v-for="scheme in store.savedSchemes"
        :key="scheme.id"
        class="scheme-card"
        :class="{ selected: store.compareSchemes.includes(scheme.id) }"
      >
        <div class="scheme-main">
          <label class="compare-checkbox" :title="store.compareSchemes.includes(scheme.id) ? '取消对比' : '加入对比'">
            <input
              type="checkbox"
              :checked="store.compareSchemes.includes(scheme.id)"
              @change="store.toggleCompare(scheme.id)"
            />
            <span class="checkmark"></span>
          </label>
          <div class="scheme-info">
            <div class="scheme-name-row">
              <h4 class="scheme-name" :title="scheme.name">{{ scheme.name }}</h4>
              <span class="scheme-time">{{ formatDate(scheme.createdAt) }}</span>
            </div>
            <div class="scheme-params">
              <span class="param-tag">黏度 {{ scheme.params.viscosity }}cP</span>
              <span class="param-tag">压力 {{ scheme.params.pressure }}MPa</span>
              <span class="param-tag">滚动 {{ scheme.params.rollingCount }}次</span>
              <span v-if="scheme.params.heightDiff > 0" class="param-tag">高差 {{ scheme.params.heightDiff }}μm</span>
            </div>
            <div class="scheme-metrics">
              <div class="metric">
                <span class="label">覆盖率</span>
                <span class="value" :class="getCoverageColor(scheme.result.coverage)">
                  {{ scheme.result.coverage.toFixed(1) }}%
                </span>
              </div>
              <div class="metric">
                <span class="label">均匀度</span>
                <span class="value" :class="getUniformityColor(scheme.result.uniformity)">
                  {{ scheme.result.uniformity.toFixed(1) }}%
                </span>
              </div>
            </div>
          </div>
        </div>
        <div class="scheme-actions">
          <button class="icon-btn load" title="加载此方案" @click="store.loadScheme(scheme.id)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              <polyline points="21 3 12 3 12 12" />
            </svg>
          </button>
          <button class="icon-btn export" title="导出JSON" @click="exportScheme(scheme)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
          <button class="icon-btn delete" title="删除方案" @click="store.deleteScheme(scheme.id)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="showSaveDialog" class="dialog-overlay" @click.self="showSaveDialog = false">
        <div class="dialog">
          <div class="dialog-header">
            <h4>保存方案</h4>
            <button class="dialog-close" @click="showSaveDialog = false">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div class="dialog-body">
            <label class="form-label">方案名称</label>
            <input
              v-model="newSchemeName"
              type="text"
              class="form-input"
              placeholder="请输入方案名称"
              maxlength="50"
              @keyup.enter="confirmSave"
            />
            <div v-if="store.currentResult" class="preview-info">
              <div class="preview-row">
                <span>覆盖率：</span>
                <strong :class="getCoverageColor(store.currentResult.coverage)">
                  {{ store.currentResult.coverage.toFixed(1) }}%
                </strong>
              </div>
              <div class="preview-row">
                <span>均匀度：</span>
                <strong :class="getUniformityColor(store.currentResult.uniformity)">
                  {{ store.currentResult.uniformity.toFixed(1) }}%
                </strong>
              </div>
            </div>
          </div>
          <div class="dialog-footer">
            <button class="btn-secondary" @click="showSaveDialog = false">取消</button>
            <button class="btn-primary" :disabled="!newSchemeName.trim()" @click="confirmSave">确认保存</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.scheme-manager {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  border: 1px solid #e2e8f0;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.manager-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f1f5f9;
  flex-shrink: 0;
}

.manager-title {
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

.manager-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 7px 12px;
  font-size: 12px;
  font-weight: 500;
  color: #475569;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover:not(:disabled) {
  background: #e2e8f0;
  border-color: #cbd5e1;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn svg {
  width: 14px;
  height: 14px;
}

.action-btn.primary {
  background: #2563eb;
  color: #fff;
  border-color: #2563eb;
}

.action-btn.primary:hover:not(:disabled) {
  background: #1d4ed8;
  border-color: #1d4ed8;
}

.import-msg {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 13px;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.import-msg svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.import-msg.error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #dc2626;
}

.import-msg.success {
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #059669;
}

.compare-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.compare-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #1d4ed8;
  font-weight: 500;
}

.compare-label svg {
  width: 14px;
  height: 14px;
}

.clear-compare-btn {
  padding: 4px 10px;
  font-size: 11px;
  color: #1d4ed8;
  background: transparent;
  border: 1px solid #93c5fd;
  border-radius: 4px;
  cursor: pointer;
}

.clear-compare-btn:hover {
  background: #dbeafe;
}

.schemes-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  padding: 30px 20px;
  text-align: center;
}

.empty-icon {
  width: 48px;
  height: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}

.schemes-empty p {
  font-size: 14px;
  margin: 0 0 6px 0;
  color: #64748b;
}

.schemes-empty span {
  font-size: 12px;
  color: #94a3b8;
}

.schemes-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.scheme-card {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  transition: all 0.2s;
}

.scheme-card:hover {
  border-color: #cbd5e1;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}

.scheme-card.selected {
  border-color: #2563eb;
  background: #eff6ff;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
}

.scheme-main {
  display: flex;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.compare-checkbox {
  position: relative;
  display: flex;
  align-items: flex-start;
  padding-top: 2px;
  cursor: pointer;
  flex-shrink: 0;
}

.compare-checkbox input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.checkmark {
  width: 18px;
  height: 18px;
  border: 2px solid #cbd5e1;
  border-radius: 4px;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.compare-checkbox input:checked ~ .checkmark {
  background: #2563eb;
  border-color: #2563eb;
}

.compare-checkbox input:checked ~ .checkmark::after {
  content: '';
  width: 5px;
  height: 9px;
  border: solid white;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg) translate(-1px, -1px);
}

.scheme-info {
  flex: 1;
  min-width: 0;
}

.scheme-name-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.scheme-name {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.scheme-time {
  font-size: 10px;
  color: #94a3b8;
  flex-shrink: 0;
}

.scheme-params {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}

.param-tag {
  display: inline-block;
  padding: 2px 7px;
  font-size: 10px;
  color: #475569;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  white-space: nowrap;
}

.scheme-metrics {
  display: flex;
  gap: 16px;
}

.metric {
  display: flex;
  align-items: center;
  gap: 5px;
}

.metric .label {
  font-size: 10px;
  color: #94a3b8;
}

.metric .value {
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.scheme-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.icon-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.icon-btn svg {
  width: 14px;
  height: 14px;
}

.icon-btn:hover {
  background: rgba(0, 0, 0, 0.06);
}

.icon-btn.load:hover {
  background: #dbeafe;
  color: #2563eb;
}

.icon-btn.export:hover {
  background: #dcfce7;
  color: #059669;
}

.icon-btn.delete:hover {
  background: #fee2e2;
  color: #dc2626;
}

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
  width: 400px;
  max-width: calc(100vw - 32px);
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.2);
  overflow: hidden;
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
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
}

.dialog-close:hover {
  background: #e2e8f0;
}

.dialog-close svg {
  width: 16px;
  height: 16px;
}

.dialog-body {
  padding: 20px;
}

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #334155;
  margin-bottom: 8px;
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
  transition: all 0.2s;
  box-sizing: border-box;
}

.form-input:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.preview-info {
  margin-top: 16px;
  padding: 12px;
  background: #f8fafc;
  border-radius: 8px;
}

.preview-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
  font-size: 13px;
  color: #64748b;
}

.preview-row strong {
  font-variant-numeric: tabular-nums;
  font-size: 14px;
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

.btn-secondary:hover {
  background: #f8fafc;
}

.btn-primary {
  background: #2563eb;
  color: #fff;
  border: 1px solid #2563eb;
}

.btn-primary:hover:not(:disabled) {
  background: #1d4ed8;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
