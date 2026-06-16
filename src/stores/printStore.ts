import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { PrintParams, SimulationResult, SavedScheme, ValidationResult } from '../types'
import { DEFAULT_PARAMS } from '../types'
import { runSimulation, validateParams, generateSchemeId } from '../utils/simulation'

export const usePrintStore = defineStore('print', () => {
  const params = ref<PrintParams>({ ...DEFAULT_PARAMS })
  const currentResult = ref<SimulationResult | null>(null)
  const savedSchemes = ref<SavedScheme[]>([])
  const compareSchemes = ref<string[]>([])
  const lastValidation = ref<ValidationResult>({ valid: true, errors: [] })

  const lastParams = ref<PrintParams | null>(null)

  const shouldRecompute = computed(() => {
    if (!lastParams.value) return true
    return (
      lastParams.value.viscosity !== params.value.viscosity ||
      lastParams.value.pressure !== params.value.pressure ||
      lastParams.value.rollingCount !== params.value.rollingCount ||
      lastParams.value.heightDiff !== params.value.heightDiff
    )
  })

  const paramsValid = computed(() => lastValidation.value.valid)
  const validationErrors = computed(() => lastValidation.value.errors)

  const compareSchemeData = computed(() => {
    return compareSchemes.value
      .map(id => savedSchemes.value.find(s => s.id === id))
      .filter((s): s is SavedScheme => s !== undefined)
  })

  function updateParam(key: keyof PrintParams, value: number) {
    params.value[key] = value
    lastValidation.value = validateParams(params.value)
    if (lastValidation.value.valid) {
      simulate()
    } else {
      currentResult.value = null
    }
  }

  function setParams(newParams: Partial<PrintParams>) {
    Object.assign(params.value, newParams)
    lastValidation.value = validateParams(params.value)
    if (lastValidation.value.valid) {
      simulate()
    } else {
      currentResult.value = null
    }
  }

  function resetParams() {
    params.value = { ...DEFAULT_PARAMS }
    lastValidation.value = validateParams(params.value)
    simulate()
  }

  function simulate() {
    if (!lastValidation.value.valid) return
    currentResult.value = runSimulation(params.value)
    lastParams.value = { ...params.value }
  }

  function ensureSimulated() {
    if (shouldRecompute.value || !currentResult.value) {
      simulate()
    }
    return currentResult.value
  }

  function saveScheme(name: string): SavedScheme | null {
    if (!lastValidation.value.valid) return null
    const result = ensureSimulated()
    if (!result) return null

    const scheme: SavedScheme = {
      id: generateSchemeId(),
      name,
      params: { ...params.value },
      result: JSON.parse(JSON.stringify(result)),
      createdAt: Date.now()
    }
    savedSchemes.value.push(scheme)
    persistSchemes()
    return scheme
  }

  function deleteScheme(id: string) {
    savedSchemes.value = savedSchemes.value.filter(s => s.id !== id)
    compareSchemes.value = compareSchemes.value.filter(sid => sid !== id)
    persistSchemes()
  }

  function loadScheme(id: string): boolean {
    const scheme = savedSchemes.value.find(s => s.id === id)
    if (!scheme) return false

    const validation = validateParams(scheme.params)
    if (!validation.valid) return false

    params.value = { ...scheme.params }
    lastValidation.value = validation
    simulate()
    return true
  }

  function importScheme(jsonStr: string): { success: boolean; message: string } {
    try {
      const imported = JSON.parse(jsonStr)
      
      if (!imported || typeof imported !== 'object') {
        return { success: false, message: '导入数据格式无效' }
      }

      const tempParams = imported.params as PrintParams
      if (!tempParams) {
        return { success: false, message: '导入数据缺少参数信息' }
      }

      const validation = validateParams(tempParams)
      if (!validation.valid) {
        return { 
          success: false, 
          message: `参数校验失败：${validation.errors.join('；')}。当前方案未被覆盖。` 
        }
      }

      let result: SimulationResult
      if (imported.result) {
        result = imported.result as SimulationResult
      } else {
        result = runSimulation(tempParams)
      }

      const scheme: SavedScheme = {
        id: imported.id || generateSchemeId(),
        name: imported.name || `导入方案 ${new Date().toLocaleString()}`,
        params: tempParams,
        result,
        createdAt: imported.createdAt || Date.now()
      }

      const existingIdx = savedSchemes.value.findIndex(s => s.id === scheme.id)
      if (existingIdx >= 0) {
        savedSchemes.value[existingIdx] = scheme
      } else {
        savedSchemes.value.push(scheme)
      }
      persistSchemes()
      return { success: true, message: '方案导入成功' }
    } catch (e) {
      return { success: false, message: 'JSON 解析失败，请检查文件格式' }
    }
  }

  function toggleCompare(id: string) {
    const idx = compareSchemes.value.indexOf(id)
    if (idx >= 0) {
      compareSchemes.value.splice(idx, 1)
    } else if (compareSchemes.value.length < 5) {
      compareSchemes.value.push(id)
    }
  }

  function clearCompare() {
    compareSchemes.value = []
  }

  function persistSchemes() {
    try {
      localStorage.setItem('print_schemes', JSON.stringify(savedSchemes.value))
    } catch (e) {
      console.warn('保存方案到 localStorage 失败', e)
    }
  }

  function loadPersistedSchemes() {
    try {
      const stored = localStorage.getItem('print_schemes')
      if (stored) {
        savedSchemes.value = JSON.parse(stored)
      }
    } catch (e) {
      console.warn('从 localStorage 加载方案失败', e)
    }
  }

  function init() {
    loadPersistedSchemes()
    lastValidation.value = validateParams(params.value)
    if (lastValidation.value.valid) {
      simulate()
    }
  }

  return {
    params,
    currentResult,
    savedSchemes,
    compareSchemes,
    lastValidation,
    paramsValid,
    validationErrors,
    shouldRecompute,
    compareSchemeData,
    updateParam,
    setParams,
    resetParams,
    simulate,
    ensureSimulated,
    saveScheme,
    deleteScheme,
    loadScheme,
    importScheme,
    toggleCompare,
    clearCompare,
    init
  }
})
