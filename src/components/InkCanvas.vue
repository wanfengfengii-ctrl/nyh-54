<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { usePrintStore } from '../stores/printStore'
import { GRID_WIDTH, GRID_HEIGHT } from '../types'
import type { SimulationResult } from '../types'

interface Props {
  result?: SimulationResult | null
  title?: string
  showLegend?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showLegend: true
})

const store = usePrintStore()
const canvasRef = ref<HTMLCanvasElement | null>(null)

const activeResult = computed(() => props.result ?? store.currentResult)

const CANVAS_WIDTH = 720
const CANVAS_HEIGHT = 480

function getInkColor(thickness: number): string {
  if (thickness <= 0.02) return 'rgba(255, 255, 255, 0)'
  const t = Math.max(0, Math.min(1, thickness))
  
  if (t < 0.15) {
    const alpha = (t / 0.15) * 0.5
    return `rgba(30, 30, 60, ${alpha})`
  }
  
  const r = Math.floor(30 + (1 - t) * 40)
  const g = Math.floor(20 + (1 - t) * 30)
  const b = Math.floor(50 + (1 - t) * 40)
  const a = 0.5 + t * 0.5
  
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

function render() {
  const canvas = canvasRef.value
  const result = activeResult.value
  if (!canvas || !result) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  canvas.width = CANVAS_WIDTH * dpr
  canvas.height = CANVAS_HEIGHT * dpr
  canvas.style.width = CANVAS_WIDTH + 'px'
  canvas.style.height = CANVAS_HEIGHT + 'px'
  ctx.scale(dpr, dpr)

  ctx.fillStyle = '#faf9f7'
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  const cellW = CANVAS_WIDTH / GRID_WIDTH
  const cellH = CANVAS_HEIGHT / GRID_HEIGHT

  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      const thickness = result.thicknessMap[y][x]
      if (thickness > 0.02) {
        ctx.fillStyle = getInkColor(thickness)
        const px = x * cellW
        const py = y * cellH
        ctx.fillRect(px, py, cellW + 0.5, cellH + 0.5)
      }
    }
  }

  ctx.strokeStyle = 'rgba(200, 190, 180, 0.4)'
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, CANVAS_WIDTH - 2, CANVAS_HEIGHT - 2)

  drawPaperTexture(ctx)
}

function drawPaperTexture(ctx: CanvasRenderingContext2D) {
  ctx.save()
  ctx.globalAlpha = 0.03
  ctx.fillStyle = '#000'
  for (let i = 0; i < 500; i++) {
    const x = Math.random() * CANVAS_WIDTH
    const y = Math.random() * CANVAS_HEIGHT
    ctx.fillRect(x, y, 1, 1)
  }
  ctx.restore()
}

function renderLegend() {
  const canvas = document.getElementById('ink-legend-canvas') as HTMLCanvasElement
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const width = canvas.width
  const height = canvas.height
  const gradient = ctx.createLinearGradient(0, 0, width, 0)
  
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
  gradient.addColorStop(0.15, 'rgba(60, 50, 70, 0.2)')
  gradient.addColorStop(0.4, 'rgba(40, 32, 55, 0.55)')
  gradient.addColorStop(0.7, 'rgba(25, 20, 45, 0.8)')
  gradient.addColorStop(1, 'rgba(15, 10, 30, 1)')

  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
}

onMounted(() => {
  render()
  if (props.showLegend) {
    renderLegend()
  }
})

watch(
  () => [activeResult.value],
  () => {
    render()
  },
  { deep: true }
)
</script>

<template>
  <div class="ink-canvas-wrapper">
    <div v-if="title" class="canvas-title">{{ title }}</div>
    <div class="canvas-container">
      <canvas ref="canvasRef" class="ink-canvas"></canvas>
      <div v-if="!activeResult" class="canvas-overlay">
        <div class="overlay-content">
          <svg class="placeholder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18M9 21V9" />
          </svg>
          <p>等待参数输入...</p>
        </div>
      </div>
    </div>
    <div v-if="showLegend && activeResult" class="legend-section">
      <div class="legend-labels">
        <span>无墨</span>
        <span>薄墨</span>
        <span>适中</span>
        <span>厚墨</span>
        <span>饱和</span>
      </div>
      <canvas id="ink-legend-canvas" width="400" height="16" class="legend-bar"></canvas>
      <div class="legend-metrics" v-if="!props.result">
        <div class="metric-item">
          <span class="metric-label">覆盖率</span>
          <span class="metric-value coverage">{{ activeResult.coverage.toFixed(1) }}%</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">均匀度</span>
          <span class="metric-value uniformity">{{ activeResult.uniformity.toFixed(1) }}%</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">平均墨厚</span>
          <span class="metric-value">{{ (activeResult.averageThickness * 100).toFixed(1) }}%</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ink-canvas-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.canvas-title {
  font-size: 15px;
  font-weight: 600;
  color: #334155;
  text-align: center;
  padding-bottom: 4px;
  border-bottom: 2px solid #e2e8f0;
  width: 100%;
}

.canvas-container {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  background: #faf9f7;
}

.ink-canvas {
  display: block;
  border-radius: 8px;
}

.canvas-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
}

.overlay-content {
  text-align: center;
  color: #94a3b8;
}

.placeholder-icon {
  width: 48px;
  height: 48px;
  margin-bottom: 12px;
}

.overlay-content p {
  font-size: 14px;
  margin: 0;
}

.legend-section {
  width: 100%;
  max-width: 720px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.legend-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #64748b;
  padding: 0 2px;
}

.legend-bar {
  width: 100%;
  height: 16px;
  border-radius: 4px;
  display: block;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.1);
}

.legend-metrics {
  display: flex;
  justify-content: space-around;
  padding: 10px 12px;
  background: #f8fafc;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
}

.metric-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.metric-label {
  font-size: 11px;
  color: #64748b;
}

.metric-value {
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
  font-variant-numeric: tabular-nums;
}

.metric-value.coverage {
  color: #2563eb;
}

.metric-value.uniformity {
  color: #059669;
}
</style>
