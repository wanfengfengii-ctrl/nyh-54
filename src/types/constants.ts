import type { PrintParams, EnvironmentParams, MachineConfig } from './'

export const GRID_WIDTH = 120
export const GRID_HEIGHT = 80

export const DEFAULT_PARAMS: PrintParams = {
  viscosity: 50,
  pressure: 50,
  rollingCount: 3,
  heightDiff: 0
}

export const PARAMS_RANGES = {
  viscosity: { min: 1, max: 100, step: 1, unit: 'cP' },
  pressure: { min: 1, max: 100, step: 1, unit: 'MPa' },
  rollingCount: { min: 1, max: 20, step: 1, unit: '次' },
  heightDiff: { min: 0, max: 50, step: 0.5, unit: 'μm' }
} as const

export const COVERAGE_THRESHOLDS = {
  tooLow: 30,
  optimalMin: 50,
  optimalMax: 85,
  tooHigh: 95
} as const

export const TEMPLATE_PRESETS: { name: string; description: string }[] = [
  { name: '标准文字', description: '均匀分布的文字区域' },
  { name: '图文混排', description: '图片与文字混合布局' },
  { name: '大幅面', description: '大面积实心区域' },
  { name: '精细线条', description: '细线条和复杂图形' },
  { name: '空白模板', description: '从零开始设计' }
]

export const LOCAL_HEIGHT_RANGE = { min: 0, max: 50, step: 0.5, unit: 'μm' }

export const PLAYBACK_SPEEDS = [
  { label: '0.5x', value: 2000 },
  { label: '1x', value: 1000 },
  { label: '2x', value: 500 },
  { label: '4x', value: 250 }
]

export const MAX_HISTORY_SIZE = 200
export const MAX_BATCH_SIZE = 500

export const DEFAULT_ENV_PARAMS: EnvironmentParams = {
  temperature: 25,
  humidity: 50,
  rollerWear: 0,
  paperAbsorption: 50,
  printRunCount: 0
}

export const ENV_PARAMS_RANGES = {
  temperature: { min: 10, max: 40, step: 0.5, unit: '°C' },
  humidity: { min: 20, max: 90, step: 1, unit: '%' },
  rollerWear: { min: 0, max: 100, step: 1, unit: '%' },
  paperAbsorption: { min: 20, max: 80, step: 1, unit: '%' },
  printRunCount: { min: 0, max: 10000, step: 100, unit: '次' }
} as const

export const AGING_SIMULATION_CONFIG = {
  defaultSteps: 50,
  minSteps: 10,
  maxSteps: 200,
  defaultStepInterval: 100
} as const

export const MACHINE_COLORS = [
  '#2563eb', '#059669', '#d97706', '#7c3aed', '#dc2626',
  '#0891b2', '#4f46e5', '#c026d3', '#65a30d', '#ea580c'
] as const

export const DEFAULT_MACHINE_CONFIG: Omit<MachineConfig, 'id' | 'name' | 'createdAt' | 'color'> = {
  params: { ...DEFAULT_PARAMS },
  envParams: { ...DEFAULT_ENV_PARAMS },
  status: 'idle',
  capacity: 100,
  allocatedCapacity: 0,
  rollerWear: 0,
  totalRunCount: 0,
  lastMaintenanceTime: Date.now()
}

export const QUALITY_GRADE_THRESHOLDS = {
  A: { minCoverage: 65, minUniformity: 80, maxRisk: 25 },
  B: { minCoverage: 50, minUniformity: 65, maxRisk: 45 },
  C: { minCoverage: 35, minUniformity: 50, maxRisk: 65 },
  D: { minCoverage: 0, minUniformity: 0, maxRisk: 100 }
} as const

export const MACHINE_CAPACITY_RANGES = {
  capacity: { min: 10, max: 200, step: 10, unit: '件/批' },
  rollerWear: { min: 0, max: 100, step: 1, unit: '%' },
  totalRunCount: { min: 0, max: 50000, step: 500, unit: '次' }
} as const
