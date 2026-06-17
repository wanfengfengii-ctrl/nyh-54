<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { usePrintStore } from '../stores/printStore'
import type { PlateShape, ShapeType } from '../types'
import { TEMPLATE_PRESETS, GRID_WIDTH, GRID_HEIGHT, LOCAL_HEIGHT_RANGE } from '../types'

const store = usePrintStore()
const canvasRef = ref<HTMLCanvasElement | null>(null)
const templateNameInput = ref('')
const showImportDialog = ref(false)
const importError = ref('')
const importSuccess = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)

const activeTool = ref<ShapeType | null>(null)
const isDragging = ref(false)
const dragStart = ref<{ x: number; y: number } | null>(null)
const dragCurrent = ref<{ x: number; y: number } | null>(null)
const freehandPoints = ref<{ x: number; y: number }[]>([])
const showTextDialog = ref(false)
const newTextContent = ref('')
const textClickPos = ref<{ x: number; y: number } | null>(null)

const CANVAS_W = 720
const CANVAS_H = 480
const SCALE_X = CANVAS_W / GRID_WIDTH
const SCALE_Y = CANVAS_H / GRID_HEIGHT

const selectedShape = computed<PlateShape | null>(() => {
  if (!store.activeTemplate || !store.selectedShapeId) return null
  return store.activeTemplate.shapes.find(s => s.id === store.selectedShapeId) ?? null
})

function render() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  canvas.width = CANVAS_W * dpr
  canvas.height = CANVAS_H * dpr
  canvas.style.width = CANVAS_W + 'px'
  canvas.style.height = CANVAS_H + 'px'
  ctx.scale(dpr, dpr)

  ctx.fillStyle = '#faf9f7'
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

  ctx.strokeStyle = '#e2e8f0'
  ctx.lineWidth = 0.5
  for (let x = 0; x <= GRID_WIDTH; x += 20) {
    ctx.beginPath()
    ctx.moveTo(x * SCALE_X, 0)
    ctx.lineTo(x * SCALE_X, CANVAS_H)
    ctx.stroke()
  }
  for (let y = 0; y <= GRID_HEIGHT; y += 20) {
    ctx.beginPath()
    ctx.moveTo(0, y * SCALE_Y)
    ctx.lineTo(CANVAS_W, y * SCALE_Y)
    ctx.stroke()
  }

  const tpl = store.activeTemplate
  if (tpl) {
    const maxH = LOCAL_HEIGHT_RANGE.max
    for (const shape of tpl.shapes) {
      const alpha = 0.3 + (shape.localHeight / maxH) * 0.6
      ctx.globalAlpha = alpha
      ctx.fillStyle = shape.color
      drawShape(ctx, shape)
      ctx.globalAlpha = 1

      if (store.selectedShapeId === shape.id) {
        ctx.strokeStyle = '#2563eb'
        ctx.lineWidth = 3
        ctx.setLineDash([6, 4])
        drawShapeOutline(ctx, shape)
        ctx.setLineDash([])
        drawHandles(ctx, shape)
      } else {
        ctx.strokeStyle = shape.color
        ctx.lineWidth = 1.5
        drawShapeOutline(ctx, shape)
      }

      if (shape.label && shape.width >= 20 * SCALE_X) {
        ctx.globalAlpha = 1
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 11px -apple-system, system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const cx = (shape.x + shape.width / 2) * SCALE_X
        const cy = (shape.y + shape.height / 2) * SCALE_Y
        ctx.fillText(shape.label, cx, cy)
      }
    }
  }

  if (isDragging.value && activeTool.value) {
    if (activeTool.value === 'freehand' && freehandPoints.value.length > 1) {
      ctx.globalAlpha = 0.5
      ctx.fillStyle = '#6366f1'
      ctx.strokeStyle = '#4f46e5'
      ctx.lineWidth = 2
      ctx.beginPath()
      freehandPoints.value.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y)
        else ctx.lineTo(p.x, p.y)
      })
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.globalAlpha = 1
    } else if (dragStart.value && dragCurrent.value) {
      const x = Math.min(dragStart.value.x, dragCurrent.value.x)
      const y = Math.min(dragStart.value.y, dragCurrent.value.y)
      const w = Math.abs(dragCurrent.value.x - dragStart.value.x)
      const h = Math.abs(dragCurrent.value.y - dragStart.value.y)

      ctx.globalAlpha = 0.5
      ctx.fillStyle = '#6366f1'
      ctx.strokeStyle = '#4f46e5'
      ctx.lineWidth = 2
      ctx.setLineDash([4, 4])

      if (activeTool.value === 'rectangle' || activeTool.value === 'text') {
        ctx.fillRect(x, y, w, h)
        ctx.strokeRect(x, y, w, h)
      } else if (activeTool.value === 'circle' || activeTool.value === 'ellipse') {
        ctx.beginPath()
        const rx = w / 2
        const ry = h / 2
        if (activeTool.value === 'circle') {
          const r = Math.min(rx, ry)
          ctx.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2)
        } else {
          ctx.ellipse(x + w / 2, y + h / 2, rx, ry, 0, 0, Math.PI * 2)
        }
        ctx.fill()
        ctx.stroke()
      }
      ctx.setLineDash([])
      ctx.globalAlpha = 1
    }
  }

  ctx.strokeStyle = '#94a3b8'
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, CANVAS_W - 2, CANVAS_H - 2)
}

