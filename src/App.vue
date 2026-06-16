<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { usePrintStore } from './stores/printStore'
import ParamPanel from './components/ParamPanel.vue'
import InkCanvas from './components/InkCanvas.vue'
import StatsCharts from './components/StatsCharts.vue'
import RiskAlerts from './components/RiskAlerts.vue'
import SchemeManager from './components/SchemeManager.vue'
import CompareView from './components/CompareView.vue'

const store = usePrintStore()
const activeTab = ref<'canvas' | 'charts'>('canvas')

onMounted(() => {
  store.init()
})
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
            <p>Letterpress Ink Transfer Simulation</p>
          </div>
        </div>
        <div class="header-tabs">
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'canvas' }"
            @click="activeTab = 'canvas'"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            画布视图
          </button>
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'charts' }"
            @click="activeTab = 'charts'"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            数据分析
          </button>
        </div>
      </div>
    </header>

    <main class="app-main">
      <div class="main-grid">
        <aside class="left-panel">
          <ParamPanel />
          <div style="height: 16px;"></div>
          <SchemeManager />
        </aside>

        <section class="center-panel">
          <div v-show="activeTab === 'canvas'" class="tab-content">
            <InkCanvas />
            <div style="height: 8px;"></div>
            <CompareView />
          </div>
          <div v-show="activeTab === 'charts'" class="tab-content">
            <StatsCharts />
          </div>
        </section>

        <aside class="right-panel">
          <RiskAlerts />
        </aside>
      </div>
    </main>

    <footer class="app-footer">
      <div class="footer-inner">
        <span>© 2026 活版印刷油墨模拟系统</span>
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
  max-width: 1800px;
  margin: 0 auto;
  padding: 0 24px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-logo {
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}

.brand-logo svg {
  width: 22px;
  height: 22px;
}

.brand-text h1 {
  font-size: 17px;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
  line-height: 1.3;
  letter-spacing: -0.01em;
}

.brand-text p {
  font-size: 11px;
  color: #94a3b8;
  margin: 0;
  line-height: 1.2;
  font-family: 'SF Mono', Consolas, monospace;
}

.header-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: #f1f5f9;
  border-radius: 10px;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  color: #64748b;
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn svg {
  width: 16px;
  height: 16px;
}

.tab-btn:hover {
  color: #334155;
}

.tab-btn.active {
  background: #fff;
  color: #2563eb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.app-main {
  flex: 1;
  max-width: 1800px;
  width: 100%;
  margin: 0 auto;
  padding: 20px 24px;
}

.main-grid {
  display: grid;
  grid-template-columns: 340px 1fr 340px;
  gap: 20px;
  align-items: start;
}

.left-panel,
.right-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: sticky;
  top: 84px;
  max-height: calc(100vh - 108px);
  overflow-y: auto;
  padding-right: 4px;
  margin-right: -4px;
}

.right-panel {
  min-height: 500px;
}

.center-panel {
  min-width: 0;
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
  max-width: 1800px;
  margin: 0 auto;
  padding: 14px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #94a3b8;
}

.footer-hint {
  font-family: 'SF Mono', Consolas, monospace;
  font-size: 11px;
}

@media (max-width: 1400px) {
  .main-grid {
    grid-template-columns: 320px 1fr;
  }

  .right-panel {
    grid-column: 1 / -1;
    position: static;
    max-height: none;
    flex-direction: row;
    flex-wrap: wrap;
  }

  .right-panel > * {
    flex: 1 1 400px;
  }
}

@media (max-width: 1024px) {
  .main-grid {
    grid-template-columns: 1fr;
  }

  .left-panel,
  .right-panel {
    position: static;
    max-height: none;
  }

  .header-inner {
    padding: 0 16px;
    height: 56px;
  }

  .app-main {
    padding: 16px;
  }

  .brand-text h1 {
    font-size: 15px;
  }

  .tab-btn {
    padding: 6px 12px;
    font-size: 12px;
  }

  .footer-inner {
    flex-direction: column;
    gap: 4px;
    padding: 12px 16px;
    text-align: center;
  }
}

@media (max-width: 640px) {
  .brand-text p {
    display: none;
  }

  .header-tabs {
    padding: 3px;
  }

  .tab-btn span {
    display: none;
  }

  .tab-btn svg {
    width: 18px;
    height: 18px;
  }

  .tab-btn {
    padding: 8px;
  }
}
</style>
