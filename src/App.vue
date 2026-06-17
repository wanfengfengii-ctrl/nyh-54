<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { usePrintStore } from './stores/printStore'
import ParamPanel from './components/ParamPanel.vue'
import InkCanvas from './components/InkCanvas.vue'
import StatsCharts from './components/StatsCharts.vue'
import RiskAlerts from './components/RiskAlerts.vue'
import SchemeManager from './components/SchemeManager.vue'
import CompareView from './components/CompareView.vue'
import TemplateEditor from './components/TemplateEditor.vue'
import ParamHistory from './components/ParamHistory.vue'
import BatchExperiment from './components/BatchExperiment.vue'
import AgingAnalysis from './components/AgingAnalysis.vue'

const store = usePrintStore()
type LeftTabType = 'params' | 'template' | 'history'
type CenterTabType = 'canvas' | 'charts' | 'experiment' | 'aging'
type RightTabType = 'risk' | 'scheme'

const leftTab = ref<LeftTabType>('params')
const centerTab = ref<CenterTabType>('canvas')
const rightTab = ref<RightTabType>('risk')

onMounted(() => {
  store.init()
})

watch(() => store.params, () => {
  if (store.currentResult) {
    store.recordHistory(store.currentResult)
  }
}, { deep: true })
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <div class="header-inner">
        <div class="brand">
          <div class="brand-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
          </div>
          <div class="brand-text">
            <h1>活版印刷油墨模拟系统</h1>
            <p>Letterpress Ink Transfer Simulation · Pro版</p>
          </div>
        </div>

        <div class="center-tabs">
          <button
            class="center-tab"
            :class="{ active: centerTab === 'canvas' }"
            @click="centerTab = 'canvas'"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span>画布视图</span>
          </button>
          <button
            class="center-tab"
            :class="{ active: centerTab === 'charts' }"
            @click="centerTab = 'charts'"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            <span>数据分析</span>
          </button>
          <button
            class="center-tab"
            :class="{ active: centerTab === 'experiment' }"
            @click="centerTab = 'experiment'"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <span>批量实验</span>
            <span v-if="store.experiments.length" class="tab-badge">
              {{ store.experiments.length }}
            </span>
          </button>
          <button
            class="center-tab"
            :class="{ active: centerTab === 'aging' }"
            @click="centerTab = 'aging'"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span>老化分析</span>
            <span v-if="store.agingAnalyses.length" class="tab-badge" style="background: #7c3aed;">
              {{ store.agingAnalyses.length }}
            </span>
          </button>
        </div>
      </div>
    </header>

    <main class="app-main">
      <div class="main-grid">
        <aside class="left-panel">
          <div class="panel-tabs">
            <button
              class="panel-tab"
              :class="{ active: leftTab === 'params' }"
              @click="leftTab = 'params'"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              参数控制
            </button>
            <button
              class="panel-tab"
              :class="{ active: leftTab === 'template' }"
              @click="leftTab = 'template'"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18M9 21V9" />
              </svg>
              模板编辑
              <span v-if="store.templates.length" class="mini-badge">{{ store.templates.length }}</span>
            </button>
            <button
              class="panel-tab"
              :class="{ active: leftTab === 'history' }"
              @click="leftTab = 'history'"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              历史回放
              <span v-if="store.history.length" class="mini-badge">{{ store.history.length }}</span>
              <span v-if="store.playbackState.isPlaying" class="live-dot"></span>
            </button>
          </div>

          <div class="panel-scroll">
            <div v-show="leftTab === 'params'" class="tab-pane">
              <ParamPanel />
            </div>
            <div v-show="leftTab === 'template'" class="tab-pane">
              <TemplateEditor />
            </div>
            <div v-show="leftTab === 'history'" class="tab-pane">
              <ParamHistory />
            </div>
          </div>
        </aside>

        <section class="center-panel">
          <div v-show="centerTab === 'canvas'" class="tab-content">
            <InkCanvas />
            <div style="height: 12px;"></div>
            <CompareView />
          </div>
          <div v-show="centerTab === 'charts'" class="tab-content">
            <StatsCharts />
          </div>
          <div v-show="centerTab === 'experiment'" class="tab-content">
            <BatchExperiment />
          </div>
          <div v-show="centerTab === 'aging'" class="tab-content">
            <AgingAnalysis />
          </div>
        </section>

        <aside class="right-panel">
          <div class="panel-tabs right-tabs">
            <button
              class="panel-tab"
              :class="{ active: rightTab === 'risk' }"
              @click="rightTab = 'risk'"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              风险分析
            </button>
            <button
              class="panel-tab"
              :class="{ active: rightTab === 'scheme' }"
              @click="rightTab = 'scheme'"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              方案管理
              <span v-if="store.savedSchemes.length" class="mini-badge">{{ store.savedSchemes.length }}</span>
            </button>
          </div>

          <div class="panel-scroll">
            <div v-show="rightTab === 'risk'" class="tab-pane">
              <RiskAlerts />
            </div>
            <div v-show="rightTab === 'scheme'" class="tab-pane">
              <SchemeManager />
            </div>
          </div>
        </aside>
      </div>
    </main>

    <footer class="app-footer">
      <div class="footer-inner">
        <div class="footer-left">
          <span>© 2026 活版印刷油墨模拟系统 Pro</span>
          <div class="stats-pill">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>{{ store.history.length }} 历史</span>
            <span class="sep">·</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
            </svg>
            <span>{{ store.templates.length }} 模板</span>
            <span class="sep">·</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <span>{{ store.experiments.length }} 实验</span>
            <span class="sep">·</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span>{{ store.agingAnalyses.length }} 老化</span>
          </div>
        </div>
        <span class="footer-hint">基于 Vue3 + TypeScript + Pinia + Canvas + ECharts 构建</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #f8fafc;
}

