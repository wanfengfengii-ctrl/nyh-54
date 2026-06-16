export interface PrintParams {
  viscosity: number
  pressure: number
  rollingCount: number
  heightDiff: number
}

export interface RiskAlert {
  type: 'success' | 'warning' | 'danger' | 'info'
  title: string
  message: string
  level: number
}

export interface SimulationResult {
  coverage: number
  uniformity: number
  averageThickness: number
  thicknessMap: number[][]
  riskAlerts: RiskAlert[]
  coverageMap: number[][]
  timestamp: number
}

export interface SavedScheme {
  id: string
  name: string
  params: PrintParams
  result: SimulationResult
  createdAt: number
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

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
