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
  region?: RiskRegion
  suggestion?: string
}

export interface RiskRegion {
  x: number
  y: number
  width: number
  height: number
  description: string
}

export interface RiskDimension {
  score: number
  recommendation: string
}

export interface DetailedRiskAnalysis {
  overallRiskScore: number
  riskBreakdown: {
    coverageRisk: RiskDimension
    uniformityRisk: RiskDimension
    smearingRisk: RiskDimension
    missingInkRisk: RiskDimension
    heightDifferenceRisk: RiskDimension
    parameterCompatibilityRisk: RiskDimension
  }
  regionalRisks: RegionalRisk[]
  suggestions: string[]
}

export interface RegionalRisk {
  id: string
  regionName: string
  bounds: { x1: number; y1: number; x2: number; y2: number }
  riskType: 'coverage' | 'uniformity' | 'smearing' | 'missing_ink'
  severity: number
  description: string
}

export interface SimulationResult {
  coverage: number
  uniformity: number
  averageThickness: number
  thicknessMap: number[][]
  riskAlerts: RiskAlert[]
  coverageMap: number[][]
  timestamp: number
  detailedRisk?: DetailedRiskAnalysis
  templateId?: string
}

export interface SavedScheme {
  id: string
  name: string
  params: PrintParams
  result: SimulationResult
  createdAt: number
  templateId?: string
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export type ShapeType = 'rectangle' | 'circle' | 'ellipse' | 'polygon' | 'text' | 'freehand'

export interface PlateShape {
  id: string
  type: ShapeType
  x: number
  y: number
  width: number
  height: number
  localHeight: number
  rotation: number
  color: string
  label?: string
  points?: { x: number; y: number }[]
  text?: string
  fontSize?: number
}

export interface PlateTemplate {
  id: string
  name: string
  shapes: PlateShape[]
  baseHeight: number
  createdAt: number
  updatedAt: number
  preview?: string
}

export interface ParamHistoryEntry {
  id: string
  timestamp: number
  params: PrintParams
  result: SimulationResult
  templateId?: string
  note?: string
  changes: {
    param: keyof PrintParams
    oldValue: number
    newValue: number
  }[]
}

export interface PlaybackState {
  isPlaying: boolean
  isPaused: boolean
  currentIndex: number
  speed: number
  direction: 'forward' | 'backward'
}

export interface BatchExperimentConfig {
  name: string
  baseParams: PrintParams
  variables: BatchVariable[]
  optimizationTarget: OptimizationTarget
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

export interface ComparisonReport {
  id: string
  generatedAt: number
  schemes: { id: string; name: string; params: PrintParams; result: SimulationResult }[]
  metricsComparison: {
    [key: string]: {
      values: { schemeId: string; value: number }[]
      best: string
      worst: string
      delta: number
    }
  }
  recommendations: string[]
  summary: string
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