.app-header {
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-inner {
  max-width: 1920px;
  margin: 0 auto;
  padding: 0 24px;
  height: 68px;
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 40px;
  align-items: center;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-logo {
  width: 42px;
  height: 42px;
  background: linear-gradient(135deg, #2563eb, #7c3aed 60%, #d97706);
  border-radius: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
}

.brand-logo svg {
  width: 22px;
  height: 22px;
}

.brand-text h1 {
  font-size: 17px;
  font-weight: 800;
  color: #0f172a;
  margin: 0;
  line-height: 1.2;
  letter-spacing: -0.01em;
  background: linear-gradient(135deg, #0f172a, #2563eb);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.brand-text p {
  font-size: 10.5px;
  color: #94a3b8;
  margin: 2px 0 0 0;
  line-height: 1.2;
  font-family: 'SF Mono', Consolas, monospace;
  letter-spacing: 0.02em;
}

.center-tabs {
  display: flex;
  justify-content: center;
  gap: 2px;
  padding: 4px;
  background: #f1f5f9;
  border-radius: 12px;
  width: fit-content;
  margin: 0 auto;
}

.center-tab {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 18px;
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
  background: transparent;
  border: none;
  border-radius: 9px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.center-tab svg {
  width: 16px;
  height: 16px;
}

.center-tab:hover {
  color: #1e293b;
}

.center-tab.active {
  background: #fff;
  color: #2563eb;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(37, 99, 235, 0.08);
}

.tab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  background: #d97706;
  color: #fff;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
}

.app-main {
  flex: 1;
  max-width: 1920px;
  width: 100%;
  margin: 0 auto;
  padding: 20px 24px;
}

.main-grid {
  display: grid;
  grid-template-columns: 360px 1fr 360px;
  gap: 20px;
  align-items: start;
  min-height: 0;
}

.left-panel,
.right-panel {
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  overflow: hidden;
  max-height: calc(100vh - 132px);
}

.panel-tabs {
  display: flex;
  padding: 8px;
  gap: 2px;
  background: #fafafa;
  border-bottom: 1px solid #f1f5f9;
  flex-shrink: 0;
}

.right-tabs {
  justify-content: stretch;
}

.panel-tabs .panel-tab {
  flex: 1;
}

.panel-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.18s;
  white-space: nowrap;
  position: relative;
}

.panel-tab svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.panel-tab:hover {
  color: #334155;
  background: #f1f5f9;
}

.panel-tab.active {
  background: #fff;
  color: #2563eb;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
}

.mini-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 16px;
  padding: 0 5px;
  background: #e0f2fe;
  color: #0284c7;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.panel-tab.active .mini-badge {
  background: #dbeafe;
  color: #1d4ed8;
}

.live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #10b981;
  animation: pulse 1.4s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.5); }
  50% { opacity: 0.7; box-shadow: 0 0 0 5px rgba(16, 185, 129, 0); }
}

.panel-scroll {
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.tab-pane {
  padding: 0;
  min-height: 300px;
}

.tab-pane > :deep(*) {
  border-radius: 0;
  border: none;
  box-shadow: none;
  padding: 16px;
}

.center-panel {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.tab-content {
  animation: fadeIn 0.25s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.app-footer {
  background: #fff;
  border-top: 1px solid #e2e8f0;
  margin-top: auto;
}

.footer-inner {
  max-width: 1920px;
  margin: 0 auto;
  padding: 12px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #94a3b8;
  gap: 20px;
}

.footer-left {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.stats-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  font-size: 11px;
  color: #64748b;
  font-weight: 500;
}

.stats-pill svg {
  width: 12px;
  height: 12px;
}

.stats-pill .sep {
  color: #cbd5e1;
}

.footer-hint {
  font-family: 'SF Mono', Consolas, monospace;
  font-size: 11px;
}

@media (max-width: 1600px) {
  .main-grid {
    grid-template-columns: 340px 1fr 340px;
  }
  .header-inner {
    grid-template-columns: 260px 1fr;
    gap: 24px;
  }
}

@media (max-width: 1400px) {
  .main-grid {
    grid-template-columns: 330px 1fr;
  }

  .right-panel {
    grid-column: 1 / -1;
    max-height: none;
  }

  .header-inner {
    grid-template-columns: auto 1fr;
  }
}

@media (max-width: 1100px) {
  .main-grid {
    grid-template-columns: 1fr;
  }

  .left-panel,
  .right-panel {
    max-height: none;
  }

  .center-tabs {
    width: 100%;
    overflow-x: auto;
  }

  .center-tab {
    padding: 8px 14px;
    font-size: 12px;
    flex-shrink: 0;
  }

  .header-inner {
    padding: 0 16px;
    height: 60px;
    grid-template-columns: auto;
    gap: 12px;
  }

  .brand {
    justify-content: space-between;
  }

  .brand-text h1 {
    font-size: 15px;
  }

  .app-main {
    padding: 14px;
  }
}

@media (max-width: 720px) {
  .brand-text p {
    display: none;
  }

  .footer-inner {
    flex-direction: column;
    gap: 6px;
    padding: 10px 14px;
    text-align: center;
  }
}

@media (max-width: 520px) {
  .center-tab span:not(.tab-badge) {
    display: none;
  }

  .center-tab svg {
    width: 18px;
    height: 18px;
  }

  .panel-tab {
    padding: 6px 8px;
    font-size: 11px;
  }

  .panel-tab svg {
    width: 13px;
    height: 13px;
  }
}
</style>
