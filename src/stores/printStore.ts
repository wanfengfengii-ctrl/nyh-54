import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  PrintParams,
  SimulationResult,
  SavedScheme,
  ValidationResult,
  PlateTemplate,
  PlateShape,
  ParamHistoryEntry,
  PlaybackState,
  BatchExperimentConfig,
  BatchExperimentResult,
  ComparisonReport,
  EnvironmentParams,
  AgingAnalysisResult,
  TimeSeriesPoint,
  DetailedRiskAnalysis,
  MachineConfig,
  OrderInfo,
  MultiMachineSimulationResult
} from '../types'
import {
  DEFAULT_PARAMS,
  PARAMS_RANGES,
  TEMPLATE_PRESETS,
  MAX_HISTORY_SIZE,
  GRID_WIDTH,
  GRID_HEIGHT,
  DEFAULT_ENV_PARAMS,
  AGING_SIMULATION_CONFIG,
  MACHINE_COLORS,
  DEFAULT_MACHINE_CONFIG
} from '../types'
import {
  runSimulation,
  validateParams,
  generateSchemeId,
  generateTemplateId,
  generateHistoryId,
  generatePresetTemplate,
  generateShapeId,
  runBatchExperiment,
  generateComparisonReport,
  exportReportAsText,
  generateDetailedRiskAnalysis,
  runAgingAnalysis,
  generateMachineId,
  generateOrderId,
  runMultiMachineSimulation,
  exportMultiMachineReport
} from '../utils/simulation'

