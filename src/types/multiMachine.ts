import type { PrintParams, SimulationResult } from './core'
import type { EnvironmentParams } from './aging'

export type MachineStatus = 'running' | 'idle' | 'maintenance' | 'warning' | 'offline'

export interface MachineConfig {
  id: string
  name: string
  params: PrintParams
  envParams: EnvironmentParams
  status: MachineStatus
  capacity: number
  allocatedCapacity: number
  rollerWear: number
  totalRunCount: number
  lastMaintenanceTime: number
  createdAt: number
  color: string
  effectiveCapacity?: number
}

export interface BatchQualityRecord {
  batchId: string
  machineId: string
  machineName: string
  sequenceIndex: number
  params: PrintParams
  envParams: EnvironmentParams
  result: SimulationResult
  riskScore: number
  timestamp: number
  qualityGrade: 'A' | 'B' | 'C' | 'D'
}

export interface AnomalySource {
  id: string
  batchId: string
  machineId: string
  machineName: string
  anomalyType: 'coverage_drop' | 'uniformity_drop' | 'risk_spike' | 'parameter_drift' | 'wear_degradation'
  severity: 'mild' | 'moderate' | 'severe'
  description: string
  rootCause: string
  affectedMetric: string
  affectedValue: number
  expectedValue: number
  deviation: number
  suggestedFix: string
  confidence: number
}

export interface MachineMetrics {
  machineId: string
  machineName: string
  avgCoverage: number
  avgUniformity: number
  avgRiskScore: number
  coverageStdDev: number
  uniformityStdDev: number
  qualityDistribution: { A: number; B: number; C: number; D: number }
  trendSlope: number
  anomalyCount: number
  effectiveCapacity: number
  color: string
}

export interface CrossMachineComparison {
  id: string
  timestamp: number
  machineMetrics: MachineMetrics[]
  bestMachine: { id: string; name: string; reason: string }
  worstMachine: { id: string; name: string; reason: string }
  coverageVariance: number
  uniformityVariance: number
  riskVariance: number
  correlations: { machineA: string; machineB: string; metric: string; value: number }[]
  insights: string[]
}

export interface OrderInfo {
  id: string
  name: string
  totalQuantity: number
  completedQuantity: number
  requiredCoverage: number
  requiredUniformity: number
  deadline: number
  priority: 'high' | 'medium' | 'low'
  assignedMachines: string[]
  createdAt: number
  status: 'pending' | 'in_progress' | 'at_risk' | 'completed' | 'overdue'
}

export interface DeliveryRiskAssessment {
  orderId: string
  orderName: string
  overallRisk: 'low' | 'medium' | 'high' | 'critical'
  riskScore: number
  progressPercent: number
  estimatedCompletionTime: number
  deadline: number
  onTimeProbability: number
  riskFactors: {
    factor: string
    impact: number
    description: string
    mitigation: string
  }[]
  recommendations: string[]
}

export interface ProductionOptimizationSuggestion {
  id: string
  priority: 'high' | 'medium' | 'low'
  category: 'capacity' | 'quality' | 'maintenance' | 'parameter' | 'allocation'
  title: string
  description: string
  currentStatus: string
  suggestedChange: string
  expectedImprovement: string
  affectedMachines: string[]
  effortLevel: 'low' | 'medium' | 'high'
}

export interface MaintenanceScheduleItem {
  id: string
  machineId: string
  machineName: string
  type: 'preventive' | 'corrective' | 'emergency'
  priority: 'high' | 'medium' | 'low'
  title: string
  description: string
  suggestedTime: number
  estimatedDuration: number
  reason: string
  impactIfDelayed: string
  parts?: string[]
}

export interface MultiMachineSimulationResult {
  id: string
  name: string
  machineIds: string[]
  batches: BatchQualityRecord[]
  anomalies: AnomalySource[]
  crossMachineComparison: CrossMachineComparison
  deliveryRisks: DeliveryRiskAssessment[]
  optimizations: ProductionOptimizationSuggestion[]
  maintenanceSchedule: MaintenanceScheduleItem[]
  summary: {
    totalBatches: number
    avgCoverage: number
    avgUniformity: number
    avgRiskScore: number
    anomalyCount: number
    qualityDistribution: { A: number; B: number; C: number; D: number }
  }
  startedAt: number
  completedAt: number
}
