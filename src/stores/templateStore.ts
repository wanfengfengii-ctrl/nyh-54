import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  PlateTemplate,
  PlateShape
} from '../types'
import {
  TEMPLATE_PRESETS
} from '../types/constants'
import {
  generatePresetTemplate
} from '../utils/simulation'
import {
  generateTemplateId,
  generateShapeId
} from '../utils/idGenerator'
import { templatePersistence } from '../utils/persistence'

export const useTemplateStore = defineStore('template', () => {
  const templates = ref<PlateTemplate[]>([])
  const activeTemplateId = ref<string | null>(null)
  const selectedShapeId = ref<string | null>(null)

  const activeTemplate = computed<PlateTemplate | null>(() => {
    if (!activeTemplateId.value) return null
    return templates.value.find(t => t.id === activeTemplateId.value) ?? null
  })

  function createTemplate(presetName?: string, name?: string): PlateTemplate {
    const id = generateTemplateId()
    const template: PlateTemplate = presetName && TEMPLATE_PRESETS.some(p => p.name === presetName)
      ? generatePresetTemplate(presetName, id)
      : {
          id,
          name: name || `模板 ${templates.value.length + 1}`,
          shapes: [],
          baseHeight: 0,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
    templates.value.push(template)
    activeTemplateId.value = id
    persistTemplates()
    return template
  }

  function createTemplateFromPreset(presetName: string): PlateTemplate {
    return createTemplate(presetName, `${presetName}模板`)
  }

  function updateTemplate(template: PlateTemplate) {
    const idx = templates.value.findIndex(t => t.id === template.id)
    if (idx >= 0) {
      templates.value[idx] = {
        ...template,
        updatedAt: Date.now()
      }
      persistTemplates()
    }
  }

  function deleteTemplate(templateId: string) {
    templates.value = templates.value.filter(t => t.id !== templateId)
    if (activeTemplateId.value === templateId) {
      activeTemplateId.value = null
    }
    persistTemplates()
  }

  function setActiveTemplate(templateId: string | null) {
    activeTemplateId.value = templateId
    selectedShapeId.value = null
  }

  function addShape(templateId: string, shape: Omit<PlateShape, 'id'>): PlateShape | null {
    const idx = templates.value.findIndex(t => t.id === templateId)
    if (idx >= 0) {
      const newShape: PlateShape = { ...shape, id: generateShapeId() }
      templates.value[idx] = {
        ...templates.value[idx],
        shapes: [...templates.value[idx].shapes, newShape],
        updatedAt: Date.now()
      }
      selectedShapeId.value = newShape.id
      persistTemplates()
      return newShape
    }
    return null
  }

  function updateShape(templateId: string, shapeId: string, updates: Partial<PlateShape>) {
    const tIdx = templates.value.findIndex(t => t.id === templateId)
    if (tIdx >= 0) {
      const sIdx = templates.value[tIdx].shapes.findIndex(s => s.id === shapeId)
      if (sIdx >= 0) {
        templates.value[tIdx] = {
          ...templates.value[tIdx],
          shapes: templates.value[tIdx].shapes.map((s, i) =>
            i === sIdx ? { ...s, ...updates } : s
          ),
          updatedAt: Date.now()
        }
        persistTemplates()
      }
    }
  }

  function deleteShape(templateId: string, shapeId: string) {
    const tIdx = templates.value.findIndex(t => t.id === templateId)
    if (tIdx >= 0) {
      templates.value[tIdx] = {
        ...templates.value[tIdx],
        shapes: templates.value[tIdx].shapes.filter(s => s.id !== shapeId),
        updatedAt: Date.now()
      }
      if (selectedShapeId.value === shapeId) {
        selectedShapeId.value = null
      }
      persistTemplates()
    }
  }

  function selectShape(shapeId: string | null) {
    selectedShapeId.value = shapeId
  }

  function importTemplate(jsonStr: string): { success: boolean; message: string } | PlateTemplate {
    try {
      const imported = JSON.parse(jsonStr)
      if (!imported || !imported.shapes) {
        return { success: false, message: '模板数据格式无效' }
      }
      const template: PlateTemplate = {
        id: imported.id || generateTemplateId(),
        name: imported.name || `导入模板 ${new Date().toLocaleString()}`,
        shapes: imported.shapes.map((s: PlateShape) => ({
          ...s,
          id: s.id || generateShapeId()
        })),
        baseHeight: imported.baseHeight || 0,
        createdAt: imported.createdAt || Date.now(),
        updatedAt: Date.now()
      }
      templates.value.push(template)
      activeTemplateId.value = template.id
      persistTemplates()
      return template
    } catch (e) {
      return { success: false, message: 'JSON 解析失败' }
    }
  }

  function exportTemplate(templateId: string) {
    const template = templates.value.find(t => t.id === templateId)
    if (!template) return
    const jsonStr = JSON.stringify(template, null, 2)
    const blob = new Blob([jsonStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${template.name.replace(/[^\w\u4e00-\u9fa5]/g, '_')}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function persistTemplates() {
    templatePersistence.save(templates.value)
  }

  function loadPersistedTemplates() {
    const loaded = templatePersistence.load()
    if (loaded) {
      templates.value = loaded
    }
    if (templates.value.length === 0) {
      createTemplate('标准文字', '标准文字模板')
      createTemplate('图文混排', '图文混排模板')
    }
  }

  function init() {
    loadPersistedTemplates()
  }

  return {
    templates,
    activeTemplateId,
    activeTemplate,
    selectedShapeId,
    createTemplate,
    createTemplateFromPreset,
    updateTemplate,
    deleteTemplate,
    setActiveTemplate,
    addShape,
    updateShape,
    deleteShape,
    selectShape,
    importTemplate,
    exportTemplate,
    init
  }
})