export const usePrintStore = defineStore('print', () => {
  const params = ref<PrintParams>({ ...DEFAULT_PARAMS })
  const currentResult = ref<SimulationResult | null>(null)
  const savedSchemes = ref<SavedScheme[]>([])
  const compareSchemes = ref<string[]>([])
  const lastValidation = ref<ValidationResult>({ valid: true, errors: [] })
  const inputErrors = ref<Partial<Record<keyof PrintParams, string>>>({})

  const lastParams = ref<PrintParams | null>(null)

  const templates = ref<PlateTemplate[]>([])
  const activeTemplateId = ref<string | null>(null)
  const selectedShapeId = ref<string | null>(null)

  const history = ref<ParamHistoryEntry[]>([])
  const playbackState = ref<PlaybackState>({
    isPlaying: false,
    isPaused: false,
    currentIndex: -1,
    speed: 1000,
    direction: 'forward'
  })
  let playbackTimer: number | null = null

  const experiments = ref<BatchExperimentResult[]>([])
  const activeExperimentId = ref<string | null>(null)
  const experimentProgress = ref<{ completed: number; total: number } | null>(null)
  const experimentCancelled = ref(false)

  const envParams = ref<EnvironmentParams>({ ...DEFAULT_ENV_PARAMS })
  const agingAnalyses = ref<AgingAnalysisResult[]>([])
  const activeAgingId = ref<string | null>(null)
  const agingPlaybackIndex = ref<number>(-1)
  const agingPlaybackState = ref<PlaybackState>({
    isPlaying: false,
    isPaused: false,
    currentIndex: -1,
    speed: 500,
    direction: 'forward'
  })
  let agingPlaybackTimer: number | null = null
  const agingSteps = ref<number>(AGING_SIMULATION_CONFIG.defaultSteps)
  const agingProgress = ref<{ completed: number; total: number } | null>(null)
  const agingRunning = ref(false)

  const machines = ref<MachineConfig[]>([])
  const orders = ref<OrderInfo[]>([])
  const multiMachineResults = ref<MultiMachineSimulationResult[]>([])
  const activeMultiSimId = ref<string | null>(null)
  const multiSimBatchesPerMachine = ref(5)
  const multiSimRunning = ref(false)

  const activeMultiSimResult = computed<MultiMachineSimulationResult | null>(() => {
    if (!activeMultiSimId.value) return null
    return multiMachineResults.value.find(r => r.id === activeMultiSimId.value) ?? null
  })

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

  const activeTemplate = computed<PlateTemplate | null>(() => {
    if (!activeTemplateId.value) return null
    return templates.value.find(t => t.id === activeTemplateId.value) ?? null
  })

  const activeExperiment = computed<BatchExperimentResult | null>(() => {
    if (!activeExperimentId.value) return null
    return experiments.value.find(e => e.id === activeExperimentId.value) ?? null
  })

  const activeAgingAnalysis = computed<AgingAnalysisResult | null>(() => {
    if (!activeAgingId.value) return null
    return agingAnalyses.value.find(a => a.id === activeAgingId.value) ?? null
  })

  const currentAgingPoint = computed<TimeSeriesPoint | null>(() => {
    const analysis = activeAgingAnalysis.value
    if (!analysis || agingPlaybackIndex.value < 0 || agingPlaybackIndex.value >= analysis.timeSeries.length) {
      return null
    }
    return analysis.timeSeries[agingPlaybackIndex.value]
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

  function recordHistory(result: SimulationResult) {
    if (playbackState.value.isPlaying) return
    const changes = computeParamChanges(lastParams.value, params.value)
    if (changes.length === 0 && history.value.length > 0) return

    const entry: ParamHistoryEntry = {
      id: generateHistoryId(),
      timestamp: Date.now(),
      params: { ...params.value },
      result: JSON.parse(JSON.stringify(result)),
      templateId: activeTemplateId.value ?? undefined,
      changes
    }

    history.value.push(entry)
    if (history.value.length > MAX_HISTORY_SIZE) {
      history.value.splice(0, history.value.length - MAX_HISTORY_SIZE)
    }

    playbackState.value.currentIndex = history.value.length - 1
    persistHistory()
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

  function setParams(newParams: Partial<PrintParams>, skipHistory = false) {
    Object.assign(params.value, newParams)
    lastValidation.value = validateParams(params.value)
    if (lastValidation.value.valid) {
      simulate(skipHistory)
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

  function simulate(skipHistory = false) {
    if (!lastValidation.value.valid) return
    const tpl = activeTemplate.value
    currentResult.value = runSimulation(params.value, tpl)
    const result = currentResult.value
    lastParams.value = { ...params.value }
    if (!skipHistory && result) {
      recordHistory(result)
    }
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
      createdAt: Date.now(),
      templateId: activeTemplateId.value ?? undefined
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

      let schemeId = imported.id || generateSchemeId()
      let schemeName = imported.name || `导入方案 ${new Date().toLocaleString()}`
      let message = '方案导入成功'

      const idExists = savedSchemes.value.some(s => s.id === schemeId)
      if (idExists) {
        schemeId = generateSchemeId()
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

  function clearCompare() {
    compareSchemes.value = []
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

  function updateTemplate(templateId: string, updates: Partial<PlateTemplate>) {
    const idx = templates.value.findIndex(t => t.id === templateId)
    if (idx >= 0) {
      templates.value[idx] = {
        ...templates.value[idx],
        ...updates,
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
    if (lastValidation.value.valid) {
      simulate(true)
    }
  }

  function addShape(templateId: string, shape: Omit<PlateShape, 'id'>) {
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
      if (activeTemplateId.value === templateId && lastValidation.value.valid) {
        simulate(true)
      }
    }
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
        if (activeTemplateId.value === templateId && lastValidation.value.valid) {
          simulate(true)
        }
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
      if (activeTemplateId.value === templateId && lastValidation.value.valid) {
        simulate(true)
      }
    }
  }

  function selectShape(shapeId: string | null) {
    selectedShapeId.value = shapeId
  }

  function importTemplate(jsonStr: string): { success: boolean; message: string } {
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
      return { success: true, message: '模板导入成功' }
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

  function jumpToHistory(index: number) {
    if (index < 0 || index >= history.value.length) return
    const entry = history.value[index]
    params.value = { ...entry.params }
    currentResult.value = JSON.parse(JSON.stringify(entry.result))
    lastParams.value = { ...entry.params }
    lastValidation.value = { valid: true, errors: [] }
    inputErrors.value = {}
    playbackState.value.currentIndex = index
    if (entry.templateId) {
      activeTemplateId.value = entry.templateId
    }
  }

  function startPlayback() {
    if (history.value.length < 2) return
    stopPlayback()
    playbackState.value.isPlaying = true
    playbackState.value.isPaused = false
    if (playbackState.value.currentIndex < 0 || playbackState.value.currentIndex >= history.value.length - 1) {
      playbackState.value.currentIndex = playbackState.value.direction === 'forward' ? 0 : history.value.length - 1
    }

    const tick = () => {
      if (!playbackState.value.isPlaying || playbackState.value.isPaused) return
      const idx = playbackState.value.currentIndex
      const next = playbackState.value.direction === 'forward'
        ? idx + 1
        : idx - 1
      if (next < 0 || next >= history.value.length) {
        stopPlayback()
        return
      }
      jumpToHistory(next)
      playbackTimer = window.setTimeout(tick, playbackState.value.speed)
    }
    playbackTimer = window.setTimeout(tick, playbackState.value.speed)
  }

  function pausePlayback() {
    playbackState.value.isPaused = true
  }

  function resumePlayback() {
    if (!playbackState.value.isPlaying) return
    playbackState.value.isPaused = false
    const tick = () => {
      if (!playbackState.value.isPlaying || playbackState.value.isPaused) return
      const idx = playbackState.value.currentIndex
      const next = playbackState.value.direction === 'forward'
        ? idx + 1
        : idx - 1
      if (next < 0 || next >= history.value.length) {
        stopPlayback()
        return
      }
      jumpToHistory(next)
      playbackTimer = window.setTimeout(tick, playbackState.value.speed)
    }
    playbackTimer = window.setTimeout(tick, playbackState.value.speed)
  }

  function stopPlayback() {
    playbackState.value.isPlaying = false
    playbackState.value.isPaused = false
    if (playbackTimer) {
      clearTimeout(playbackTimer)
      playbackTimer = null
    }
  }

  function setPlaybackSpeed(speed: number) {
    playbackState.value.speed = speed
  }

  function setPlaybackDirection(dir: 'forward' | 'backward') {
    playbackState.value.direction = dir
  }

  function clearHistory() {
    stopPlayback()
    history.value = []
    playbackState.value.currentIndex = -1
    localStorage.removeItem('print_history')
  }

  async function startBatchExperiment(config: BatchExperimentConfig): Promise<BatchExperimentResult | null> {
    experimentCancelled.value = false
    experimentProgress.value = { completed: 0, total: 0 }

    try {
      const result = await runBatchExperiment(
        config,
        (completed, total) => {
          experimentProgress.value = { completed, total }
        },
        () => experimentCancelled.value
      )
      experiments.value.push(result)
      activeExperimentId.value = result.id
      persistExperiments()
      return result
    } catch (e) {
      console.error('Batch experiment failed:', e)
      return null
    } finally {
      experimentProgress.value = null
    }
  }

  function cancelBatchExperiment() {
    experimentCancelled.value = true
  }

  function deleteExperiment(experimentId: string) {
    experiments.value = experiments.value.filter(e => e.id !== experimentId)
    if (activeExperimentId.value === experimentId) {
      activeExperimentId.value = null
    }
    persistExperiments()
  }

  function applyExperimentScheme(runParams: PrintParams) {
    const validation = validateParams(runParams)
    if (!validation.valid) return
    params.value = { ...runParams }
    lastValidation.value = validation
    simulate()
  }

  function setActiveExperiment(experimentId: string | null) {
    activeExperimentId.value = experimentId
  }

  function updateEnvParam(key: keyof EnvironmentParams, value: number) {
    envParams.value[key] = value
  }

  function resetEnvParams() {
    envParams.value = { ...DEFAULT_ENV_PARAMS }
  }

  function setAgingSteps(steps: number) {
    const min = AGING_SIMULATION_CONFIG.minSteps
    const max = AGING_SIMULATION_CONFIG.maxSteps
    agingSteps.value = Math.max(min, Math.min(max, Math.round(steps)))
  }

  async function startAgingAnalysis(): Promise<AgingAnalysisResult | null> {
    if (!lastValidation.value.valid) return null
    agingRunning.value = true
    agingProgress.value = { completed: 0, total: agingSteps.value }

    try {
      await new Promise(resolve => setTimeout(resolve, 50))
      const tpl = activeTemplate.value
      const result = runAgingAnalysis(
        params.value,
        envParams.value,
        agingSteps.value,
        tpl
      )

      agingAnalyses.value.push(result)
      activeAgingId.value = result.id
      agingPlaybackIndex.value = 0
      agingPlaybackState.value.currentIndex = 0
      persistAgingAnalyses()

      agingProgress.value = { completed: agingSteps.value, total: agingSteps.value }
      return result
    } catch (e) {
      console.error('Aging analysis failed:', e)
      return null
    } finally {
      agingRunning.value = false
      agingProgress.value = null
    }
  }

  function setActiveAgingAnalysis(agingId: string | null) {
    activeAgingId.value = agingId
    if (agingId) {
      agingPlaybackIndex.value = 0
      agingPlaybackState.value.currentIndex = 0
    } else {
      agingPlaybackIndex.value = -1
      agingPlaybackState.value.currentIndex = -1
    }
    stopAgingPlayback()
  }

  function deleteAgingAnalysis(agingId: string) {
    agingAnalyses.value = agingAnalyses.value.filter(a => a.id !== agingId)
    if (activeAgingId.value === agingId) {
      activeAgingId.value = null
      agingPlaybackIndex.value = -1
    }
    stopAgingPlayback()
    persistAgingAnalyses()
  }

  function jumpToAgingIndex(index: number) {
    const analysis = activeAgingAnalysis.value
    if (!analysis) return
    const clamped = Math.max(0, Math.min(analysis.timeSeries.length - 1, index))
    agingPlaybackIndex.value = clamped
    agingPlaybackState.value.currentIndex = clamped
  }

  function startAgingPlayback() {
    const analysis = activeAgingAnalysis.value
    if (!analysis || analysis.timeSeries.length < 2) return
    stopAgingPlayback()
    agingPlaybackState.value.isPlaying = true
    agingPlaybackState.value.isPaused = false

    if (agingPlaybackIndex.value < 0 || agingPlaybackIndex.value >= analysis.timeSeries.length - 1) {
      agingPlaybackIndex.value = agingPlaybackState.value.direction === 'forward'
        ? 0
        : analysis.timeSeries.length - 1
    }

    const tick = () => {
      if (!agingPlaybackState.value.isPlaying || agingPlaybackState.value.isPaused) return
      const idx = agingPlaybackIndex.value
      const next = agingPlaybackState.value.direction === 'forward'
        ? idx + 1
        : idx - 1
      if (next < 0 || next >= analysis.timeSeries.length) {
        stopAgingPlayback()
        return
      }
      jumpToAgingIndex(next)
      agingPlaybackTimer = window.setTimeout(tick, agingPlaybackState.value.speed)
    }
    agingPlaybackTimer = window.setTimeout(tick, agingPlaybackState.value.speed)
  }

  function pauseAgingPlayback() {
    agingPlaybackState.value.isPaused = true
  }

  function resumeAgingPlayback() {
    if (!agingPlaybackState.value.isPlaying) return
    const analysis = activeAgingAnalysis.value
    if (!analysis) return
    agingPlaybackState.value.isPaused = false
    const tick = () => {
      if (!agingPlaybackState.value.isPlaying || agingPlaybackState.value.isPaused) return
      const idx = agingPlaybackIndex.value
      const next = agingPlaybackState.value.direction === 'forward'
        ? idx + 1
        : idx - 1
      if (next < 0 || next >= analysis.timeSeries.length) {
        stopAgingPlayback()
        return
      }
      jumpToAgingIndex(next)
      agingPlaybackTimer = window.setTimeout(tick, agingPlaybackState.value.speed)
    }
    agingPlaybackTimer = window.setTimeout(tick, agingPlaybackState.value.speed)
  }

  function stopAgingPlayback() {
    agingPlaybackState.value.isPlaying = false
    agingPlaybackState.value.isPaused = false
    if (agingPlaybackTimer) {
      clearTimeout(agingPlaybackTimer)
      agingPlaybackTimer = null
    }
  }

  function setAgingPlaybackSpeed(speed: number) {
    agingPlaybackState.value.speed = speed
  }

  function setAgingPlaybackDirection(dir: 'forward' | 'backward') {
    agingPlaybackState.value.direction = dir
  }

  function applyAgingPointParams(point: TimeSeriesPoint) {
    const validation = validateParams(point.adjustedPrintParams)
    if (!validation.valid) return
    params.value = { ...point.adjustedPrintParams }
    lastValidation.value = validation
    currentResult.value = JSON.parse(JSON.stringify(point.result))
    if (currentResult.value) {
      currentResult.value.detailedRisk = generateDetailedRiskAnalysis(
        params.value,
        currentResult.value.coverage,
        currentResult.value.uniformity,
        currentResult.value.averageThickness,
        currentResult.value.thicknessMap,
        currentResult.value.coverageMap
      )
    }
  }

  function persistAgingAnalyses() {
    try {
      const toStore = agingAnalyses.value.slice(-3).map(a => ({
        ...a,
        timeSeries: a.timeSeries.slice(0, 50).map(p => ({
          ...p,
          result: {
            ...p.result,
            detailedRisk: undefined
          }
        }))
      }))
      localStorage.setItem('print_aging_analyses', JSON.stringify(toStore))
    } catch (e) {
      console.warn('保存老化分析到 localStorage 失败', e)
    }
  }

  function loadPersistedAgingAnalyses() {
    try {
      const stored = localStorage.getItem('print_aging_analyses')
      if (stored) {
        const loaded = JSON.parse(stored)
        agingAnalyses.value = loaded
      }
    } catch (e) {
      console.warn('从 localStorage 加载老化分析失败', e)
    }
  }

  function persistSchemes() {
    try {
      localStorage.setItem('print_schemes', JSON.stringify(savedSchemes.value))
    } catch (e) {
      console.warn('保存方案到 localStorage 失败', e)
    }
  }

  function persistTemplates() {
    try {
      localStorage.setItem('print_templates', JSON.stringify(templates.value))
    } catch (e) {
      console.warn('保存模板到 localStorage 失败', e)
    }
  }

  function persistHistory() {
    try {
      const toStore = history.value.slice(-100).map(h => ({
        ...h,
        result: {
          ...h.result,
          thicknessMap: undefined,
          coverageMap: undefined
        }
      }))
      localStorage.setItem('print_history', JSON.stringify(toStore))
    } catch (e) {
      console.warn('保存历史到 localStorage 失败', e)
    }
  }

  function persistExperiments() {
    try {
      const toStore = experiments.value.slice(-10).map(e => ({
        ...e,
        results: e.results.slice(0, 100).map(r => ({
          ...r,
          result: {
            ...r.result,
            thicknessMap: undefined,
            coverageMap: undefined
          }
        })),
        paretoFront: e.paretoFront?.slice(0, 20).map(r => ({
          ...r,
          result: {
            ...r.result,
            thicknessMap: undefined,
            coverageMap: undefined
          }
        }))
      }))
      localStorage.setItem('print_experiments', JSON.stringify(toStore))
    } catch (e) {
      console.warn('保存实验到 localStorage 失败', e)
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

  function loadPersistedTemplates() {
    try {
      const stored = localStorage.getItem('print_templates')
      if (stored) {
        templates.value = JSON.parse(stored)
      }
      if (templates.value.length === 0) {
        createTemplate('标准文字', '标准文字模板')
        createTemplate('图文混排', '图文混排模板')
      }
    } catch (e) {
      console.warn('从 localStorage 加载模板失败', e)
    }
  }

  function loadPersistedHistory() {
    try {
      const stored = localStorage.getItem('print_history')
      if (stored) {
        const loaded = JSON.parse(stored)
        history.value = loaded.map((h: ParamHistoryEntry) => ({
          ...h,
          result: {
            ...h.result,
            thicknessMap: Array.from({ length: GRID_HEIGHT }, () => Array(GRID_WIDTH).fill(0)),
            coverageMap: Array.from({ length: GRID_HEIGHT }, () => Array(GRID_WIDTH).fill(0))
          }
        }))
        playbackState.value.currentIndex = history.value.length - 1
      }
    } catch (e) {
      console.warn('从 localStorage 加载历史失败', e)
    }
  }

  function loadPersistedExperiments() {
    try {
      const stored = localStorage.getItem('print_experiments')
      if (stored) {
        experiments.value = JSON.parse(stored)
      }
    } catch (e) {
      console.warn('从 localStorage 加载实验失败', e)
    }
  }

  function addMachine(name?: string, customParams?: Partial<MachineConfig>): MachineConfig {
    const id = generateMachineId()
    const index = machines.value.length
    const color = MACHINE_COLORS[index % MACHINE_COLORS.length]
    const machine: MachineConfig = {
      id,
      name: name || `机台 ${index + 1}`,
      params: customParams?.params ? { ...customParams.params } : { ...DEFAULT_PARAMS },
      envParams: customParams?.envParams ? { ...customParams.envParams } : { ...DEFAULT_ENV_PARAMS },
      status: customParams?.status ?? 'idle',
      capacity: customParams?.capacity ?? DEFAULT_MACHINE_CONFIG.capacity,
      allocatedCapacity: customParams?.allocatedCapacity ?? 0,
      rollerWear: customParams?.rollerWear ?? 0,
      totalRunCount: customParams?.totalRunCount ?? 0,
      lastMaintenanceTime: Date.now(),
      createdAt: Date.now(),
      color
    }
    machines.value.push(machine)
    persistMachines()
    return machine
  }

  function updateMachine(machineId: string, updates: Partial<MachineConfig>) {
    const idx = machines.value.findIndex(m => m.id === machineId)
    if (idx >= 0) {
      machines.value[idx] = { ...machines.value[idx], ...updates }
      persistMachines()
    }
  }

  function deleteMachine(machineId: string) {
    machines.value = machines.value.filter(m => m.id !== machineId)
    orders.value.forEach(o => {
      o.assignedMachines = o.assignedMachines.filter(id => id !== machineId)
    })
    persistMachines()
    persistOrders()
  }

  function addOrder(order: Omit<OrderInfo, 'id' | 'createdAt' | 'status'>): OrderInfo {
    const id = generateOrderId()
    const newOrder: OrderInfo = {
      ...order,
      id,
      createdAt: Date.now(),
      status: 'pending'
    }
    orders.value.push(newOrder)
    persistOrders()
    return newOrder
  }

  function updateOrder(orderId: string, updates: Partial<OrderInfo>) {
    const idx = orders.value.findIndex(o => o.id === orderId)
    if (idx >= 0) {
      orders.value[idx] = { ...orders.value[idx], ...updates }
      persistOrders()
    }
  }

  function deleteOrder(orderId: string) {
    orders.value = orders.value.filter(o => o.id !== orderId)
    persistOrders()
  }

  async function startMultiMachineSimulation(): Promise<MultiMachineSimulationResult | null> {
    if (machines.value.length === 0) return null
    multiSimRunning.value = true
    try {
      await new Promise(resolve => setTimeout(resolve, 50))
      const result = runMultiMachineSimulation(
        machines.value,
        orders.value,
        multiSimBatchesPerMachine.value
      )
      multiMachineResults.value.push(result)
      activeMultiSimId.value = result.id
      persistMultiMachineResults()
      return result
    } catch (e) {
      console.error('Multi-machine simulation failed:', e)
      return null
    } finally {
      multiSimRunning.value = false
    }
  }

  function setActiveMultiSimResult(resultId: string | null) {
    activeMultiSimId.value = resultId
  }

  function deleteMultiSimResult(resultId: string) {
    multiMachineResults.value = multiMachineResults.value.filter(r => r.id !== resultId)
    if (activeMultiSimId.value === resultId) {
      activeMultiSimId.value = null
    }
    persistMultiMachineResults()
  }

  function downloadMultiMachineReport(result: MultiMachineSimulationResult) {
    const text = exportMultiMachineReport(result)
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `多机台生产报告_${new Date().toISOString().slice(0, 10)}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function persistMachines() {
    try {
      localStorage.setItem('print_machines', JSON.stringify(machines.value))
    } catch (e) {
      console.warn('保存机台到 localStorage 失败', e)
    }
  }

  function persistOrders() {
    try {
      localStorage.setItem('print_orders', JSON.stringify(orders.value))
    } catch (e) {
      console.warn('保存订单到 localStorage 失败', e)
    }
  }

  function persistMultiMachineResults() {
    try {
      const toStore = multiMachineResults.value.slice(-5).map(r => ({
        ...r,
        batches: r.batches.slice(0, 50).map(b => ({
          ...b,
          result: { ...b.result, thicknessMap: undefined, coverageMap: undefined }
        }))
      }))
      localStorage.setItem('print_multi_results', JSON.stringify(toStore))
    } catch (e) {
      console.warn('保存多机台结果到 localStorage 失败', e)
    }
  }

  function loadPersistedMachines() {
    try {
      const stored = localStorage.getItem('print_machines')
      if (stored) {
        machines.value = JSON.parse(stored)
      }
    } catch (e) {
      console.warn('从 localStorage 加载机台失败', e)
    }
  }

  function loadPersistedOrders() {
    try {
      const stored = localStorage.getItem('print_orders')
      if (stored) {
        orders.value = JSON.parse(stored)
      }
    } catch (e) {
      console.warn('从 localStorage 加载订单失败', e)
    }
  }

  function loadPersistedMultiMachineResults() {
    try {
      const stored = localStorage.getItem('print_multi_results')
      if (stored) {
        multiMachineResults.value = JSON.parse(stored)
      }
    } catch (e) {
      console.warn('从 localStorage 加载多机台结果失败', e)
    }
  }

  function initDemoData() {
    if (machines.value.length === 0) {
      addMachine('海德堡 SM-1', {
        params: { viscosity: 52, pressure: 55, rollingCount: 3, heightDiff: 12 },
        envParams: { temperature: 24, humidity: 48, rollerWear: 15, paperAbsorption: 52, printRunCount: 12500 },
        status: 'running',
        capacity: 100,
        allocatedCapacity: 0,
        rollerWear: 15,
        totalRunCount: 12500
      })
      addMachine('罗兰 R700', {
        params: { viscosity: 48, pressure: 48, rollingCount: 4, heightDiff: 8 },
        envParams: { temperature: 26, humidity: 55, rollerWear: 35, paperAbsorption: 48, printRunCount: 28600 },
        status: 'running',
        capacity: 80,
        allocatedCapacity: 0,
        rollerWear: 35,
        totalRunCount: 28600
      })
      addMachine('小森 L440', {
        params: { viscosity: 60, pressure: 62, rollingCount: 3, heightDiff: 18 },
        envParams: { temperature: 23, humidity: 42, rollerWear: 68, paperAbsorption: 60, printRunCount: 45200 },
        status: 'warning',
        capacity: 120,
        allocatedCapacity: 0,
        rollerWear: 68,
        totalRunCount: 45200
      })
      addMachine('秋山 BT40', {
        params: { viscosity: 45, pressure: 42, rollingCount: 5, heightDiff: 5 },
        envParams: { temperature: 25, humidity: 50, rollerWear: 8, paperAbsorption: 45, printRunCount: 8300 },
        status: 'idle',
        capacity: 90,
        allocatedCapacity: 0,
        rollerWear: 8,
        totalRunCount: 8300
      })
    }

    if (orders.value.length === 0) {
      const machineIds = machines.value.map(m => m.id)
      addOrder({
        name: '高档画册印刷',
        totalQuantity: 5000,
        completedQuantity: 1200,
        requiredCoverage: 65,
        requiredUniformity: 75,
        deadline: Date.now() + 5 * 24 * 3600000,
        priority: 'high',
        assignedMachines: machineIds.slice(0, 2)
      })
      addOrder({
        name: '精品包装盒',
        totalQuantity: 3000,
        completedQuantity: 800,
        requiredCoverage: 70,
        requiredUniformity: 80,
        deadline: Date.now() + 7 * 24 * 3600000,
        priority: 'medium',
        assignedMachines: machineIds.slice(1, 3)
      })
      addOrder({
        name: '艺术纸邀请函',
        totalQuantity: 2000,
        completedQuantity: 0,
        requiredCoverage: 60,
        requiredUniformity: 85,
        deadline: Date.now() + 10 * 24 * 3600000,
        priority: 'low',
        assignedMachines: machineIds.length > 3 ? [machineIds[3]] : []
      })
    }
  }

  function init() {
    loadPersistedSchemes()
    loadPersistedTemplates()
    loadPersistedHistory()
    loadPersistedExperiments()
    loadPersistedAgingAnalyses()
    loadPersistedMachines()
    loadPersistedOrders()
    loadPersistedMultiMachineResults()
    initDemoData()
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
    paramsValid,
    validationErrors,
    shouldRecompute,
    compareSchemeData,
    templates,
    activeTemplateId,
    activeTemplate,
    selectedShapeId,
    history,
    playbackState,
    experiments,
    activeExperiment,
    activeExperimentId,
    experimentProgress,
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
    clearCompare,
    generateReport,
    downloadReport,
    generateReportFromResult,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    setActiveTemplate,
    addShape,
    updateShape,
    deleteShape,
    selectShape,
    importTemplate,
    exportTemplate,
    jumpToHistory,
    startPlayback,
    pausePlayback,
    resumePlayback,
    stopPlayback,
    setPlaybackSpeed,
    setPlaybackDirection,
    clearHistory,
    startBatchExperiment,
    cancelBatchExperiment,
    deleteExperiment,
    applyExperimentScheme,
    setActiveExperiment,
    recordHistory,
    envParams,
    agingAnalyses,
    activeAgingId,
    activeAgingAnalysis,
    currentAgingPoint,
    agingPlaybackIndex,
    agingPlaybackState,
    agingSteps,
    agingProgress,
    agingRunning,
    updateEnvParam,
    resetEnvParams,
    setAgingSteps,
    startAgingAnalysis,
    setActiveAgingAnalysis,
    deleteAgingAnalysis,
    jumpToAgingIndex,
    startAgingPlayback,
    pauseAgingPlayback,
    resumeAgingPlayback,
    stopAgingPlayback,
    setAgingPlaybackSpeed,
    setAgingPlaybackDirection,
    applyAgingPointParams,
    machines,
    orders,
    multiMachineResults,
    activeMultiSimId,
    activeMultiSimResult,
    multiSimBatchesPerMachine,
    multiSimRunning,
    addMachine,
    updateMachine,
    deleteMachine,
    addOrder,
    updateOrder,
    deleteOrder,
    startMultiMachineSimulation,
    setActiveMultiSimResult,
    deleteMultiSimResult,
    downloadMultiMachineReport,
    init
  }
})
