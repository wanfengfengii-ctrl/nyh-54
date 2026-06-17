import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  BatchExperimentConfig,
  BatchExperimentResult,
  PrintParams
} from '../types'
import {
  validateParams,
  runBatchExperiment
} from '../utils/simulation'
import { experimentPersistence } from '../utils/persistence'

export const useExperimentStore = defineStore('experiment', () => {
  const experiments = ref<BatchExperimentResult[]>([])
  const activeExperimentId = ref<string | null>(null)
  const experimentProgress = ref<{ completed: number; total: number } | null>(null)
  const experimentCancelled = ref(false)

  const activeExperiment = computed<BatchExperimentResult | null>(() => {
    if (!activeExperimentId.value) return null
    return experiments.value.find(e => e.id === activeExperimentId.value) ?? null
  })

  async function startBatchExperiment(
    config: BatchExperimentConfig
  ): Promise<BatchExperimentResult | null> {
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
    return {
      params: { ...runParams },
      validation
    }
  }

  function setActiveExperiment(experimentId: string | null) {
    activeExperimentId.value = experimentId
  }

  function persistExperiments() {
    experimentPersistence.save(experiments.value)
  }

  function loadPersistedExperiments() {
    const loaded = experimentPersistence.load()
    if (loaded) {
      experiments.value = loaded
    }
  }

  function init() {
    loadPersistedExperiments()
  }

  return {
    experiments,
    activeExperiment,
    activeExperimentId,
    experimentProgress,
    experimentCancelled,
    startBatchExperiment,
    cancelBatchExperiment,
    deleteExperiment,
    applyExperimentScheme,
    setActiveExperiment,
    init
  }
})
