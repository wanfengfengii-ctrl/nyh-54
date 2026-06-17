import {
  QUALITY_GRADE_THRESHOLDS,
  PARAMS_RANGES
} from '../../types/constants'
import type {
  PrintParams,
  MachineConfig,
  BatchQualityRecord,
  AnomalySource,
  MachineMetrics,
  CrossMachineComparison,
  OrderInfo,
  DeliveryRiskAssessment,
  ProductionOptimizationSuggestion,
  MaintenanceScheduleItem,
  MultiMachineSimulationResult
} from '../../types'
import { runSimulation } from './core'
import { adjustParamsByEnvironment, calculateTrend } from './aging'
import { generateMultiMachineResultId } from '../idGenerator'

function seededRandom(seed: number) {
  let s = seed
  return function() {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

function assignQualityGrade(
  coverage: number,
  uniformity: number,
  riskScore: number
): 'A' | 'B' | 'C' | 'D' {
  if (coverage >= QUALITY_GRADE_THRESHOLDS.A.minCoverage &&
      uniformity >= QUALITY_GRADE_THRESHOLDS.A.minUniformity &&
      riskScore <= QUALITY_GRADE_THRESHOLDS.A.maxRisk) return 'A'
  if (coverage >= QUALITY_GRADE_THRESHOLDS.B.minCoverage &&
      uniformity >= QUALITY_GRADE_THRESHOLDS.B.minUniformity &&
      riskScore <= QUALITY_GRADE_THRESHOLDS.B.maxRisk) return 'B'
  if (coverage >= QUALITY_GRADE_THRESHOLDS.C.minCoverage &&
      uniformity >= QUALITY_GRADE_THRESHOLDS.C.minUniformity &&
      riskScore <= QUALITY_GRADE_THRESHOLDS.C.maxRisk) return 'C'
  return 'D'
}

function addMachineNoise(
  params: PrintParams,
  machine: MachineConfig,
  batchIndex: number
): PrintParams {
  const seed = machine.rollerWear * 100 + batchIndex * 7 + machine.totalRunCount * 0.01
  const random = seededRandom(Math.floor(seed))
  const noiseScale = 1 + machine.rollerWear * 0.01
  const viscosityNoise = (random() - 0.5) * 4 * noiseScale
  const pressureNoise = (random() - 0.5) * 4 * noiseScale
  const wearPressurePenalty = machine.rollerWear * 0.15
  const adjustedPressure = Math.max(PARAMS_RANGES.pressure.min, params.pressure - wearPressurePenalty + pressureNoise)
  const adjustedViscosity = Math.max(PARAMS_RANGES.viscosity.min, params.viscosity + viscosityNoise)
  const rollingAdjust = machine.rollerWear > 50 ? -1 : 0
  return {
    viscosity: Math.round(adjustedViscosity * 10) / 10,
    pressure: Math.round(adjustedPressure * 10) / 10,
    rollingCount: Math.max(1, params.rollingCount + rollingAdjust),
    heightDiff: Math.max(0, params.heightDiff * (1 - machine.rollerWear * 0.002))
  }
}

export function simulateMultiMachineBatches(
  machines: MachineConfig[],
  batchesPerMachine: number
): BatchQualityRecord[] {
  const batches: BatchQualityRecord[] = []
  let batchCounter = 0
  for (const machine of machines) {
    for (let i = 0; i < batchesPerMachine; i++) {
      const noisyParams = addMachineNoise(machine.params, machine, i)
      const adjustedParams = adjustParamsByEnvironment(noisyParams, machine.envParams)
      const result = runSimulation(adjustedParams)
      const riskScore = result.detailedRisk?.overallRiskScore ??
        result.riskAlerts.reduce((acc, a) => Math.max(acc, a.level * 25), 0)
      const grade = assignQualityGrade(result.coverage, result.uniformity, riskScore)
      batches.push({
        batchId: `batch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        machineId: machine.id,
        machineName: machine.name,
        sequenceIndex: batchCounter++,
        params: adjustedParams,
        envParams: { ...machine.envParams },
        result,
        riskScore,
        timestamp: Date.now() + batchCounter * 60000,
        qualityGrade: grade
      })
    }
  }
  return batches
}

export function locateAnomalies(batches: BatchQualityRecord[]): AnomalySource[] {
  const anomalies: AnomalySource[] = []
  const machineBatches = new Map<string, BatchQualityRecord[]>()
  for (const b of batches) {
    if (!machineBatches.has(b.machineId)) machineBatches.set(b.machineId, [])
    machineBatches.get(b.machineId)!.push(b)
  }
  let anomId = 0
  for (const [machineId, mBatches] of machineBatches) {
    const machineName = mBatches[0].machineName
    const coverages = mBatches.map(b => b.result.coverage)
    const uniformities = mBatches.map(b => b.result.uniformity)
    const risks = mBatches.map(b => b.riskScore)
    const avgCov = coverages.reduce((a, b) => a + b, 0) / coverages.length
    const avgUni = uniformities.reduce((a, b) => a + b, 0) / uniformities.length
    for (let i = 1; i < mBatches.length; i++) {
      const covDrop = coverages[i - 1] - coverages[i]
      if (covDrop > 12) {
        const severity = covDrop > 25 ? 'severe' : covDrop > 18 ? 'moderate' : 'mild'
        anomalies.push({
          id: `anom_${anomId++}`,
          batchId: mBatches[i].batchId,
          machineId,
          machineName,
          anomalyType: 'coverage_drop',
          severity,
          description: `${machineName} 批次${i + 1}覆盖率下降${covDrop.toFixed(1)}%`,
          rootCause: covDrop > 20 ? '滚筒磨损加剧或油墨供给不足' : '环境波动或纸张吸墨性变化',
          affectedMetric: 'coverage',
          affectedValue: coverages[i],
          expectedValue: avgCov,
          deviation: covDrop,
          suggestedFix: covDrop > 20 ? '检查滚筒状态，增加油墨供给量' : '微调压力参数，检查环境条件',
          confidence: Math.min(95, 60 + covDrop * 1.5)
        })
      }
      const uniDrop = uniformities[i - 1] - uniformities[i]
      if (uniDrop > 10) {
        const severity = uniDrop > 20 ? 'severe' : uniDrop > 14 ? 'moderate' : 'mild'
        anomalies.push({
          id: `anom_${anomId++}`,
          batchId: mBatches[i].batchId,
          machineId,
          machineName,
          anomalyType: 'uniformity_drop',
          severity,
          description: `${machineName} 批次${i + 1}均匀度下降${uniDrop.toFixed(1)}%`,
          rootCause: '滚筒磨损不均或印版局部高度变化',
          affectedMetric: 'uniformity',
          affectedValue: uniformities[i],
          expectedValue: avgUni,
          deviation: uniDrop,
          suggestedFix: '检查滚筒均匀性，必要时安排研磨维护',
          confidence: Math.min(90, 55 + uniDrop * 2)
        })
      }
      const riskJump = risks[i] - risks[i - 1]
      if (riskJump > 15) {
        const severity = riskJump > 30 ? 'severe' : riskJump > 22 ? 'moderate' : 'mild'
        anomalies.push({
          id: `anom_${anomId++}`,
          batchId: mBatches[i].batchId,
          machineId,
          machineName,
          anomalyType: 'risk_spike',
          severity,
          description: `${machineName} 批次${i + 1}风险评分突增${riskJump.toFixed(0)}点`,
          rootCause: '设备状态突变或参数漂移',
          affectedMetric: 'riskScore',
          affectedValue: risks[i],
          expectedValue: risks[i - 1],
          deviation: riskJump,
          suggestedFix: '立即排查设备状态，检查参数设置是否漂移',
          confidence: Math.min(88, 50 + riskJump * 1.2)
        })
      }
    }
    const env = mBatches[0].envParams
    if (env.rollerWear > 40) {
      const severity = env.rollerWear > 70 ? 'severe' : env.rollerWear > 55 ? 'moderate' : 'mild'
      const avgRisk = risks.reduce((a, b) => a + b, 0) / risks.length
      if (avgRisk > 45) {
        anomalies.push({
          id: `anom_${anomId++}`,
          batchId: mBatches[mBatches.length - 1].batchId,
          machineId,
          machineName,
          anomalyType: 'wear_degradation',
          severity,
          description: `${machineName} 滚筒磨损${env.rollerWear.toFixed(0)}%导致质量系统性下降`,
          rootCause: `滚筒磨损度${env.rollerWear.toFixed(0)}%，有效压力降低，转移效率下降`,
          affectedMetric: 'overall',
          affectedValue: avgRisk,
          expectedValue: 30,
          deviation: avgRisk - 30,
          suggestedFix: '安排滚筒研磨或更换，重新校准压力参数',
          confidence: Math.min(92, 55 + env.rollerWear * 0.4)
        })
      }
    }
    const firstHalfCov = coverages.slice(0, Math.floor(coverages.length / 2))
    const secondHalfCov = coverages.slice(Math.floor(coverages.length / 2))
    if (firstHalfCov.length > 0 && secondHalfCov.length > 0) {
      const firstAvg = firstHalfCov.reduce((a, b) => a + b, 0) / firstHalfCov.length
      const secondAvg = secondHalfCov.reduce((a, b) => a + b, 0) / secondHalfCov.length
      const drift = firstAvg - secondAvg
      if (drift > 8) {
        anomalies.push({
          id: `anom_${anomId++}`,
          batchId: mBatches[mBatches.length - 1].batchId,
          machineId,
          machineName,
          anomalyType: 'parameter_drift',
          severity: drift > 15 ? 'severe' : drift > 10 ? 'moderate' : 'mild',
          description: `${machineName} 后半批次覆盖率系统性偏移${drift.toFixed(1)}%`,
          rootCause: '设备老化导致参数逐渐漂移，未及时校准',
          affectedMetric: 'coverage',
          affectedValue: secondAvg,
          expectedValue: firstAvg,
          deviation: drift,
          suggestedFix: '重新校准设备参数，安排预防性维护',
          confidence: Math.min(85, 50 + drift * 2.5)
        })
      }
    }
  }
  return anomalies.sort((a, b) => {
    const sevOrder = { severe: 0, moderate: 1, mild: 2 }
    return sevOrder[a.severity] - sevOrder[b.severity] || b.deviation - a.deviation
  })
}

export function computeMachineMetrics(
  machines: MachineConfig[],
  batches: BatchQualityRecord[],
  anomalies: AnomalySource[]
): MachineMetrics[] {
  return machines.map(machine => {
    const mBatches = batches.filter(b => b.machineId === machine.id)
    if (mBatches.length === 0) {
      return {
        machineId: machine.id,
        machineName: machine.name,
        avgCoverage: 0,
        avgUniformity: 0,
        avgRiskScore: 0,
        coverageStdDev: 0,
        uniformityStdDev: 0,
        qualityDistribution: { A: 0, B: 0, C: 0, D: 0 },
        trendSlope: 0,
        anomalyCount: 0,
        effectiveCapacity: machine.capacity,
        color: machine.color
      }
    }
    const coverages = mBatches.map(b => b.result.coverage)
    const uniformities = mBatches.map(b => b.result.uniformity)
    const risks = mBatches.map(b => b.riskScore)
    const avgCov = coverages.reduce((a, b) => a + b, 0) / coverages.length
    const avgUni = uniformities.reduce((a, b) => a + b, 0) / uniformities.length
    const avgRisk = risks.reduce((a, b) => a + b, 0) / risks.length
    const covStdDev = Math.sqrt(coverages.reduce((s, v) => s + Math.pow(v - avgCov, 2), 0) / coverages.length)
    const uniStdDev = Math.sqrt(uniformities.reduce((s, v) => s + Math.pow(v - avgUni, 2), 0) / uniformities.length)
    const dist = { A: 0, B: 0, C: 0, D: 0 }
    mBatches.forEach(b => { dist[b.qualityGrade]++ })
    const trend = calculateTrend(coverages)
    const mAnomalies = anomalies.filter(a => a.machineId === machine.id)
    const wearFactor = 1 - machine.envParams.rollerWear * 0.005
    const effectiveCapacity = Math.round(machine.capacity * Math.max(0.3, wearFactor))
    return {
      machineId: machine.id,
      machineName: machine.name,
      avgCoverage: Math.round(avgCov * 10) / 10,
      avgUniformity: Math.round(avgUni * 10) / 10,
      avgRiskScore: Math.round(avgRisk * 10) / 10,
      coverageStdDev: Math.round(covStdDev * 10) / 10,
      uniformityStdDev: Math.round(uniStdDev * 10) / 10,
      qualityDistribution: dist,
      trendSlope: Math.round(trend.slope * 100) / 100,
      anomalyCount: mAnomalies.length,
      effectiveCapacity,
      color: machine.color
    }
  })
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length
  if (n < 2) return 0
  const meanX = x.reduce((a, b) => a + b, 0) / n
  const meanY = y.reduce((a, b) => a + b, 0) / n
  let num = 0, denX = 0, denY = 0
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX
    const dy = y[i] - meanY
    num += dx * dy
    denX += dx * dx
    denY += dy * dy
  }
  const den = Math.sqrt(denX * denY)
  return den === 0 ? 0 : num / den
}

export function compareAcrossMachines(
  machines: MachineConfig[],
  batches: BatchQualityRecord[],
  anomalies: AnomalySource[]
): CrossMachineComparison {
  const metrics = computeMachineMetrics(machines, batches, anomalies)
  if (metrics.length < 2) {
    return {
      id: `cmp_${Date.now()}`,
      timestamp: Date.now(),
      machineMetrics: metrics,
      bestMachine: { id: metrics[0]?.machineId ?? '', name: metrics[0]?.machineName ?? '', reason: '唯一机台' },
      worstMachine: { id: metrics[0]?.machineId ?? '', name: metrics[0]?.machineName ?? '', reason: '唯一机台' },
      coverageVariance: 0,
      uniformityVariance: 0,
      riskVariance: 0,
      correlations: [],
      insights: ['仅有一台设备，无法进行跨机台对比']
    }
  }
  const bestByQuality = [...metrics].sort((a, b) => {
    const scoreA = a.avgCoverage * 0.3 + a.avgUniformity * 0.3 + (100 - a.avgRiskScore) * 0.2 + (100 - a.anomalyCount * 10) * 0.2
    const scoreB = b.avgCoverage * 0.3 + b.avgUniformity * 0.3 + (100 - b.avgRiskScore) * 0.2 + (100 - b.anomalyCount * 10) * 0.2
    return scoreB - scoreA
  })
  const avgCov = metrics.reduce((s, m) => s + m.avgCoverage, 0) / metrics.length
  const avgUni = metrics.reduce((s, m) => s + m.avgUniformity, 0) / metrics.length
  const avgRisk = metrics.reduce((s, m) => s + m.avgRiskScore, 0) / metrics.length
  const covVar = metrics.reduce((s, m) => s + Math.pow(m.avgCoverage - avgCov, 2), 0) / metrics.length
  const uniVar = metrics.reduce((s, m) => s + Math.pow(m.avgUniformity - avgUni, 2), 0) / metrics.length
  const riskVar = metrics.reduce((s, m) => s + Math.pow(m.avgRiskScore - avgRisk, 2), 0) / metrics.length
  const correlations: { machineA: string; machineB: string; metric: string; value: number }[] = []
  for (let i = 0; i < metrics.length; i++) {
    for (let j = i + 1; j < metrics.length; j++) {
      const mABatches = batches.filter(b => b.machineId === metrics[i].machineId)
      const mBBatches = batches.filter(b => b.machineId === metrics[j].machineId)
      const minLen = Math.min(mABatches.length, mBBatches.length)
      if (minLen >= 3) {
        const covA = mABatches.slice(0, minLen).map(b => b.result.coverage)
        const covB = mBBatches.slice(0, minLen).map(b => b.result.coverage)
        const corr = pearsonCorrelation(covA, covB)
        correlations.push({
          machineA: metrics[i].machineName,
          machineB: metrics[j].machineName,
          metric: 'coverage',
          value: Math.round(corr * 100) / 100
        })
      }
    }
  }
  const insights: string[] = []
  if (covVar > 100) insights.push(`机台间覆盖率差异显著（方差${covVar.toFixed(1)}），建议检查高差异机台的参数设置`)
  if (uniVar > 80) insights.push(`均匀度方差${uniVar.toFixed(1)}，存在机台间质量不均衡`)
  if (riskVar > 200) insights.push('风险评分差异大，个别机台需要重点关注')
  if (bestByQuality[0].anomalyCount === 0 && bestByQuality[metrics.length - 1].anomalyCount > 2) {
    insights.push(`最优机台${bestByQuality[0].machineName}零异常，最差机台${bestByQuality[metrics.length - 1].machineName}有${bestByQuality[metrics.length - 1].anomalyCount}个异常`)
  }
  const highCorrMachines = correlations.filter(c => Math.abs(c.value) > 0.7)
  if (highCorrMachines.length > 0) {
    insights.push(`${highCorrMachines.length}对机台存在强相关性，可能受相同环境因素影响`)
  }
  if (insights.length === 0) insights.push('各机台质量表现均衡，跨机台一致性良好')
  return {
    id: `cmp_${Date.now()}`,
    timestamp: Date.now(),
    machineMetrics: metrics,
    bestMachine: { id: bestByQuality[0].machineId, name: bestByQuality[0].machineName, reason: '综合质量评分最高' },
    worstMachine: { id: bestByQuality[metrics.length - 1].machineId, name: bestByQuality[metrics.length - 1].machineName, reason: '综合质量评分最低' },
    coverageVariance: Math.round(covVar * 10) / 10,
    uniformityVariance: Math.round(uniVar * 10) / 10,
    riskVariance: Math.round(riskVar * 10) / 10,
    correlations,
    insights
  }
}

function getMachineEffectiveCapacity(machine: MachineConfig): number {
  const wearFactor = 1 - machine.envParams.rollerWear * 0.005
  return Math.round(machine.capacity * Math.max(0.3, wearFactor))
}

export function assessDeliveryRisks(
  orders: OrderInfo[],
  machines: MachineConfig[],
  _batches: BatchQualityRecord[],
  anomalies: AnomalySource[]
): DeliveryRiskAssessment[] {
  return orders.map(order => {
    const assignedMachines = machines.filter(m => order.assignedMachines.includes(m.id))
    const orderBatches = _batches.filter(b => order.assignedMachines.includes(b.machineId))
    const orderAnomalies = anomalies.filter(a => order.assignedMachines.includes(a.machineId))
    const progress = order.totalQuantity > 0 ? (order.completedQuantity / order.totalQuantity) * 100 : 0
    const totalCapacity = assignedMachines.reduce((s, m) => s + getMachineEffectiveCapacity(m), 0)
    const remainingQuantity = Math.max(0, order.totalQuantity - order.completedQuantity)
    const avgBatchesPerRun = orderBatches.length > 0 ? orderBatches.length / Math.max(1, assignedMachines.length) : 1
    const capacityPerCycle = totalCapacity * avgBatchesPerRun
    const cyclesNeeded = capacityPerCycle > 0 ? Math.ceil(remainingQuantity / capacityPerCycle) : 999
    const cycleTimeMs = 30 * 60 * 1000
    const estimatedCompletion = Date.now() + cyclesNeeded * cycleTimeMs
    const timeRemaining = order.deadline - Date.now()
    const onTimeProbability = Math.max(0, Math.min(100,
      timeRemaining > 0 ? Math.round(Math.min(1, (timeRemaining / (cyclesNeeded * cycleTimeMs)) * 1.2) * 100) : 0
    ))
    const severeAnomalies = orderAnomalies.filter(a => a.severity === 'severe').length
    const moderateAnomalies = orderAnomalies.filter(a => a.severity === 'moderate').length
    const riskFactorBase = severeAnomalies * 20 + moderateAnomalies * 8
    const qualityCheck = orderBatches.length > 0
      ? orderBatches.filter(b => b.qualityGrade === 'D').length / orderBatches.length
      : 0
    const riskScore = Math.min(100, Math.round(riskFactorBase + qualityCheck * 30 + (100 - onTimeProbability) * 0.3))
    let overallRisk: 'low' | 'medium' | 'high' | 'critical'
    if (riskScore < 25) overallRisk = 'low'
    else if (riskScore < 50) overallRisk = 'medium'
    else if (riskScore < 75) overallRisk = 'high'
    else overallRisk = 'critical'
    const riskFactors: { factor: string; impact: number; description: string; mitigation: string }[] = []
    if (severeAnomalies > 0) {
      riskFactors.push({
        factor: '严重异常',
        impact: severeAnomalies * 20,
        description: `检测到${severeAnomalies}个严重异常，可能导致批次质量不合格`,
        mitigation: '立即排查异常来源，必要时暂停相关机台生产'
      })
    }
    if (onTimeProbability < 70) {
      riskFactors.push({
        factor: '交付延期',
        impact: Math.round((100 - onTimeProbability) * 0.5),
        description: `按时交付概率仅${onTimeProbability}%`,
        mitigation: '增加机台分配或调整生产优先级'
      })
    }
    if (qualityCheck > 0.2) {
      riskFactors.push({
        factor: '质量不合格率',
        impact: Math.round(qualityCheck * 50),
        description: `D级批次占比${(qualityCheck * 100).toFixed(1)}%，质量不达标`,
        mitigation: '优化相关机台参数，加强质量检测'
      })
    }
    const maintenanceMachines = assignedMachines.filter(m => m.envParams.rollerWear > 60)
    if (maintenanceMachines.length > 0) {
      riskFactors.push({
        factor: '设备老化',
        impact: maintenanceMachines.length * 10,
        description: `${maintenanceMachines.length}台设备磨损超过60%，产出质量下降`,
        mitigation: '安排维护排程，必要时替换设备产能'
      })
    }
    const recommendations: string[] = []
    if (overallRisk === 'critical') recommendations.push('订单面临严重风险，建议立即召开生产调度会议')
    if (onTimeProbability < 50) recommendations.push('延期风险高，建议追加机台或调整交付期限')
    if (severeAnomalies > 0) recommendations.push('优先解决严重异常，避免更多批次受到影响')
    if (maintenanceMachines.length > 0) recommendations.push('安排高磨损设备维护，调配产能到状态良好机台')
    if (recommendations.length === 0) recommendations.push('订单进展正常，保持当前生产节奏')
    return {
      orderId: order.id,
      orderName: order.name,
      overallRisk,
      riskScore,
      progressPercent: Math.round(progress * 10) / 10,
      estimatedCompletionTime: estimatedCompletion,
      deadline: order.deadline,
      onTimeProbability,
      riskFactors: riskFactors.sort((a, b) => b.impact - a.impact),
      recommendations
    }
  })
}

export function generateOptimizationSuggestions(
  machines: MachineConfig[],
  _batches: BatchQualityRecord[],
  anomalies: AnomalySource[],
  comparison: CrossMachineComparison,
  deliveryRisks: DeliveryRiskAssessment[]
): ProductionOptimizationSuggestion[] {
  const suggestions: ProductionOptimizationSuggestion[] = []
  let sugId = 0
  const highRiskOrders = deliveryRisks.filter(r => r.overallRisk === 'high' || r.overallRisk === 'critical')
  if (highRiskOrders.length > 0) {
    const idleMachines = machines.filter(m => m.status === 'idle')
    if (idleMachines.length > 0) {
      suggestions.push({
        id: `opt_${sugId++}`,
        priority: 'high',
        category: 'allocation',
        title: '调配闲置机台支援高风险订单',
        description: `有${idleMachines.length}台闲置机台可用于分担${highRiskOrders.length}个高风险订单的产能`,
        currentStatus: `${idleMachines.length}台闲置，${highRiskOrders.length}个订单高风险`,
        suggestedChange: `将${idleMachines.map(m => m.name).join('、')}分配给高风险订单`,
        expectedImprovement: '预计提升交付概率15-30%',
        affectedMachines: idleMachines.map(m => m.id),
        effortLevel: 'low'
      })
    }
  }
  const worstMachine = comparison.worstMachine
  const worstAnomalies = anomalies.filter(a => a.machineId === worstMachine.id)
  if (worstAnomalies.length >= 2) {
    suggestions.push({
      id: `opt_${sugId++}`,
      priority: 'high',
      category: 'quality',
      title: `重点优化${worstMachine.name}质量`,
      description: `${worstMachine.name}异常数最多(${worstAnomalies.length}个)，是质量最差机台`,
      currentStatus: `异常${worstAnomalies.length}个，综合评分最低`,
      suggestedChange: '参考最优机台参数，调整该机台印刷参数',
      expectedImprovement: '预计减少异常30-50%，提升覆盖率5-10%',
      affectedMachines: [worstMachine.id],
      effortLevel: 'medium'
    })
  }
  const wornMachines = machines.filter(m => m.envParams.rollerWear > 50)
  for (const m of wornMachines) {
    suggestions.push({
      id: `opt_${sugId++}`,
      priority: m.envParams.rollerWear > 70 ? 'high' : 'medium',
      category: 'maintenance',
      title: `${m.name}需要维护`,
      description: `${m.name}滚筒磨损${m.envParams.rollerWear.toFixed(0)}%，影响产出质量`,
      currentStatus: `磨损度${m.envParams.rollerWear.toFixed(0)}%`,
      suggestedChange: '安排滚筒研磨或更换，重新校准压力',
      expectedImprovement: '预计恢复15-25%的有效产能',
      affectedMachines: [m.id],
      effortLevel: 'high'
    })
  }
  if (comparison.coverageVariance > 80) {
    const bestMachine = comparison.bestMachine
    const bestConfig = machines.find(m => m.id === bestMachine.id)
    if (bestConfig) {
      suggestions.push({
        id: `opt_${sugId++}`,
        priority: 'medium',
        category: 'parameter',
        title: '统一机台参数基准',
        description: `机台间覆盖率方差${comparison.coverageVariance.toFixed(1)}，差异显著`,
        currentStatus: '各机台参数独立，缺乏统一基准',
        suggestedChange: `以${bestMachine.name}参数为基准(黏度${bestConfig.params.viscosity}cP/压力${bestConfig.params.pressure}MPa)，微调其他机台`,
        expectedImprovement: '预计降低跨机台方差40-60%',
        affectedMachines: machines.map(m => m.id),
        effortLevel: 'medium'
      })
    }
  }
  const lowCapacityMachines = machines.filter(m => m.allocatedCapacity > getMachineEffectiveCapacity(m) * 0.9)
  if (lowCapacityMachines.length > 0) {
    suggestions.push({
      id: `opt_${sugId++}`,
      priority: 'medium',
      category: 'capacity',
      title: '超负荷机台产能调整',
      description: `${lowCapacityMachines.map(m => m.name).join('、')}分配产能接近或超过有效产能`,
      currentStatus: `超负荷${lowCapacityMachines.length}台`,
      suggestedChange: '重新平衡产能分配，将部分任务迁移至低负荷机台',
      expectedImprovement: '降低设备故障风险，提升整体产出稳定性',
      affectedMachines: lowCapacityMachines.map(m => m.id),
      effortLevel: 'low'
    })
  }
  if (suggestions.length === 0) {
    suggestions.push({
      id: `opt_${sugId++}`,
      priority: 'low',
      category: 'quality',
      title: '生产状态良好',
      description: '当前多机台协同生产状态良好，无重大优化需求',
      currentStatus: '各项指标正常',
      suggestedChange: '保持当前参数和产能分配方案',
      expectedImprovement: '持续稳定生产',
      affectedMachines: [],
      effortLevel: 'low'
    })
  }
  return suggestions.sort((a, b) => {
    const priOrder = { high: 0, medium: 1, low: 2 }
    return priOrder[a.priority] - priOrder[b.priority]
  })
}

export function generateMaintenanceSchedule(
  machines: MachineConfig[],
  anomalies: AnomalySource[]
): MaintenanceScheduleItem[] {
  const schedule: MaintenanceScheduleItem[] = []
  let schId = 0
  const now = Date.now()
  for (const machine of machines) {
    const mAnomalies = anomalies.filter(a => a.machineId === machine.id)
    const severeCount = mAnomalies.filter(a => a.severity === 'severe').length
    if (severeCount > 0 || machine.envParams.rollerWear > 75) {
      schedule.push({
        id: `sch_${schId++}`,
        machineId: machine.id,
        machineName: machine.name,
        type: 'emergency',
        priority: 'high',
        title: `${machine.name}紧急维护`,
        description: `${machine.name}存在${severeCount}个严重异常，磨损度${machine.envParams.rollerWear.toFixed(0)}%`,
        suggestedTime: now + 2 * 3600000,
        estimatedDuration: 4,
        reason: '严重异常或高磨损需要立即处理',
        impactIfDelayed: '质量持续恶化，可能导致批量报废',
        parts: ['滚筒组件', '压力校准工具']
      })
    } else if (machine.envParams.rollerWear > 40) {
      schedule.push({
        id: `sch_${schId++}`,
        machineId: machine.id,
        machineName: machine.name,
        type: 'preventive',
        priority: machine.envParams.rollerWear > 55 ? 'high' : 'medium',
        title: `${machine.name}预防性维护`,
        description: `${machine.name}磨损度${machine.envParams.rollerWear.toFixed(0)}%，建议安排维护`,
        suggestedTime: now + 48 * 3600000,
        estimatedDuration: 3,
        reason: '磨损达到预防性维护阈值',
        impactIfDelayed: '磨损加速，可能转为紧急维护',
        parts: ['滚筒研磨工具']
      })
    } else if (mAnomalies.length > 1) {
      schedule.push({
        id: `sch_${schId++}`,
        machineId: machine.id,
        machineName: machine.name,
        type: 'corrective',
        priority: 'medium',
        title: `${machine.name}纠正性维护`,
        description: `${machine.name}出现${mAnomalies.length}个异常，需要排查修正`,
        suggestedTime: now + 24 * 3600000,
        estimatedDuration: 2,
        reason: '异常数量偏多，需排查根本原因',
        impactIfDelayed: '异常可能扩大，影响后续批次质量'
      })
    }
  }
  if (schedule.length === 0) {
    schedule.push({
      id: `sch_${schId++}`,
      machineId: machines[0]?.id ?? '',
      machineName: machines[0]?.name ?? '默认',
      type: 'preventive',
      priority: 'low',
      title: '定期巡检',
      description: '所有设备状态良好，安排常规巡检',
      suggestedTime: now + 168 * 3600000,
      estimatedDuration: 1,
      reason: '常规维护计划',
      impactIfDelayed: '影响较小'
    })
  }
  return schedule.sort((a, b) => {
    const typeOrder = { emergency: 0, corrective: 1, preventive: 2 }
    return typeOrder[a.type] - typeOrder[b.type]
  })
}

export function runMultiMachineSimulation(
  machines: MachineConfig[],
  orders: OrderInfo[],
  batchesPerMachine: number
): MultiMachineSimulationResult {
  const startedAt = Date.now()
  const batches = simulateMultiMachineBatches(machines, batchesPerMachine)
  const anomalies = locateAnomalies(batches)
  const comparison = compareAcrossMachines(machines, batches, anomalies)
  const deliveryRisks = assessDeliveryRisks(orders, machines, batches, anomalies)
  const optimizations = generateOptimizationSuggestions(machines, batches, anomalies, comparison, deliveryRisks)
  const maintenanceSchedule = generateMaintenanceSchedule(machines, anomalies)
  const totalBatches = batches.length
  const avgCoverage = totalBatches > 0 ? batches.reduce((s, b) => s + b.result.coverage, 0) / totalBatches : 0
  const avgUniformity = totalBatches > 0 ? batches.reduce((s, b) => s + b.result.uniformity, 0) / totalBatches : 0
  const avgRiskScore = totalBatches > 0 ? batches.reduce((s, b) => s + b.riskScore, 0) / totalBatches : 0
  const dist = { A: 0, B: 0, C: 0, D: 0 }
  batches.forEach(b => { dist[b.qualityGrade]++ })
  return {
    id: generateMultiMachineResultId(),
    name: `多机台模拟_${new Date().toLocaleDateString()}`,
    machineIds: machines.map(m => m.id),
    batches,
    anomalies,
    crossMachineComparison: comparison,
    deliveryRisks,
    optimizations,
    maintenanceSchedule,
    summary: {
      totalBatches,
      avgCoverage: Math.round(avgCoverage * 10) / 10,
      avgUniformity: Math.round(avgUniformity * 10) / 10,
      avgRiskScore: Math.round(avgRiskScore * 10) / 10,
      anomalyCount: anomalies.length,
      qualityDistribution: dist
    },
    startedAt,
    completedAt: Date.now()
  }
}

export function exportMultiMachineReport(result: MultiMachineSimulationResult): string {
  let text = '='.repeat(70) + '\n'
  text += '       多机台协同生产与质量追溯中心 · 生产优化报告\n'
  text += '='.repeat(70) + '\n\n'
  text += `报告生成时间：${new Date(result.completedAt).toLocaleString('zh-CN')}\n`
  text += `参与机台数：${result.machineIds.length}\n`
  text += `模拟批次数：${result.summary.totalBatches}\n\n`
  text += '【生产概要】\n'
  text += `  平均覆盖率：${result.summary.avgCoverage.toFixed(1)}%\n`
  text += `  平均均匀度：${result.summary.avgUniformity.toFixed(1)}%\n`
  text += `  平均风险评分：${result.summary.avgRiskScore.toFixed(1)}/100\n`
  text += `  异常总数：${result.summary.anomalyCount}\n`
  text += `  质量分布：A级${result.summary.qualityDistribution.A}批 | B级${result.summary.qualityDistribution.B}批 | C级${result.summary.qualityDistribution.C}批 | D级${result.summary.qualityDistribution.D}批\n\n`
  text += '-'.repeat(70) + '\n\n'
  text += '【跨机台对比】\n'
  const cmp = result.crossMachineComparison
  text += `  最优机台：${cmp.bestMachine.name}（${cmp.bestMachine.reason}）\n`
  text += `  最差机台：${cmp.worstMachine.name}（${cmp.worstMachine.reason}）\n`
  text += `  覆盖率方差：${cmp.coverageVariance.toFixed(1)}\n`
  text += `  均匀度方差：${cmp.uniformityVariance.toFixed(1)}\n`
  for (const insight of cmp.insights) {
    text += `  · ${insight}\n`
  }
  text += '\n' + '-'.repeat(70) + '\n\n'
  text += '【异常来源定位】\n'
  for (const anom of result.anomalies.slice(0, 10)) {
    text += `  [${anom.severity === 'severe' ? '严重' : anom.severity === 'moderate' ? '中等' : '轻微'}] ${anom.description}\n`
    text += `    根因：${anom.rootCause}\n`
    text += `    建议：${anom.suggestedFix}\n`
  }
  text += '\n' + '-'.repeat(70) + '\n\n'
  text += '【订单交付风险】\n'
  for (const risk of result.deliveryRisks) {
    const riskLabel = risk.overallRisk === 'critical' ? '极高风险' : risk.overallRisk === 'high' ? '高风险' : risk.overallRisk === 'medium' ? '中等风险' : '低风险'
    text += `  订单「${risk.orderName}」：${riskLabel}（评分${risk.riskScore}）\n`
    text += `    进度：${risk.progressPercent}% | 按时概率：${risk.onTimeProbability}%\n`
    for (const rec of risk.recommendations) {
      text += `    → ${rec}\n`
    }
  }
  text += '\n' + '-'.repeat(70) + '\n\n'
  text += '【生产优化建议】\n'
  for (const opt of result.optimizations) {
    const priLabel = opt.priority === 'high' ? '紧急' : opt.priority === 'medium' ? '重要' : '一般'
    text += `  [${priLabel}] ${opt.title}\n`
    text += `    ${opt.description}\n`
    text += `    当前：${opt.currentStatus}\n`
    text += `    建议：${opt.suggestedChange}\n`
    text += `    预期效果：${opt.expectedImprovement}\n`
  }
  text += '\n' + '-'.repeat(70) + '\n\n'
  text += '【维护排程方案】\n'
  for (const sch of result.maintenanceSchedule) {
    const typeLabel = sch.type === 'emergency' ? '紧急' : sch.type === 'corrective' ? '纠正' : '预防'
    text += `  [${typeLabel}] ${sch.machineName} - ${sch.title}\n`
    text += `    时间：${new Date(sch.suggestedTime).toLocaleString('zh-CN')}\n`
    text += `    预计工时：${sch.estimatedDuration}小时\n`
    text += `    原因：${sch.reason}\n`
    if (sch.impactIfDelayed) text += `    延迟影响：${sch.impactIfDelayed}\n`
  }
  text += '\n' + '='.repeat(70) + '\n'
  text += '                         报告结束\n'
  text += '='.repeat(70) + '\n'
  return text
}
