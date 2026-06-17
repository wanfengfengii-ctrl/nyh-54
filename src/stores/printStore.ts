import { defineStore, storeToRefs } from 'pinia'
import type {
  PrintParams,
  SimulationResult,
  SavedScheme,
  ValidationResult,
  PlateTemplate,
  PlateShape,
  BatchExperimentConfig,
  ComparisonReport,
  MachineConfig,
  OrderInfo,
  MultiMachineSimulationResult
} from '../types'
import { useCorePrintStore } from './corePrintStore'
import { useTemplateStore } from './templateStore'
import { useHistoryStore } from './historyStore'
import { useExperimentStore } from './experimentStore'
import { useAgingStore } from './agingStore'
import { useMultiMachineStore } from './multiMachineStore'

export const usePrintStore = defineStore('print', () => {
  const corePrint = useCorePrintStore()
  const templateStore = useTemplateStore()
  const historyStore = useHistoryStore()
  const experimentStore = useExperimentStore()
  const agingStore = useAgingStore()
  const multiMachineStore = useMultiMachineStore()

  const {
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
    compareSchemeData
  } = storeToRefs(corePrint)

  const {
    templates,
    activeTemplateId,
    activeTemplate,
    selectedShapeId
  } = storeToRefs(templateStore)

  const {
    history,
    playbackState
  } = storeToRefs(historyStore)

  const {
    experiments,
    activeExperiment,
    activeExperimentId: expActiveExperimentId,
    experimentProgress,
    experimentCancelled
  } = storeToRefs(experimentStore)

  const {
    envParams,
    agingAnalyses,
    activeAgingId,
    activeAgingAnalysis,
    currentAgingPoint,
    agingPlaybackIndex,
    agingPlaybackState,
    agingSteps,
    agingProgress,
    agingRunning
  } = storeToRefs(agingStore)

  const {
    machines,
    orders,
    multiMachineResults,
    activeMultiSimId,
    activeMultiSimResult,
    multiSimBatchesPerMachine,
    multiSimRunning
  } = storeToRefs(multiMachineStore)

  const activeExperimentId = expActiveExperimentId

  function computeParamChanges(
    oldParams: PrintParams | null,
    newParams: PrintParams
  ): string[] {
    const changes: string[] = []
    if (!oldParams) return changes
    for (const key of Object.keys(oldParams)) {
      const k = key as keyof PrintParams
      if (oldParams[k] !== newParams[k]) {
        changes.push(k)
      }
    }
    return changes
  }

  function updateParam(key: keyof PrintParams, value: number) {
    const oldParams = { ...params.value }
    corePrint.updateParam(key, value)
    const changedKeys = computeParamChanges(oldParams, params.value)
    if (changedKeys.length > 0 && !playbackState.value.isPlaying && currentResult.value) {
      historyStore.recordHistory(currentResult.value, params.value, oldParams, activeTemplateId.value)
    }
  }

  function setParams(p: Partial<PrintParams>) {
    const oldParams = { ...params.value }
    corePrint.setParams(p)
    const changedKeys = computeParamChanges(oldParams, params.value)
    if (changedKeys.length > 0 && !playbackState.value.isPlaying && currentResult.value) {
      historyStore.recordHistory(currentResult.value, params.value, oldParams, activeTemplateId.value)
    }
  }

  function simulate(skipHistory = false, activeTemplate: PlateTemplate | null = null) {
    const result = corePrint.simulate(skipHistory, activeTemplate)
    if (result && !skipHistory && !playbackState.value.isPlaying) {
      historyStore.recordHistory(result, params.value, lastParams.value, activeTemplateId.value)
    }
    return result
  }

  function saveScheme(name: string) {
    const result = corePrint.saveScheme(name, activeTemplateId.value)
    return result
  }

  function loadScheme(schemeId: string | SavedScheme) {
    const id = typeof schemeId === 'string' ? schemeId : schemeId.id
    const scheme = typeof schemeId === 'string' 
      ? savedSchemes.value.find(s => s.id === id) 
      : schemeId
    corePrint.loadScheme(id)
    if (scheme?.templateId) {
      templateStore.setActiveTemplate(scheme.templateId)
    }
    if (currentResult.value) {
      historyStore.recordHistory(currentResult.value, params.value, lastParams.value, activeTemplateId.value)
    }
  }

  function deleteScheme(schemeId: string) {
    corePrint.deleteScheme(schemeId)
  }

  function clearSchemes() {
    corePrint.clearSchemes()
  }

  function addToCompare(scheme: SavedScheme | string) {
    const id = typeof scheme === 'string' ? scheme : scheme.id
    corePrint.addToCompare(id)
  }

  function removeFromCompare(schemeId: string) {
    corePrint.removeFromCompare(schemeId)
  }

  function clearComparison() {
    corePrint.clearCompare()
  }

  function clearCompare() {
    corePrint.clearCompare()
  }

  function toggleCompare(id: string) {
    corePrint.toggleCompare(id)
  }

  function importScheme(jsonStr: string): { success: boolean; message: string } {
    return corePrint.importScheme(jsonStr)
  }

  function generateReport(): ComparisonReport | null {
    return corePrint.generateReport()
  }

  function generateReportFromResult() {
    return corePrint.generateReportFromResult()
  }

  function exportReport(report: ComparisonReport): string {
    return corePrint.exportReport(report)
  }

  function createTemplate(name?: string, presetName?: string): PlateTemplate {
    return templateStore.createTemplate(presetName, name)
  }

  function createTemplateFromPreset(presetName: string): PlateTemplate {
    return templateStore.createTemplateFromPreset(presetName)
  }

  function updateTemplate(templateOrId: PlateTemplate | string, updates?: Partial<PlateTemplate>) {
    if (typeof templateOrId === 'string') {
      const template = templates.value.find(t => t.id === templateOrId)
      if (template && updates) {
        templateStore.updateTemplate({ ...template, ...updates })
      }
    } else {
      templateStore.updateTemplate(templateOrId)
    }
  }

  function setActiveTemplate(id: string | null) {
    templateStore.setActiveTemplate(id)
  }

  function deleteTemplate(id: string) {
    templateStore.deleteTemplate(id)
  }

  function addShape(templateId: string, shape: Omit<PlateShape, 'id'>): PlateShape | null {
    return templateStore.addShape(templateId, shape)
  }

  function updateShape(templateId: string, shapeId: string, updates: Partial<PlateShape>) {
    templateStore.updateShape(templateId, shapeId, updates)
  }

  function deleteShape(templateId: string, shapeId: string) {
    templateStore.deleteShape(templateId, shapeId)
  }

  function selectShape(shapeId: string | null) {
    templateStore.selectShape(shapeId)
  }

  function importTemplate(jsonString: string): { success: boolean; message: string } | PlateTemplate {
    return templateStore.importTemplate(jsonString)
  }

  function exportTemplate(templateId: string): void {
    return templateStore.exportTemplate(templateId)
  }

  function recordHistory(result?: SimulationResult) {
    const r = result ?? currentResult.value
    if (r) {
      historyStore.recordHistory(r, params.value, lastParams.value, activeTemplateId.value)
    }
  }

  function jumpToHistory(index: number) {
    const entry = historyStore.jumpToHistory(index, {
      setParams: (p) => corePrint.setParams(p),
      setCurrentResult: (r) => { currentResult.value = r }
    })
    if (entry?.templateId) {
      templateStore.setActiveTemplate(entry.templateId)
    }
  }

  function startPlayback() {
    historyStore.startPlayback((entry) => {
      corePrint.setParams(entry.params)
      currentResult.value = JSON.parse(JSON.stringify(entry.result))
      if (entry.templateId) {
        templateStore.setActiveTemplate(entry.templateId)
      }
    })
  }

  function pausePlayback() {
    historyStore.pausePlayback()
  }

  function resumePlayback() {
    historyStore.resumePlayback((entry) => {
      corePrint.setParams(entry.params)
      currentResult.value = JSON.parse(JSON.stringify(entry.result))
      if (entry.templateId) {
        templateStore.setActiveTemplate(entry.templateId)
      }
    })
  }

  function stopPlayback() {
    historyStore.stopPlayback()
  }

  function clearHistory() {
    historyStore.clearHistory()
  }

  function startBatchExperiment(config: BatchExperimentConfig) {
    return experimentStore.startBatchExperiment(config)
  }

  function cancelBatchExperiment() {
    experimentStore.cancelBatchExperiment()
  }

  function deleteExperiment(experimentId: string) {
    experimentStore.deleteExperiment(experimentId)
  }

  function setActiveExperiment(experimentId: string | null) {
    experimentStore.setActiveExperiment(experimentId)
  }

  function applyExperimentScheme(runParams: PrintParams) {
    const result = experimentStore.applyExperimentScheme(runParams)
    if (result) {
      corePrint.setParams(result.params)
      lastValidation.value = result.validation
      corePrint.simulate()
    }
  }

  function startAgingAnalysis() {
    return agingStore.startAgingAnalysis(params.value, activeTemplate.value, lastValidation.value)
  }

  function startAgingPlayback() {
    agingStore.startAgingPlayback()
  }

  function pauseAgingPlayback() {
    agingStore.pauseAgingPlayback()
  }

  function resumeAgingPlayback() {
    agingStore.resumeAgingPlayback()
  }

  function stopAgingPlayback() {
    agingStore.stopAgingPlayback()
  }

  function setAgingSteps(steps: number) {
    agingStore.setAgingSteps(steps)
  }

  function applyAgingPointParams(point: { adjustedParams: PrintParams } | any) {
    const adjustedParams = point.adjustedParams || point.adjustedPrintParams
    corePrint.setParams(adjustedParams)
    corePrint.simulate()
  }

  function addMachine(name?: string, customParams?: Partial<MachineConfig>) {
    return multiMachineStore.addMachine(name, customParams)
  }

  function updateMachine(id: string, updates: Partial<MachineConfig>) {
    multiMachineStore.updateMachine(id, updates)
  }

  function deleteMachine(id: string) {
    multiMachineStore.deleteMachine(id)
  }

  function addOrder(order: Omit<OrderInfo, 'id'> | Omit<OrderInfo, 'id' | 'createdAt' | 'status'>) {
    const fullOrder: Omit<OrderInfo, 'id'> = {
      createdAt: Date.now(),
      status: 'pending',
      ...order
    } as Omit<OrderInfo, 'id'>
    return multiMachineStore.addOrder(fullOrder)
  }

  function init() {
    corePrint.init()
    templateStore.init()
    historyStore.init()
    experimentStore.init()
    agingStore.init()
    multiMachineStore.init()
  }

  function updateOrder(id: string, updates: Partial<OrderInfo>) {
    multiMachineStore.updateOrder(id, updates)
  }

  function deleteOrder(id: string) {
    multiMachineStore.deleteOrder(id)
  }

  function startMultiMachineSimulation() {
    return multiMachineStore.startMultiMachineSimulation()
  }

  function downloadMultiMachineReport(result: MultiMachineSimulationResult) {
    return multiMachineStore.downloadMultiMachineReport(result)
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
    experimentCancelled,
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
    machines,
    orders,
    multiMachineResults,
    activeMultiSimId,
    activeMultiSimResult,
    multiSimBatchesPerMachine,
    multiSimRunning,
    updateParam,
    setParams,
    simulate,
    validateSingleParam: corePrint.validateSingleParam,
    saveScheme,
    loadScheme,
    deleteScheme,
    clearSchemes,
    addToCompare,
    removeFromCompare,
    clearComparison,
    generateReport,
    generateReportFromResult,
    exportReport,
    importScheme,
    clearCompare,
    toggleCompare,
    createTemplate,
    createTemplateFromPreset,
    updateTemplate,
    setActiveTemplate,
    deleteTemplate,
    addShape,
    updateShape,
    deleteShape,
    selectShape,
    importTemplate,
    exportTemplate,
    recordHistory,
    jumpToHistory,
    startPlayback,
    pausePlayback,
    resumePlayback,
    stopPlayback,
    clearHistory,
    setPlaybackDirection: historyStore.setPlaybackDirection,
    setPlaybackSpeed: historyStore.setPlaybackSpeed,
    startBatchExperiment,
    cancelBatchExperiment,
    deleteExperiment,
    setActiveExperiment,
    applyExperimentScheme,
    startAgingAnalysis,
    setAgingSteps,
    updateEnvParam: agingStore.updateEnvParam,
    jumpToAgingIndex: agingStore.jumpToAgingIndex,
    resetEnvParams: agingStore.resetEnvParams,
    setActiveAgingAnalysis: agingStore.setActiveAgingAnalysis,
    deleteAgingAnalysis: agingStore.deleteAgingAnalysis,
    setAgingPlaybackDirection: agingStore.setAgingPlaybackDirection,
    setAgingPlaybackSpeed: agingStore.setAgingPlaybackSpeed,
    startAgingPlayback,
    pauseAgingPlayback,
    resumeAgingPlayback,
    stopAgingPlayback,
    applyAgingPointParams,
    resetParams: corePrint.resetParams,
    invalidateParam: corePrint.invalidateParam,
    setActiveMultiSimResult: multiMachineStore.setActiveMultiSimResult,
    deleteMultiSimResult: multiMachineStore.deleteMultiSimResult,
    addMachine,
    updateMachine,
    deleteMachine,
    addOrder,
    updateOrder,
    deleteOrder,
    startMultiMachineSimulation,
    downloadMultiMachineReport,
    init,
    setCurrentResult: (r: SimulationResult | null) => { currentResult.value = r },
    setLastValidation: (v: ValidationResult) => { lastValidation.value = v }
  }
})