function drawShape(ctx: CanvasRenderingContext2D, shape: PlateShape) {
  const x = shape.x * SCALE_X
  const y = shape.y * SCALE_Y
  const w = shape.width * SCALE_X
  const h = shape.height * SCALE_Y
  const cx = x + w / 2
  const cy = y + h / 2

  ctx.save()
  if (shape.rotation !== 0) {
    ctx.translate(cx, cy)
    ctx.rotate((shape.rotation * Math.PI) / 180)
    ctx.translate(-cx, -cy)
  }

  switch (shape.type) {
    case 'rectangle':
      ctx.fillRect(x, y, w, h)
      break
    case 'text':
      ctx.fillRect(x, y, w, h)
      ctx.globalAlpha = 1
      ctx.fillStyle = '#fff'
      const fontSize = Math.max(12, Math.min(h * 0.6, 36))
      ctx.font = `bold ${fontSize}px -apple-system, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const displayText = shape.text || shape.label || '文字'
      ctx.fillText(displayText, cx, cy)
      break
    case 'circle': {
      const r = Math.min(w, h) / 2
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'ellipse':
      ctx.beginPath()
      ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'polygon':
    case 'freehand':
      if (shape.points && shape.points.length >= 3) {
        ctx.beginPath()
        shape.points.forEach((p, i) => {
          const px = x + p.x * w
          const py = y + p.y * h
          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        })
        ctx.closePath()
        ctx.fill()
      }
      break
  }
  ctx.restore()
}

function drawShapeOutline(ctx: CanvasRenderingContext2D, shape: PlateShape) {
  const x = shape.x * SCALE_X
  const y = shape.y * SCALE_Y
  const w = shape.width * SCALE_X
  const h = shape.height * SCALE_Y
  const cx = x + w / 2
  const cy = y + h / 2

  ctx.save()
  if (shape.rotation !== 0) {
    ctx.translate(cx, cy)
    ctx.rotate((shape.rotation * Math.PI) / 180)
    ctx.translate(-cx, -cy)
  }

  ctx.beginPath()
  switch (shape.type) {
    case 'rectangle':
    case 'text':
      ctx.strokeRect(x, y, w, h)
      break
    case 'circle': {
      const r = Math.min(w, h) / 2
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.stroke()
      break
    }
    case 'ellipse':
      ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2)
      ctx.stroke()
      break
    case 'polygon':
    case 'freehand':
      if (shape.points && shape.points.length >= 3) {
        shape.points.forEach((p, i) => {
          const px = x + p.x * w
          const py = y + p.y * h
          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        })
        ctx.closePath()
        ctx.stroke()
      }
      break
  }
  ctx.restore()
}

function drawHandles(ctx: CanvasRenderingContext2D, shape: PlateShape) {
  const x = shape.x * SCALE_X
  const y = shape.y * SCALE_Y
  const w = shape.width * SCALE_X
  const h = shape.height * SCALE_Y
  const handles = [
    [x, y], [x + w / 2, y], [x + w, y],
    [x, y + h / 2], [x + w, y + h / 2],
    [x, y + h], [x + w / 2, y + h], [x + w, y + h]
  ]
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#2563eb'
  ctx.lineWidth = 1.5
  for (const [hx, hy] of handles) {
    ctx.fillRect(hx - 4, hy - 4, 8, 8)
    ctx.strokeRect(hx - 4, hy - 4, 8, 8)
  }
}

function canvasToGrid(e: MouseEvent): { x: number; y: number } {
  const canvas = canvasRef.value
  if (!canvas) return { x: 0, y: 0 }
  const rect = canvas.getBoundingClientRect()
  const x = ((e.clientX - rect.left) / rect.width) * CANVAS_W
  const y = ((e.clientY - rect.top) / rect.height) * CANVAS_H
  return { x, y }
}

function onMouseDown(e: MouseEvent) {
  if (!store.activeTemplate) return
  const pos = canvasToGrid(e)

  if (activeTool.value === 'text') {
    textClickPos.value = pos
    newTextContent.value = ''
    showTextDialog.value = true
    return
  }

  if (activeTool.value) {
    isDragging.value = true
    dragStart.value = pos
    dragCurrent.value = pos
    if (activeTool.value === 'freehand') {
      freehandPoints.value = [pos]
    }
  } else {
    const gx = pos.x / SCALE_X
    const gy = pos.y / SCALE_Y
    const shapes = [...store.activeTemplate.shapes].reverse()
    let found: PlateShape | null = null
    for (const s of shapes) {
      if (gx >= s.x && gx <= s.x + s.width && gy >= s.y && gy <= s.y + s.height) {
        found = s
        break
      }
    }
    store.selectShape(found?.id ?? null)
  }
  render()
}

function onMouseMove(e: MouseEvent) {
  if (!isDragging.value) return
  const pos = canvasToGrid(e)
  if (activeTool.value === 'freehand') {
    freehandPoints.value.push(pos)
  } else {
    dragCurrent.value = pos
  }
  render()
}

function onMouseUp() {
  if (!isDragging.value || !store.activeTemplate || !activeTool.value) {
    isDragging.value = false
    dragStart.value = null
    dragCurrent.value = null
    freehandPoints.value = []
    return
  }

  const colors = ['#1e293b', '#334155', '#475569', '#3b82f6', '#059669', '#d97706', '#7c3aed', '#dc2626']
  const shapeCount = store.activeTemplate.shapes.length
  const color = colors[shapeCount % colors.length]

  if (activeTool.value === 'freehand') {
    if (freehandPoints.value.length < 3) {
      isDragging.value = false
      freehandPoints.value = []
      activeTool.value = null
      render()
      return
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of freehandPoints.value) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
    const w = maxX - minX
    const h = maxY - minY
    if (w < 5 || h < 5) {
      isDragging.value = false
      freehandPoints.value = []
      activeTool.value = null
      render()
      return
    }
    const points = freehandPoints.value.map(p => ({
      x: (p.x - minX) / w,
      y: (p.y - minY) / h
    }))
    store.addShape(store.activeTemplate.id, {
      type: 'freehand',
      x: Math.round((minX / SCALE_X) * 10) / 10,
      y: Math.round((minY / SCALE_Y) * 10) / 10,
      width: Math.round((w / SCALE_X) * 10) / 10,
      height: Math.round((h / SCALE_Y) * 10) / 10,
      localHeight: 30,
      rotation: 0,
      color,
      label: `手绘 ${shapeCount + 1}`,
      points
    })
  } else if (dragStart.value && dragCurrent.value) {
    const x1 = Math.min(dragStart.value.x, dragCurrent.value.x) / SCALE_X
    const y1 = Math.min(dragStart.value.y, dragCurrent.value.y) / SCALE_Y
    const x2 = Math.max(dragStart.value.x, dragCurrent.value.x) / SCALE_X
    const y2 = Math.max(dragStart.value.y, dragCurrent.value.y) / SCALE_Y
    const w = Math.max(2, x2 - x1)
    const h = Math.max(2, y2 - y1)

    if (w < 3 || h < 3) {
      isDragging.value = false
      dragStart.value = null
      dragCurrent.value = null
      activeTool.value = null
      render()
      return
    }

    store.addShape(store.activeTemplate.id, {
      type: activeTool.value,
      x: Math.round(x1 * 10) / 10,
      y: Math.round(y1 * 10) / 10,
      width: Math.round(w * 10) / 10,
      height: Math.round(h * 10) / 10,
      localHeight: 30,
      rotation: 0,
      color,
      label: activeTool.value === 'text' ? '文字' : `形状 ${shapeCount + 1}`,
      text: activeTool.value === 'text' ? '文字' : undefined
    })
  }

  isDragging.value = false
  dragStart.value = null
  dragCurrent.value = null
  freehandPoints.value = []
  activeTool.value = null
  render()
}

function confirmTextCreation() {
  if (!store.activeTemplate || !textClickPos.value) return
  const text = newTextContent.value.trim() || '文字'
  const colors = ['#1e293b', '#334155', '#475569', '#3b82f6', '#059669', '#d97706', '#7c3aed', '#dc2626']
  const shapeCount = store.activeTemplate.shapes.length
  const color = colors[shapeCount % colors.length]
  
  const charWidth = 14
  const textWidth = text.length * charWidth
  const textHeight = 28
  
  const gx = textClickPos.value!.x / SCALE_X
  const gy = textClickPos.value!.y / SCALE_Y
  
  store.addShape(store.activeTemplate.id, {
    type: 'text',
    x: Math.round((gx - textWidth / 2 / SCALE_X * 0) * 10) / 10,
    y: Math.round((gy - textHeight / 2 / SCALE_Y * 0) * 10) / 10,
    width: Math.max(15, textWidth / SCALE_X * 4),
    height: Math.max(8, textHeight / SCALE_Y * 4),
    localHeight: 30,
    rotation: 0,
    color,
    label: text,
    text
  })
  
  showTextDialog.value = false
  textClickPos.value = null
  newTextContent.value = ''
  activeTool.value = null
  render()
}

function cancelTextCreation() {
  showTextDialog.value = false
  textClickPos.value = null
  newTextContent.value = ''
  activeTool.value = null
}

function updateSelectedShapeField<K extends keyof PlateShape>(key: K, value: PlateShape[K]) {
  if (!store.activeTemplate || !store.selectedShapeId) return
  store.updateShape(store.activeTemplate.id, store.selectedShapeId, { [key]: value })
  render()
}

function deleteSelectedShape() {
  if (!store.activeTemplate || !store.selectedShapeId) return
  store.deleteShape(store.activeTemplate.id, store.selectedShapeId)
  render()
}

function createFromPreset(name: string) {
  store.createTemplate(name)
  templateNameInput.value = store.activeTemplate?.name || ''
  render()
}

function createNewTemplate() {
  store.createTemplate(undefined, `自定义模板 ${store.templates.length + 1}`)
  templateNameInput.value = store.activeTemplate?.name || ''
  render()
}

function selectTemplate(id: string) {
  store.setActiveTemplate(id === store.activeTemplateId ? null : id)
  templateNameInput.value = store.activeTemplate?.name || ''
  render()
}

function renameTemplate() {
  if (!store.activeTemplate || !templateNameInput.value.trim()) return
  store.updateTemplate(store.activeTemplate.id, { name: templateNameInput.value.trim() })
}

function deleteActiveTemplate() {
  if (!store.activeTemplate) return
  if (confirm(`确定删除模板「${store.activeTemplate.name}」吗？`)) {
    store.deleteTemplate(store.activeTemplate.id)
    templateNameInput.value = ''
    render()
  }
}

function triggerTemplateImport() {
  importError.value = ''
  importSuccess.value = ''
  fileInputRef.value?.click()
}

async function onTemplateFileSelected(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const result = store.importTemplate(text)
    if (result.success) {
      importSuccess.value = result.message
      templateNameInput.value = store.activeTemplate?.name || ''
      setTimeout(() => importSuccess.value = '', 3000)
    } else {
      importError.value = result.message
    }
  } catch (e) {
    importError.value = '文件读取失败'
  } finally {
    target.value = ''
    render()
  }
}

function exportActiveTemplate() {
  if (!store.activeTemplate) return
  store.exportTemplate(store.activeTemplate.id)
}

watch(() => [store.activeTemplate, store.selectedShapeId, store.activeTemplate?.shapes], () => {
  render()
}, { deep: true })

onMounted(() => {
  render()
  if (store.activeTemplate) {
    templateNameInput.value = store.activeTemplate.name
  }
})
</script>

<template>
  <div class="template-editor">
    <div class="editor-header">
      <h3 class="panel-title">
        <svg class="title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
        印版区域模板编辑
      </h3>
    </div>

    <div class="template-toolbar">
      <div class="preset-btns">
        <button
          v-for="preset in TEMPLATE_PRESETS"
          :key="preset.name"
          class="preset-btn"
          @click="createFromPreset(preset.name)"
          :title="preset.description"
        >
          {{ preset.name }}
        </button>
        <button class="preset-btn new" @click="createNewTemplate">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          新建
        </button>
      </div>
      <div class="io-btns">
        <button class="icon-btn" @click="triggerTemplateImport" title="导入模板">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </button>
        <button
          class="icon-btn"
          :disabled="!store.activeTemplate"
          @click="exportActiveTemplate"
          title="导出模板"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
        <input
          ref="fileInputRef"
          type="file"
          accept=".json"
          style="display:none"
          @change="onTemplateFileSelected"
        />
      </div>
    </div>

    <div v-if="importError" class="msg-bar error">{{ importError }}</div>
    <div v-if="importSuccess" class="msg-bar success">{{ importSuccess }}</div>

    <div v-if="store.templates.length > 0" class="template-list">
      <div class="list-label">已有模板：</div>
      <div class="template-chips">
        <button
          v-for="t in store.templates"
          :key="t.id"
          class="template-chip"
          :class="{ active: t.id === store.activeTemplateId }"
          @click="selectTemplate(t.id)"
        >
          {{ t.name }}
          <span class="chip-count">{{ t.shapes.length }}</span>
        </button>
      </div>
    </div>

    <div v-if="store.activeTemplate" class="template-detail">
      <div class="template-name-row">
        <input
          v-model="templateNameInput"
          type="text"
          class="name-input"
          placeholder="模板名称"
          @blur="renameTemplate"
          @keyup.enter="renameTemplate"
        />
        <button
          class="icon-btn danger"
          @click="deleteActiveTemplate"
          title="删除模板"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>

      <div class="shape-tools">
        <div class="tools-label">添加形状：</div>
        <div class="tool-btns">
          <button
            class="tool-btn"
            :class="{ active: activeTool === 'rectangle' }"
            @click="activeTool = activeTool === 'rectangle' ? null : 'rectangle'"
            title="矩形"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="5" width="18" height="14" rx="1" />
            </svg>
          </button>
          <button
            class="tool-btn"
            :class="{ active: activeTool === 'circle' }"
            @click="activeTool = activeTool === 'circle' ? null : 'circle'"
            title="圆形"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="9" />
            </svg>
          </button>
          <button
            class="tool-btn"
            :class="{ active: activeTool === 'ellipse' }"
            @click="activeTool = activeTool === 'ellipse' ? null : 'ellipse'"
            title="椭圆"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <ellipse cx="12" cy="12" rx="10" ry="7" />
            </svg>
          </button>
          <button
            class="tool-btn"
            :class="{ active: activeTool === 'polygon' }"
            @click="() => { const tri = [[0.5,0],[1,1],[0,1]]; if(store.activeTemplate) { store.addShape(store.activeTemplate.id, { type: 'polygon', x: 40, y: 25, width: 40, height: 30, localHeight: 30, rotation: 0, color: '#7c3aed', label: '三角形', points: tri.map(p => ({x: p[0], y: p[1]})) }); render(); }}"
            title="三角形"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="12,3 21,21 3,21" />
            </svg>
          </button>
          <button
            class="tool-btn"
            :class="{ active: activeTool === 'freehand' }"
            @click="activeTool = activeTool === 'freehand' ? null : 'freehand'"
            title="自由手绘"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 19l7-7 3 3-7 7-3-3z" />
              <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
              <path d="M2 2l7.586 7.586" />
              <circle cx="11" cy="11" r="2" />
            </svg>
          </button>
          <button
            class="tool-btn"
            :class="{ active: activeTool === 'text' }"
            @click="activeTool = activeTool === 'text' ? null : 'text'"
            title="文本"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="4 7 4 4 20 4 20 7" />
              <line x1="9" y1="20" x2="15" y2="20" />
              <line x1="12" y1="4" x2="12" y2="20" />
            </svg>
          </button>
        </div>
        <div v-if="activeTool" class="hint">在画布上{{ activeTool === 'text' ? '点击以添加文本' : activeTool === 'freehand' ? '拖拽进行手绘' : '拖拽以绘制' }}{{ activeTool === 'rectangle' ? '矩形' : activeTool === 'circle' ? '圆形' : activeTool === 'ellipse' ? '椭圆' : activeTool === 'polygon' ? '多边形' : activeTool === 'freehand' ? '形状' : activeTool === 'text' ? '' : '' }}</div>
      </div>

      <div class="canvas-wrapper">
        <canvas
          ref="canvasRef"
          class="editor-canvas"
          @mousedown="onMouseDown"
          @mousemove="onMouseMove"
          @mouseup="onMouseUp"
          @mouseleave="onMouseUp"
        ></canvas>
      </div>

      <div v-if="selectedShape" class="shape-props">
        <div class="props-header">
          <span class="props-title">形状属性</span>
          <button class="icon-btn danger" @click="deleteSelectedShape" title="删除形状">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            </svg>
          </button>
        </div>
        <div class="props-grid">
          <label>标签
            <input
              type="text"
              :value="selectedShape.label"
              @input="(e: any) => updateSelectedShapeField('label', e.target.value)"
              class="prop-input"
            />
          </label>
          <label v-if="selectedShape.type === 'text'">文本内容
            <input
              type="text"
              :value="selectedShape.text || ''"
              @input="(e: any) => updateSelectedShapeField('text', e.target.value)"
              class="prop-input"
            />
          </label>
          <label>X 位置
            <input
              type="number"
              :value="selectedShape.x"
              step="0.5"
              @input="(e: any) => updateSelectedShapeField('x', parseFloat(e.target.value) || 0)"
              class="prop-input"
            />
          </label>
          <label>Y 位置
            <input
              type="number"
              :value="selectedShape.y"
              step="0.5"
              @input="(e: any) => updateSelectedShapeField('y', parseFloat(e.target.value) || 0)"
              class="prop-input"
            />
          </label>
          <label>宽度
            <input
              type="number"
              :value="selectedShape.width"
              step="0.5"
              min="1"
              @input="(e: any) => updateSelectedShapeField('width', Math.max(1, parseFloat(e.target.value) || 1))"
              class="prop-input"
            />
          </label>
          <label>高度
            <input
              type="number"
              :value="selectedShape.height"
              step="0.5"
              min="1"
              @input="(e: any) => updateSelectedShapeField('height', Math.max(1, parseFloat(e.target.value) || 1))"
              class="prop-input"
            />
          </label>
          <label>旋转
            <input
              type="number"
              :value="selectedShape.rotation"
              step="5"
              @input="(e: any) => updateSelectedShapeField('rotation', parseFloat(e.target.value) || 0)"
              class="prop-input"
            />
          </label>
          <label>颜色
            <input
              type="color"
              :value="selectedShape.color"
              @input="(e: any) => updateSelectedShapeField('color', e.target.value)"
              class="prop-color"
            />
          </label>
          <label class="height-field">
            局部高度(μm)
            <div class="height-input-wrap">
              <input
                type="range"
                :value="selectedShape.localHeight"
                :min="LOCAL_HEIGHT_RANGE.min"
                :max="LOCAL_HEIGHT_RANGE.max"
                :step="LOCAL_HEIGHT_RANGE.step"
                @input="(e: any) => updateSelectedShapeField('localHeight', parseFloat(e.target.value))"
                class="height-slider"
              />
              <input
                type="number"
                :value="selectedShape.localHeight"
                :min="LOCAL_HEIGHT_RANGE.min"
                :max="LOCAL_HEIGHT_RANGE.max"
                :step="LOCAL_HEIGHT_RANGE.step"
                @input="(e: any) => updateSelectedShapeField('localHeight', parseFloat(e.target.value) || 0)"
                class="prop-input small"
              />
            </div>
          </label>
        </div>
      </div>
      <div v-else class="no-selection-hint">点击画布中的形状以编辑属性，或使用工具栏添加新形状</div>
    </div>

    <div v-else class="empty-template">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M9 21V9" />
      </svg>
      <p>未使用自定义模板</p>
      <span>选择预设或创建新模板以自定义印版字面形状与局部高度</span>
    </div>

    <div v-if="showTextDialog" class="dialog-overlay" @click.self="cancelTextCreation">
      <div class="dialog-box">
        <div class="dialog-title">添加文本</div>
        <div class="dialog-body">
          <label class="dialog-label">
            文本内容
            <input
              v-model="newTextContent"
              type="text"
              class="dialog-input"
              placeholder="请输入文本内容"
              @keyup.enter="confirmTextCreation"
              autofocus
            />
          </label>
        </div>
        <div class="dialog-actions">
          <button class="btn btn-secondary" @click="cancelTextCreation">取消</button>
          <button class="btn btn-primary" @click="confirmTextCreation">确定</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.template-editor {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  border: 1px solid #e2e8f0;
}

.editor-header {
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
  color: #7c3aed;
}

.template-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.preset-btns {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.preset-btn {
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  color: #475569;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s;
}

.preset-btn:hover {
  background: #e2e8f0;
  color: #1e293b;
}

.preset-btn.new {
  background: #2563eb;
  color: #fff;
  border-color: #2563eb;
}

.preset-btn.new:hover {
  background: #1d4ed8;
}

.preset-btn svg {
  width: 14px;
  height: 14px;
}

.io-btns {
  display: flex;
  gap: 4px;
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
  color: #1e293b;
}

.icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

.msg-bar {
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  margin-bottom: 10px;
}

.msg-bar.error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #dc2626;
}

.msg-bar.success {
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #059669;
}

.template-list {
  margin-bottom: 12px;
}

.list-label {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 6px;
}

.template-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.template-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  font-size: 12px;
  color: #475569;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.template-chip:hover {
  background: #e2e8f0;
}

.template-chip.active {
  background: #eff6ff;
  border-color: #93c5fd;
  color: #1d4ed8;
}

.chip-count {
  padding: 1px 6px;
  background: rgba(0,0,0,0.06);
  border-radius: 10px;
  font-size: 10px;
  font-weight: 600;
}

.template-detail {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.template-name-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.name-input {
  flex: 1;
  padding: 8px 12px;
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  background: #f8fafc;
  border: 1.5px solid #e2e8f0;
  border-radius: 8px;
  outline: none;
}

.name-input:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.shape-tools {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: #f8fafc;
  border-radius: 8px;
  flex-wrap: wrap;
}

.tools-label {
  font-size: 12px;
  color: #64748b;
  font-weight: 500;
}

.tool-btns {
  display: flex;
  gap: 4px;
}

.tool-btn {
  width: 34px;
  height: 34px;
  border: 1.5px solid transparent;
  background: #fff;
  border-radius: 8px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  transition: all 0.2s;
}

.tool-btn:hover {
  border-color: #cbd5e1;
  color: #1e293b;
}

.tool-btn.active {
  background: #eff6ff;
  border-color: #2563eb;
  color: #2563eb;
}

.tool-btn svg {
  width: 18px;
  height: 18px;
}

.hint {
  font-size: 11px;
  color: #2563eb;
  font-style: italic;
}

.canvas-wrapper {
  display: flex;
  justify-content: center;
}

.editor-canvas {
  width: 100%;
  max-width: 720px;
  aspect-ratio: 720 / 480;
  border-radius: 8px;
  background: #faf9f7;
  cursor: crosshair;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}

.shape-props {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px;
}

.props-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e2e8f0;
}

.props-title {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
}

.props-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px 14px;
}

.props-grid label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: #64748b;
  font-weight: 500;
}

.props-grid label.height-field {
  grid-column: 1 / -1;
}

.prop-input {
  padding: 6px 8px;
  font-size: 13px;
  color: #1e293b;
  background: #fff;
  border: 1.5px solid #e2e8f0;
  border-radius: 6px;
  outline: none;
}

.prop-input:focus {
  border-color: #2563eb;
}

.prop-input.small {
  width: 80px;
  flex-shrink: 0;
}

.prop-color {
  width: 100%;
  height: 32px;
  padding: 2px;
  border: 1.5px solid #e2e8f0;
  border-radius: 6px;
  cursor: pointer;
  background: #fff;
}

.height-input-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}

.height-slider {
  flex: 1;
  -webkit-appearance: none;
  appearance: none;
  height: 6px;
  background: #e2e8f0;
  border-radius: 3px;
  outline: none;
}

.height-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  background: #7c3aed;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}

.no-selection-hint {
  padding: 20px;
  text-align: center;
  color: #94a3b8;
  font-size: 12px;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px dashed #e2e8f0;
}

.empty-template {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
  color: #94a3b8;
}

.empty-template svg {
  width: 48px;
  height: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}

.empty-template p {
  font-size: 14px;
  color: #64748b;
  margin: 0 0 6px 0;
}

.empty-template span {
  font-size: 12px;
  color: #94a3b8;
  max-width: 400px;
}

.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog-box {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  width: 400px;
  max-width: 90vw;
  overflow: hidden;
}

.dialog-title {
  padding: 16px 20px;
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
  border-bottom: 1px solid #e2e8f0;
}

.dialog-body {
  padding: 20px;
}

.dialog-label {
  display: block;
  font-size: 13px;
  color: #475569;
  margin-bottom: 8px;
}

.dialog-input {
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  color: #1e293b;
  background: #f8fafc;
  border: 1.5px solid #e2e8f0;
  border-radius: 8px;
  outline: none;
  box-sizing: border-box;
}

.dialog-input:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.dialog-actions {
  padding: 12px 20px;
  border-top: 1px solid #e2e8f0;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btn {
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-primary {
  background: #2563eb;
  color: #fff;
}

.btn-primary:hover {
  background: #1d4ed8;
}

.btn-secondary {
  background: #f1f5f9;
  color: #475569;
}

.btn-secondary:hover {
  background: #e2e8f0;
}
</style>
