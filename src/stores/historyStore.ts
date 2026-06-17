import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  ParamHistoryEntry,
  PlaybackState,
  PrintParams,
  SimulationResult
} from '../types'
import {
  MAX_HISTORY_SIZE,
  GRID_WIDTH,
  GRID_HEIGHT
} from '../types/constants'
import {
  generateHistoryId
} from '../utils/idGenerator'
import { historyPersistence } from '../utils/persistence'

export const useHistoryStore = defineStore('history', () => {
  const history = ref<ParamHistoryEntry[]>([])
  const playbackState = ref<PlaybackState>({
    isPlaying: false,
    isPaused: false,
    currentIndex: -1,
    speed: 1000,
    direction: 'forward'
  })
  let playbackTimer: number | null = null

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

  function recordHistory(
    result: SimulationResult,
    params: PrintParams,
    lastParams: PrintParams | null,
    activeTemplateId: string | null = null
  ) {
    if (playbackState.value.isPlaying) return
    const changes = computeParamChanges(lastParams, params)
    if (changes.length === 0 && history.value.length > 0) return

    const entry: ParamHistoryEntry = {
      id: generateHistoryId(),
      timestamp: Date.now(),
      params: { ...params },
      result: JSON.parse(JSON.stringify(result)),
      templateId: activeTemplateId ?? undefined,
      changes
    }

    history.value.push(entry)
    if (history.value.length > MAX_HISTORY_SIZE) {
      history.value.splice(0, history.value.length - MAX_HISTORY_SIZE)
    }

    playbackState.value.currentIndex = history.value.length - 1
    persistHistory()
  }

  function jumpToHistory(
    index: number,
    callbacks?: {
      setParams: (params: PrintParams) => void
      setCurrentResult: (result: SimulationResult) => void
      setActiveTemplate?: (templateId: string | null) => void
    }
  ): ParamHistoryEntry | null {
    if (index < 0 || index >= history.value.length) return null
    const entry = history.value[index]
    if (callbacks) {
      callbacks.setParams({ ...entry.params })
      callbacks.setCurrentResult(JSON.parse(JSON.stringify(entry.result)))
      playbackState.value.currentIndex = index
      if (entry.templateId && callbacks.setActiveTemplate) {
        callbacks.setActiveTemplate(entry.templateId)
      }
    }
    return entry
  }

  function startPlayback(
    callback: (entry: ParamHistoryEntry) => void
  ) {
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
      playbackState.value.currentIndex = next
      const entry = history.value[next]
      callback(entry)
      playbackTimer = window.setTimeout(tick, playbackState.value.speed)
    }
    playbackTimer = window.setTimeout(tick, playbackState.value.speed)
  }

  function pausePlayback() {
    playbackState.value.isPaused = true
  }

  function resumePlayback(
    callback: (entry: ParamHistoryEntry) => void
  ) {
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
      playbackState.value.currentIndex = next
      const entry = history.value[next]
      callback(entry)
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
    historyPersistence.clear()
  }

  function persistHistory() {
    historyPersistence.save(history.value)
  }

  function loadPersistedHistory() {
    const loaded = historyPersistence.load()
    if (loaded) {
      history.value = loaded.map((h: ParamHistoryEntry) => ({
        ...h,
        result: {
          ...h.result,
          thicknessMap: h.result.thicknessMap ?? Array.from({ length: GRID_HEIGHT }, () => Array(GRID_WIDTH).fill(0)),
          coverageMap: h.result.coverageMap ?? Array.from({ length: GRID_HEIGHT }, () => Array(GRID_WIDTH).fill(0))
        }
      }))
      playbackState.value.currentIndex = history.value.length - 1
    }
  }

  function init() {
    loadPersistedHistory()
  }

  return {
    history,
    playbackState,
    computeParamChanges,
    recordHistory,
    jumpToHistory,
    startPlayback,
    pausePlayback,
    resumePlayback,
    stopPlayback,
    setPlaybackSpeed,
    setPlaybackDirection,
    clearHistory,
    init
  }
})
