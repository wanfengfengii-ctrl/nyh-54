import { GRID_WIDTH, GRID_HEIGHT } from '../types'
import type {
  SavedScheme,
  PlateTemplate,
  ParamHistoryEntry,
  BatchExperimentResult,
  AgingAnalysisResult,
  MachineConfig,
  OrderInfo,
  MultiMachineSimulationResult,
  SimulationResult
} from '../types'

const STORAGE_KEYS = {
  SCHEMES: 'print_schemes',
  TEMPLATES: 'print_templates',
  HISTORY: 'print_history',
  EXPERIMENTS: 'print_experiments',
  AGING_ANALYSES: 'print_aging_analyses',
  MACHINES: 'print_machines',
  ORDERS: 'print_orders',
  MULTI_MACHINE_RESULTS: 'print_multi_results'
} as const

interface PersistenceConfig<T> {
  key: string
  maxItems?: number
  transformSave?: (data: T) => unknown
  transformLoad?: (data: unknown) => T
}

function safeSave<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch (e) {
    console.warn(`保存到 localStorage 失败 [${key}]`, e)
  }
}

function safeLoad<T>(key: string): T | null {
  try {
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) : null
  } catch (e) {
    console.warn(`从 localStorage 加载失败 [${key}]`, e)
    return null
  }
}

function stripLargeResultFields(result: SimulationResult): SimulationResult {
  return {
    ...result,
    thicknessMap: undefined as unknown as number[][],
    coverageMap: undefined as unknown as number[][],
    detailedRisk: undefined
  }
}

function restoreLargeResultFields(result: SimulationResult): SimulationResult {
  return {
    ...result,
    thicknessMap: result.thicknessMap ?? Array.from({ length: GRID_HEIGHT }, () => Array(GRID_WIDTH).fill(0)),
    coverageMap: result.coverageMap ?? Array.from({ length: GRID_HEIGHT }, () => Array(GRID_WIDTH).fill(0))
  }
}

const schemeConfig: PersistenceConfig<SavedScheme[]> = {
  key: STORAGE_KEYS.SCHEMES
}

const templateConfig: PersistenceConfig<PlateTemplate[]> = {
  key: STORAGE_KEYS.TEMPLATES
}

const historyConfig: PersistenceConfig<ParamHistoryEntry[]> = {
  key: STORAGE_KEYS.HISTORY,
  maxItems: 100,
  transformSave: (entries) => entries.slice(-100).map(h => ({
    ...h,
    result: stripLargeResultFields(h.result)
  })),
  transformLoad: (data) => (data as ParamHistoryEntry[]).map(h => ({
    ...h,
    result: restoreLargeResultFields(h.result)
  }))
}

const experimentConfig: PersistenceConfig<BatchExperimentResult[]> = {
  key: STORAGE_KEYS.EXPERIMENTS,
  maxItems: 10,
  transformSave: (experiments) => experiments.slice(-10).map(e => ({
    ...e,
    results: e.results.slice(0, 100).map(r => ({
      ...r,
      result: stripLargeResultFields(r.result)
    })),
    paretoFront: e.paretoFront?.slice(0, 20).map(r => ({
      ...r,
      result: stripLargeResultFields(r.result)
    }))
  }))
}

const agingConfig: PersistenceConfig<AgingAnalysisResult[]> = {
  key: STORAGE_KEYS.AGING_ANALYSES,
  maxItems: 3,
  transformSave: (analyses) => analyses.slice(-3).map(a => ({
    ...a,
    timeSeries: a.timeSeries.slice(0, 50).map(p => ({
      ...p,
      result: {
        ...p.result,
        detailedRisk: undefined
      }
    }))
  }))
}

const machineConfig: PersistenceConfig<MachineConfig[]> = {
  key: STORAGE_KEYS.MACHINES
}

const orderConfig: PersistenceConfig<OrderInfo[]> = {
  key: STORAGE_KEYS.ORDERS
}

const multiMachineConfig: PersistenceConfig<MultiMachineSimulationResult[]> = {
  key: STORAGE_KEYS.MULTI_MACHINE_RESULTS,
  maxItems: 5,
  transformSave: (results) => results.slice(-5).map(r => ({
    ...r,
    batches: r.batches.slice(0, 50).map(b => ({
      ...b,
      result: stripLargeResultFields(b.result)
    }))
  }))
}

export function createPersistence<T>(config: PersistenceConfig<T>) {
  return {
    save: (data: T): void => {
      const toStore = config.transformSave ? config.transformSave(data) : data
      safeSave(config.key, toStore)
    },
    load: (): T | null => {
      const data = safeLoad<unknown>(config.key)
      if (data === null) return null
      return config.transformLoad ? config.transformLoad(data) : data as T
    },
    clear: (): void => {
      localStorage.removeItem(config.key)
    }
  }
}

export const schemePersistence = createPersistence(schemeConfig)
export const templatePersistence = createPersistence(templateConfig)
export const historyPersistence = createPersistence(historyConfig)
export const experimentPersistence = createPersistence(experimentConfig)
export const agingPersistence = createPersistence(agingConfig)
export const machinePersistence = createPersistence(machineConfig)
export const orderPersistence = createPersistence(orderConfig)
export const multiMachinePersistence = createPersistence(multiMachineConfig)
