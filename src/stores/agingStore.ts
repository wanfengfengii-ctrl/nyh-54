import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  EnvironmentParams,
  AgingAnalysisResult,
  TimeSeriesPoint,
  PlaybackState,
  PrintParams,
  ValidationResult,
  SimulationResult
} from '../types'
import {
  DEFAULT_ENV_PARAMS,
  AGING_SIMULATION_CONFIG
} from '../types/constants'
import {
  runAgingAnalysis,
  generateDetailedRiskAnalysis,
  validateParams
} from '../utils/simulation'
import { agingPersistence } from '../utils/persistence'

export const useAgingStore = defineStore('aging', () => {
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

  async function startAgingAnalysis(
    params: PrintParams,
    activeTemplate: any,
    lastValidation: ValidationResult
  ): Promise<AgingAnalysisResult | null> {
    if (!lastValidation.valid) return null
    agingRunning.value = true
    agingProgress.value = { completed: 0, total: agingSteps.value }

    try {
      await new Promise(resolve => setTimeout(resolve, 50))
      const result = runAgingAnalysis(
        params,
        envParams.value,
        agingSteps.value,
        activeTemplate
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

  function applyAgingPointParams(
    point: TimeSeriesPoint,
    callbacks: {
      setParams: (params: PrintParams) => void
      setLastValidation: (validation: ValidationResult) => void
      setCurrentResult: (result: SimulationResult) => void
    }
  ) {
    const validation = validateParams(point.adjustedPrintParams)
    if (!validation.valid) return
    callbacks.setParams({ ...point.adjustedPrintParams })
    callbacks.setLastValidation(validation)
    const result = JSON.parse(JSON.stringify(point.result))
    if (result) {
      result.detailedRisk = generateDetailedRiskAnalysis(
        point.adjustedPrintParams,
        result.coverage,
        result.uniformity,
        result.averageThickness,
        result.thicknessMap,
        result.coverageMap
      )
    }
    callbacks.setCurrentResult(result)
  }

  function persistAgingAnalyses() {
    agingPersistence.save(agingAnalyses.value)
  }

  function loadPersistedAgingAnalyses() {
    const loaded = agingPersistence.load()
    if (loaded) {
      agingAnalyses.value = loaded
    }
  }

  function init() {
    loadPersistedAgingAnalyses()
  }

  return {
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
    init
  }
})
