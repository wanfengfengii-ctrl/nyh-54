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
