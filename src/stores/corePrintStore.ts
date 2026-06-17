import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  PrintParams,
  SimulationResult,
  SavedScheme,
  ValidationResult,
  PlateTemplate,
  DetailedRiskAnalysis,
  ComparisonReport
} from '../types'
import {
  DEFAULT_PARAMS,
  PARAMS_RANGES,
  GRID_WIDTH,
  GRID_HEIGHT
} from '../types/constants'
import {
  runSimulation,
  validateParams,
  generateComparisonReport,
  exportReportAsText,
  generateDetailedRiskAnalysis
} from '../utils/simulation'
import { schemePersistence } from '../utils/persistence'

export const useCorePrintStore = defineStore('corePrint', () => {
  const params = ref<PrintParams>({ ...DEFAULT_PARAMS })
  const currentResult = ref<SimulationResult | null>(null)
  const savedSchemes = ref<SavedScheme[]>([])
  const compareSchemes = ref<string[]>([])
  const lastValidation = ref<ValidationResult>({ valid: true, errors: [] })
  const inputErrors = ref<Partial<Record<keyof PrintParams, string>>>({})
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

  const paramsValid = computed(() => lastValidation.value.valid && Object.keys(inputErrors.value).length === 0)
  const validationErrors = computed(() => {
    const all = [...lastValidation.value.errors]
    Object.values(inputErrors.value).forEach(e => e && all.push(e))
    return all
  })

  const compareSchemeData = computed(() => {
    return compareSchemes.value
      .map(id => savedSchemes.value.find(s => s.id === id))
      .filter((s): s is SavedScheme => s !== undefined)
  })

  function validateSingleParam(key: keyof PrintParams, value: number): string | null {
    switch (key) {
      case 'viscosity':
        if (isNaN(value)) return '油墨黏度必须为有效数字'
        if (value <= 0) return `油墨黏度必须大于 0，当前输入 ${value}`
        if (value > PARAMS_RANGES.viscosity.max) return `油墨黏度不能超过 ${PARAMS_RANGES.viscosity.max} cP，当前输入 ${value}`
        return null
      case 'pressure':
        if (isNaN(value)) return '滚筒压力必须为有效数字'
        if (value <= 0) return `滚筒压力必须大于 0，当前输入 ${value}`
        if (value > PARAMS_RANGES.pressure.max) return `滚筒压力不能超过 ${PARAMS_RANGES.pressure.max} MPa，当前输入 ${value}`
        return null
      case 'rollingCount':
        if (isNaN(value)) return '滚动次数必须为有效数字'
        if (!Number.isInteger(value)) return '滚动次数必须为整数'
        if (value <= 0) return `滚动次数必须大于 0，当前输入 ${value}`
        if (value > PARAMS_RANGES.rollingCount.max) return `滚动次数不能超过 ${PARAMS_RANGES.rollingCount.max} 次，当前输入 ${value}`
        return null
      case 'heightDiff':
        if (isNaN(value)) return '字面高度差必须为有效数字'
        if (value < 0) return `字面高度差不能为负数，当前输入 ${value}`
        if (value > PARAMS_RANGES.heightDiff.max) return `字面高度差不能超过 ${PARAMS_RANGES.heightDiff.max} μm，当前输入 ${value}`
        return null
    }
  }

  function computeParamChanges(
    oldParams: PrintParams | null,
    newParams: PrintParams
  ): { param: keyof PrintParams; oldValue: number; newValue: number }[] {
    if (!oldParams) return []
    const changes: { param: keyof PrintParams; oldValue: number; newValue: number }[] = []
    const keys: (keyof PrintParams)[] = ['viscosity', 'pressure', 'rollingCount', 'heightDiff']
    for (const k of keys) {
      if (oldParams[k] !== newParams[k]) {
        changes.push({ param: k, oldValue: oldParams[k], newValue: newParams[k] })
      }
    }
    return changes
  }

  function updateParam(key: keyof PrintParams, value: number) {
    const err = validateSingleParam(key, value)
    if (err) {
      inputErrors.value[key] = err
      currentResult.value = null
      return
    }
    delete inputErrors.value[key]
    params.value[key] = value
    lastValidation.value = validateParams(params.value)
    if (lastValidation.value.valid) {
      simulate()
    } else {
      currentResult.value = null
    }
  }

  function invalidateParam(key: keyof PrintParams) {
    inputErrors.value[key] = key === 'viscosity'
      ? '油墨黏度必须为有效数字'
      : key === 'pressure'
        ? '滚筒压力必须为有效数字'
        : key === 'rollingCount'
          ? '滚动次数必须为有效数字'
          : '字面高度差必须为有效数字'
    currentResult.value = null
  }

  function setParams(newParams: Partial<PrintParams>, skipHistory = false, activeTemplate: PlateTemplate | null = null) {
    Object.assign(params.value, newParams)
    lastValidation.value = validateParams(params.value)
    if (lastValidation.value.valid) {
      simulate(skipHistory, activeTemplate)
    } else {
      currentResult.value = null
    }
  }

  function resetParams() {
    params.value = { ...DEFAULT_PARAMS }
    inputErrors.value = {}
    lastValidation.value = validateParams(params.value)
    simulate()
  }

  function simulate(_skipHistory = false, activeTemplate: PlateTemplate | null = null) {
    if (!lastValidation.value.valid) return
    currentResult.value = runSimulation(params.value, activeTemplate)
    const result = currentResult.value
    lastParams.value = { ...params.value }
    return result
  }

  function ensureSimulated(activeTemplate: PlateTemplate | null = null) {
    if (shouldRecompute.value || !currentResult.value) {
      simulate(false, activeTemplate)
    }
    return currentResult.value
  }

  function saveScheme(name: string, activeTemplateId: string | null = null): SavedScheme | null {
    if (!lastValidation.value.valid) return null
    const result = ensureSimulated()
    if (!result) return null

    const scheme: SavedScheme = {
      id: `scheme_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      name,
      params: { ...params.value },
      result: JSON.parse(JSON.stringify(result)),
      createdAt: Date.now(),
      templateId: activeTemplateId ?? undefined
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

      let schemeId = imported.id || `scheme_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
      let schemeName = imported.name || `导入方案 ${new Date().toLocaleString()}`
      let message = '方案导入成功'

      const idExists = savedSchemes.value.some(s => s.id === schemeId)
      if (idExists) {
        schemeId = `scheme_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
        schemeName = `${schemeName} (导入副本)`
        message = '检测到ID冲突，已以新ID创建副本导入（原方案未被覆盖）'
      }

      const scheme: SavedScheme = {
        id: schemeId,
        name: schemeName,
        params: tempParams,
        result,
        createdAt: imported.createdAt || Date.now(),
        templateId: imported.templateId
      }

      savedSchemes.value.push(scheme)
      persistSchemes()
      return { success: true, message }
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

  function clearSchemes() {
    savedSchemes.value = []
    compareSchemes.value = []
    persistSchemes()
  }

  function addToCompare(id: string) {
    if (!compareSchemes.value.includes(id) && compareSchemes.value.length < 5) {
      compareSchemes.value.push(id)
    }
  }

  function removeFromCompare(id: string) {
    const idx = compareSchemes.value.indexOf(id)
    if (idx >= 0) {
      compareSchemes.value.splice(idx, 1)
    }
  }

  function clearCompare() {
    compareSchemes.value = []
  }

  function exportReport(report: ComparisonReport): string {
    return exportReportAsText(report)
  }

  function generateReport(): ComparisonReport | null {
    const schemesToReport: SavedScheme[] = []
    if (currentResult.value) {
      schemesToReport.push({
        id: 'current',
        name: '当前方案',
        params: { ...params.value },
        result: JSON.parse(JSON.stringify(currentResult.value)),
        createdAt: Date.now()
      })
    }
    compareSchemeData.value.forEach(s => schemesToReport.push(s))
    if (schemesToReport.length < 2) return null
    return generateComparisonReport(schemesToReport)
  }

  function downloadReport(report: ComparisonReport) {
    const text = exportReportAsText(report)
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `印刷方案对比报告_${new Date().toISOString().slice(0, 10)}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function generateReportFromResult(): DetailedRiskAnalysis | null {
    if (!currentResult.value) return null
    if (currentResult.value.detailedRisk) return currentResult.value.detailedRisk
    const r = currentResult.value
    const heightMap: number[][] = []
    for (let y = 0; y < GRID_HEIGHT; y++) {
      heightMap.push(new Array(GRID_WIDTH).fill(params.value.heightDiff / 100))
    }
    return generateDetailedRiskAnalysis(
      params.value,
      r.coverage,
      r.uniformity,
      r.averageThickness,
      r.thicknessMap,
      heightMap
    )
  }

  function persistSchemes() {
    schemePersistence.save(savedSchemes.value)
  }

  function loadPersistedSchemes() {
    const loaded = schemePersistence.load()
    if (loaded) {
      savedSchemes.value = loaded
    }
  }

  function init() {
    loadPersistedSchemes()
    lastValidation.value = validateParams(params.value)
    if (lastValidation.value.valid) {
      simulate(true)
    }
  }

  return {
    params,
    currentResult,
    savedSchemes,
    compareSchemes,
    lastValidation,
    inputErrors,
    lastParams,
    shouldRecompute,
    paramsValid,
    validationErrors,
    compareSchemeData,
    validateSingleParam,
    computeParamChanges,
    updateParam,
    invalidateParam,
    setParams,
    resetParams,
    simulate,
    ensureSimulated,
    saveScheme,
    deleteScheme,
    loadScheme,
    importScheme,
    toggleCompare,
    clearSchemes,
    addToCompare,
    removeFromCompare,
    clearCompare,
    generateReport,
    exportReport,
    downloadReport,
    generateReportFromResult,
    init
  }
})
