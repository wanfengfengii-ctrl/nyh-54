import type { PrintParams, SimulationResult } from './core'

export interface EnvironmentParams {
  temperature: number
  humidity: number
  rollerWear: number
  paperAbsorption: number
  printRunCount: number
}

export interface TimeSeriesPoint {
  index: number
  timestamp: number
  envParams: EnvironmentParams
  adjustedPrintParams: PrintParams
  result: SimulationResult
  riskScore: number
}

export interface AgingAnalysisResult {
  id: string
  name: string
  baseParams: PrintParams
  baseEnvParams: EnvironmentParams
  timeSeries: TimeSeriesPoint[]
  totalSteps: number
  startTime: number
  endTime: number
  coverageTrend: { slope: number; stability: number }
  uniformityTrend: { slope: number; stability: number }
  riskTrend: { slope: number; stability: number }
  abnormalPhases: AbnormalPhase[]
  qualityAnalysis: QualityAnalysis
  maintenanceSuggestions: MaintenanceSuggestion[]
}

export interface AbnormalPhase {
  id: string
  startIndex: number
  endIndex: number
  type: 'coverage_drop' | 'uniformity_drop' | 'risk_spike' | 'sudden_change'
  severity: 'mild' | 'moderate' | 'severe'
  description: string
  magnitude: number
  suspectedCause: string
}

export interface QualityAnalysis {
  overallStability: number
  degradationRate: number
  estimatedRemainingLife: number
  keyFactors: { factor: string; impact: number; description: string }[]
  qualityPhases: { name: string; startIndex: number; endIndex: number; quality: 'excellent' | 'good' | 'fair' | 'poor' }[]
}

export interface MaintenanceSuggestion {
  id: string
  priority: 'high' | 'medium' | 'low'
  category: 'roller' | 'ink' | 'paper' | 'environment' | 'general'
  title: string
  description: string
  suggestedAction: string
  estimatedImpact: string
}
