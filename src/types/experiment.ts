import type { PrintParams, SimulationResult } from './core'

export interface CustomWeights {
  coverage: number
  uniformity: number
  thickness?: number
}

export interface BatchExperimentConfig {
  name: string
  baseParams: PrintParams
  variables: BatchVariable[]
  optimizationTarget: OptimizationTarget
  customWeights?: CustomWeights
}

export interface BatchVariable {
  param: keyof PrintParams
  min: number
  max: number
  steps: number
  type: 'linear' | 'random' | 'custom'
  customValues?: number[]
}

export type OptimizationTarget = 'coverage' | 'uniformity' | 'balanced' | 'custom'

export interface BatchExperimentResult {
  id: string
  name: string
  config: BatchExperimentConfig
  results: BatchRunResult[]
  startedAt: number
  completedAt: number
  status: 'running' | 'completed' | 'cancelled'
  recommendedScheme?: BatchRunResult
  paretoFront?: BatchRunResult[]
}

export interface BatchRunResult {
  runId: string
  index: number
  params: PrintParams
  result: SimulationResult
  score: {
    coverage: number
    uniformity: number
    balanced: number
    custom?: number
  }
  rank?: number
}
