import type {
  BatchExperimentConfig,
  BatchExperimentResult,
  BatchRunResult,
  PrintParams,
  SimulationResult
} from '../../types'
import { MAX_BATCH_SIZE, COVERAGE_THRESHOLDS } from '../../types'
import { runSimulation } from './core'
import { generateExperimentId } from '../idGenerator'

export function calculateBatchScore(
  result: SimulationResult,
  _target: string,
  customWeights?: { coverage: number; uniformity: number }
): { coverage: number; uniformity: number; balanced: number; custom?: number } {
  let coverageScore: number
  if (result.coverage < COVERAGE_THRESHOLDS.tooLow) {
    coverageScore = result.coverage * 0.5
  } else if (result.coverage > COVERAGE_THRESHOLDS.tooHigh) {
    coverageScore = Math.max(0, 100 - (result.coverage - COVERAGE_THRESHOLDS.tooHigh) * 3)
  } else if (result.coverage >= COVERAGE_THRESHOLDS.optimalMin && result.coverage <= COVERAGE_THRESHOLDS.optimalMax) {
    coverageScore = 100
  } else {
    const distance = result.coverage < COVERAGE_THRESHOLDS.optimalMin
      ? COVERAGE_THRESHOLDS.optimalMin - result.coverage
      : result.coverage - COVERAGE_THRESHOLDS.optimalMax
    coverageScore = Math.max(70, 100 - distance * 2)
  }

  const uniformityScore = result.uniformity
  const balancedScore = coverageScore * 0.5 + uniformityScore * 0.5

  const scores: { coverage: number; uniformity: number; balanced: number; custom?: number } = {
    coverage: Math.round(coverageScore),
    uniformity: Math.round(uniformityScore),
    balanced: Math.round(balancedScore)
  }

  if (customWeights) {
    const totalWeight = customWeights.coverage + customWeights.uniformity
    const normalizedCoverage = customWeights.coverage / totalWeight
    const normalizedUniformity = customWeights.uniformity / totalWeight
    scores.custom = Math.round(coverageScore * normalizedCoverage + uniformityScore * normalizedUniformity)
  }

  return scores
}

function computeParetoFront(results: BatchRunResult[]): BatchRunResult[] {
  const pareto: BatchRunResult[] = []
  for (let i = 0; i < results.length; i++) {
    let dominated = false
    for (let j = 0; j < results.length; j++) {
      if (i === j) continue
      if (
        results[j].score.coverage >= results[i].score.coverage &&
        results[j].score.uniformity >= results[i].score.uniformity &&
        (results[j].score.coverage > results[i].score.coverage ||
         results[j].score.uniformity > results[i].score.uniformity)
      ) {
        dominated = true
        break
      }
    }
    if (!dominated) {
      pareto.push(results[i])
    }
  }
  return pareto.slice(0, 10)
}

export async function runBatchExperiment(
  config: BatchExperimentConfig,
  onProgress?: (completed: number, total: number) => void,
  shouldCancel?: () => boolean
): Promise<BatchExperimentResult> {
  const startedAt = Date.now()
  const paramCombinations: PrintParams[] = []
  const base = { ...config.baseParams }

  const variableValues: Record<string, number[]> = {}
  for (const variable of config.variables) {
    const values: number[] = []
    if (variable.type === 'custom' && variable.customValues) {
      values.push(...variable.customValues)
    } else if (variable.type === 'random') {
      for (let i = 0; i < variable.steps; i++) {
        const val = variable.min + Math.random() * (variable.max - variable.min)
        values.push(Math.round(val * 10) / 10)
      }
    } else {
      if (variable.steps === 1) {
        values.push(variable.min)
      } else {
        const step = (variable.max - variable.min) / (variable.steps - 1)
        for (let i = 0; i < variable.steps; i++) {
          const val = variable.min + step * i
          values.push(Math.round(val * 10) / 10)
        }
      }
    }
    variableValues[variable.param] = values
  }

  function generateCombos(index: number, current: PrintParams, result: PrintParams[]) {
    if (result.length >= MAX_BATCH_SIZE) return
    if (index >= config.variables.length) {
      result.push({ ...current })
      return
    }
    const param = config.variables[index].param
    for (const val of variableValues[param]) {
      if (result.length >= MAX_BATCH_SIZE) break
      current[param] = val
      generateCombos(index + 1, current, result)
    }
  }

  generateCombos(0, { ...base }, paramCombinations)

  const results: BatchRunResult[] = []
  const total = paramCombinations.length

  for (let i = 0; i < total; i++) {
    if (shouldCancel && shouldCancel()) {
      return {
        id: generateExperimentId(),
        name: config.name,
        config,
        results,
        startedAt,
        completedAt: Date.now(),
        status: 'cancelled'
      }
    }

    const params = paramCombinations[i]
    const result = runSimulation(params)
    const score = calculateBatchScore(result, config.optimizationTarget, config.customWeights)

    results.push({
      runId: `run_${i}_${Date.now()}`,
      index: i,
      params,
      result,
      score
    })

    if (onProgress && (i % Math.max(1, Math.floor(total / 50)) === 0 || i === total - 1)) {
      onProgress(i + 1, total)
      await new Promise(resolve => setTimeout(resolve, 0))
    }
  }

  let targetKey: keyof BatchRunResult['score'] = 'balanced'
  if (config.optimizationTarget === 'coverage') targetKey = 'coverage'
  else if (config.optimizationTarget === 'uniformity') targetKey = 'uniformity'
  else if (config.optimizationTarget === 'custom') targetKey = 'custom'

  results.sort((a, b) => (b.score[targetKey] ?? 0) - (a.score[targetKey] ?? 0))
  results.forEach((r, idx) => { r.rank = idx + 1 })

  const recommendedScheme = results[0]
  const paretoFront = computeParetoFront(results)

  return {
    id: generateExperimentId(),
    name: config.name,
    config,
    results,
    startedAt,
    completedAt: Date.now(),
    status: 'completed',
    recommendedScheme,
    paretoFront
  }
}
