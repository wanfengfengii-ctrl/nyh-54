import type {
  PrintParams,
  EnvironmentParams,
  TimeSeriesPoint,
  AgingAnalysisResult,
  AbnormalPhase,
  QualityAnalysis,
  MaintenanceSuggestion,
  PlateTemplate
} from '../../types'
import { PARAMS_RANGES, AGING_SIMULATION_CONFIG } from '../../types'
import { runSimulation } from './core'
import { generateAgingAnalysisId } from '../idGenerator'

export function adjustParamsByEnvironment(
  baseParams: PrintParams,
  envParams: EnvironmentParams
): PrintParams {
  const tempFactor = (envParams.temperature - 25) / 15
  const viscosityAdjust = tempFactor * 25
  const adjustedViscosity = Math.max(
    PARAMS_RANGES.viscosity.min,
    Math.min(PARAMS_RANGES.viscosity.max, baseParams.viscosity - viscosityAdjust)
  )

  const humidityFactor = (envParams.humidity - 50) / 40
  const pressureAdjust = humidityFactor * 15
  const adjustedPressure = Math.max(
    PARAMS_RANGES.pressure.min,
    Math.min(PARAMS_RANGES.pressure.max, baseParams.pressure + pressureAdjust)
  )

  const wearFactor = envParams.rollerWear / 100
  const wearPressurePenalty = wearFactor * 20
  const effectivePressure = Math.max(
    PARAMS_RANGES.pressure.min,
    adjustedPressure - wearPressurePenalty
  )

  const runCountFactor = Math.min(1, envParams.printRunCount / 5000)
  const fatigueFactor = runCountFactor * 0.1

  return {
    viscosity: Math.round(adjustedViscosity * 10) / 10,
    pressure: Math.round(effectivePressure * 10) / 10,
    rollingCount: Math.max(1, Math.round(baseParams.rollingCount * (1 - fatigueFactor))),
    heightDiff: Math.max(0, baseParams.heightDiff * (1 - wearFactor * 0.3))
  }
}

function seededRandom2(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

function generateEnvTimeSeries(
  baseEnv: EnvironmentParams,
  steps: number,
  seed: number
): EnvironmentParams[] {
  const random = seededRandom2(seed)
  const series: EnvironmentParams[] = []

  for (let i = 0; i < steps; i++) {
    const progress = i / (steps - 1)

    const tempWave = Math.sin(progress * Math.PI * 3) * 3
    const tempDrift = progress * 2
    const tempNoise = (random() - 0.5) * 1
    const temperature = Math.max(10, Math.min(40, baseEnv.temperature + tempWave + tempDrift + tempNoise))

    const humWave = Math.cos(progress * Math.PI * 2.5) * 8
    const humDrift = -progress * 10
    const humNoise = (random() - 0.5) * 3
    const humidity = Math.max(20, Math.min(90, baseEnv.humidity + humWave + humDrift + humNoise))

    const wearBase = baseEnv.rollerWear + progress * (100 - baseEnv.rollerWear) * 0.6
    const wearNoise = (random() - 0.5) * 2
    const rollerWear = Math.max(0, Math.min(100, wearBase + wearNoise))

    const absWave = Math.sin(progress * Math.PI * 4) * 5
    const absNoise = (random() - 0.5) * 3
    const paperAbsorption = Math.max(20, Math.min(80, baseEnv.paperAbsorption + absWave + absNoise))

    const printRunCount = baseEnv.printRunCount + i * 100

    series.push({
      temperature: Math.round(temperature * 10) / 10,
      humidity: Math.round(humidity * 10) / 10,
      rollerWear: Math.round(rollerWear * 10) / 10,
      paperAbsorption: Math.round(paperAbsorption * 10) / 10,
      printRunCount: Math.round(printRunCount)
    })
  }

  return series
}

export function calculateTrend(values: number[]): { slope: number; stability: number } {
  if (values.length < 2) return { slope: 0, stability: 100 }

  const n = values.length
  const indices = values.map((_, i) => i)
  const meanX = indices.reduce((a, b) => a + b, 0) / n
  const meanY = values.reduce((a, b) => a + b, 0) / n

  let numerator = 0
  let denominator = 0
  for (let i = 0; i < n; i++) {
    const dx = indices[i] - meanX
    const dy = values[i] - meanY
    numerator += dx * dy
    denominator += dx * dx
  }

  const slope = denominator === 0 ? 0 : numerator / denominator

  const residuals = values.map((v, i) => {
    const predicted = meanY + slope * (i - meanX)
    return v - predicted
  })

  const variance = residuals.reduce((a, b) => a + b * b, 0) / n
  const stdDev = Math.sqrt(variance)
  const range = Math.max(...values) - Math.min(...values)
  const stability = range === 0 ? 100 : Math.max(0, 100 - (stdDev / range) * 100)

  return { slope, stability: Math.round(stability) }
}

function detectAbnormalPhases(series: TimeSeriesPoint[]): AbnormalPhase[] {
  const phases: AbnormalPhase[] = []
  const windowSize = 5

  const coverages = series.map(s => s.result.coverage)
  const uniformities = series.map(s => s.result.uniformity)
  const risks = series.map(s => s.riskScore)

  let phaseId = 0

  for (let i = windowSize; i < series.length - windowSize; i++) {
    const prevAvg = coverages.slice(i - windowSize, i).reduce((a, b) => a + b, 0) / windowSize
    const nextAvg = coverages.slice(i, i + windowSize).reduce((a, b) => a + b, 0) / windowSize
    const coverageChange = ((nextAvg - prevAvg) / Math.max(1, Math.abs(prevAvg))) * 100

    if (coverageChange < -8) {
      const severity = coverageChange < -20 ? 'severe' : coverageChange < -12 ? 'moderate' : 'mild'
      phases.push({
        id: `abn_${phaseId++}`,
        startIndex: Math.max(0, i - windowSize),
        endIndex: Math.min(series.length - 1, i + windowSize),
        type: 'coverage_drop',
        severity,
        description: `覆盖率下降 ${Math.abs(coverageChange).toFixed(1)}%`,
        magnitude: Math.abs(coverageChange),
        suspectedCause: severity === 'severe'
          ? '滚筒磨损加剧或温度骤变导致油墨转移效率大幅下降'
          : '环境湿度变化或纸张吸墨性波动'
      })
      i += windowSize
    }
  }

  for (let i = windowSize; i < series.length - windowSize; i++) {
    const prevAvg = uniformities.slice(i - windowSize, i).reduce((a, b) => a + b, 0) / windowSize
    const nextAvg = uniformities.slice(i, i + windowSize).reduce((a, b) => a + b, 0) / windowSize
    const uniformityChange = ((nextAvg - prevAvg) / Math.max(1, Math.abs(prevAvg))) * 100

    if (uniformityChange < -10) {
      const severity = uniformityChange < -25 ? 'severe' : uniformityChange < -15 ? 'moderate' : 'mild'
      phases.push({
        id: `abn_${phaseId++}`,
        startIndex: Math.max(0, i - windowSize),
        endIndex: Math.min(series.length - 1, i + windowSize),
        type: 'uniformity_drop',
        severity,
        description: `均匀度下降 ${Math.abs(uniformityChange).toFixed(1)}%`,
        magnitude: Math.abs(uniformityChange),
        suspectedCause: '滚筒磨损不均或印版局部高度变化导致印刷均匀性下降'
      })
      i += windowSize
    }
  }

  for (let i = 1; i < series.length; i++) {
    const riskChange = risks[i] - risks[i - 1]
    if (riskChange > 15) {
      const severity = riskChange > 35 ? 'severe' : riskChange > 25 ? 'moderate' : 'mild'
      phases.push({
        id: `abn_${phaseId++}`,
        startIndex: Math.max(0, i - 2),
        endIndex: Math.min(series.length - 1, i + 2),
        type: 'risk_spike',
        severity,
        description: `风险评分突增 ${riskChange.toFixed(0)} 点`,
        magnitude: riskChange,
        suspectedCause: '环境参数剧烈波动或设备状态突变'
      })
    }
  }

  return phases.sort((a, b) => b.magnitude - a.magnitude)
}

function analyzeQuality(series: TimeSeriesPoint[]): QualityAnalysis {
  const coverages = series.map(s => s.result.coverage)
  const uniformities = series.map(s => s.result.uniformity)
  const risks = series.map(s => s.riskScore)

  const covTrend = calculateTrend(coverages)
  const uniTrend = calculateTrend(uniformities)
  const riskTrend = calculateTrend(risks)

  const overallStability = Math.round(
    covTrend.stability * 0.35 +
    uniTrend.stability * 0.35 +
    (100 - Math.abs(riskTrend.slope) * 2) * 0.3
  )

  const degradationRate = Math.round(
    (Math.abs(covTrend.slope) * 0.4 + Math.abs(uniTrend.slope) * 0.4 + riskTrend.slope * 0.2) * 100
  ) / 100

  const firstRisk = risks[0] || 50
  const lastRisk = risks[risks.length - 1] || 50
  const riskIncrease = lastRisk - firstRisk
  const estimatedRemainingLife = riskIncrease <= 0
    ? series.length * 2
    : Math.max(0, Math.round(((80 - lastRisk) / riskIncrease) * series.length))

  const keyFactors = [
    { factor: '滚筒磨损', impact: 0, description: '' },
    { factor: '温度波动', impact: 0, description: '' },
    { factor: '湿度变化', impact: 0, description: '' },
    { factor: '纸张吸墨', impact: 0, description: '' },
    { factor: '连续印刷', impact: 0, description: '' }
  ]

  const envSeries = series.map(s => s.envParams)
  const tempValues = envSeries.map(e => e.temperature)
  const humValues = envSeries.map(e => e.humidity)
  const wearValues = envSeries.map(e => e.rollerWear)
  const absValues = envSeries.map(e => e.paperAbsorption)
  const runValues = envSeries.map(e => e.printRunCount)

  const tempRange = Math.max(...tempValues) - Math.min(...tempValues)
  const humRange = Math.max(...humValues) - Math.min(...humValues)
  const wearRange = Math.max(...wearValues) - Math.min(...wearValues)
  const absRange = Math.max(...absValues) - Math.min(...absValues)
  const runRange = Math.max(...runValues) - Math.min(...runValues)

  keyFactors[0].impact = Math.min(100, wearRange * 1.2)
  keyFactors[0].description = wearRange > 30 ? '磨损严重，是主要质量影响因素' : wearRange > 15 ? '有一定磨损影响' : '磨损影响较小'

  keyFactors[1].impact = Math.min(100, tempRange * 3)
  keyFactors[1].description = tempRange > 10 ? '温度波动大，严重影响油墨黏度' : tempRange > 5 ? '温度有一定波动' : '温度相对稳定'

  keyFactors[2].impact = Math.min(100, humRange * 1.2)
  keyFactors[2].description = humRange > 25 ? '湿度变化剧烈，影响油墨转移' : humRange > 15 ? '湿度有一定波动' : '湿度相对稳定'

  keyFactors[3].impact = Math.min(100, absRange * 1.5)
  keyFactors[3].description = absRange > 20 ? '纸张吸墨差异大，导致墨厚不均' : absRange > 10 ? '纸张有一定吸墨差异' : '纸张吸墨性较稳定'

  keyFactors[4].impact = Math.min(100, (runRange / 10000) * 100)
  keyFactors[4].description = runRange > 5000 ? '长时连续印刷，设备疲劳明显' : runRange > 2000 ? '连续印刷有一定影响' : '印刷量较小，疲劳影响轻'

  keyFactors.sort((a, b) => b.impact - a.impact)

  const qualityPhases: { name: string; startIndex: number; endIndex: number; quality: 'excellent' | 'good' | 'fair' | 'poor' }[] = []
  let currentQuality: 'excellent' | 'good' | 'fair' | 'poor' | null = null
  let phaseStart = 0

  for (let i = 0; i < series.length; i++) {
    const cov = series[i].result.coverage
    const uni = series[i].result.uniformity
    const risk = series[i].riskScore

    let quality: 'excellent' | 'good' | 'fair' | 'poor'
    if (cov >= 60 && cov <= 85 && uni >= 80 && risk < 30) {
      quality = 'excellent'
    } else if (cov >= 50 && cov <= 90 && uni >= 65 && risk < 50) {
      quality = 'good'
    } else if (cov >= 35 && cov <= 95 && uni >= 50 && risk < 70) {
      quality = 'fair'
    } else {
      quality = 'poor'
    }

    if (quality !== currentQuality) {
      if (currentQuality !== null) {
        qualityPhases.push({
          name: currentQuality === 'excellent' ? '优秀阶段' : currentQuality === 'good' ? '良好阶段' : currentQuality === 'fair' ? '一般阶段' : '较差阶段',
          startIndex: phaseStart,
          endIndex: i - 1,
          quality: currentQuality
        })
      }
      currentQuality = quality
      phaseStart = i
    }
  }

  if (currentQuality !== null) {
    qualityPhases.push({
      name: currentQuality === 'excellent' ? '优秀阶段' : currentQuality === 'good' ? '良好阶段' : currentQuality === 'fair' ? '一般阶段' : '较差阶段',
      startIndex: phaseStart,
      endIndex: series.length - 1,
      quality: currentQuality
    })
  }

  return {
    overallStability,
    degradationRate,
    estimatedRemainingLife,
    keyFactors,
    qualityPhases
  }
}

function generateMaintenanceSuggestions(
  series: TimeSeriesPoint[],
  qualityAnalysis: QualityAnalysis
): MaintenanceSuggestion[] {
  const suggestions: MaintenanceSuggestion[] = []
  let sugId = 0

  const lastWear = series[series.length - 1]?.envParams.rollerWear || 0

  if (lastWear > 60) {
    suggestions.push({
      id: `sug_${sugId++}`,
      priority: 'high',
      category: 'roller',
      title: '滚筒磨损严重，建议立即维护',
      description: `当前滚筒磨损度已达 ${lastWear.toFixed(0)}%，严重影响印刷质量和均匀度。`,
      suggestedAction: '安排滚筒研磨或更换新滚筒，检查压印机构，重新校准压力',
      estimatedImpact: '预计可恢复 25-40% 的印刷质量，均匀度提升 15-25%'
    })
  } else if (lastWear > 35) {
    suggestions.push({
      id: `sug_${sugId++}`,
      priority: 'medium',
      category: 'roller',
      title: '滚筒有一定磨损，建议检查',
      description: `滚筒磨损度为 ${lastWear.toFixed(0)}%，已开始影响印刷效果。`,
      suggestedAction: '安排预防性维护，检查滚筒表面状态，必要时进行轻度研磨',
      estimatedImpact: '可延缓质量衰退，延长设备使用寿命'
    })
  }

  const env = series.map(s => s.envParams)
  const temps = env.map(e => e.temperature)
  const hums = env.map(e => e.humidity)
  const tempVariance = Math.max(...temps) - Math.min(...temps)
  const humVariance = Math.max(...hums) - Math.min(...hums)

  if (tempVariance > 8) {
    suggestions.push({
      id: `sug_${sugId++}`,
      priority: 'high',
      category: 'environment',
      title: '温度波动过大，需环境控制',
      description: `温度波动范围达 ${tempVariance.toFixed(1)}°C，严重影响油墨黏度稳定性。`,
      suggestedAction: '安装恒温控制系统，保持车间温度在 22-26°C 范围内',
      estimatedImpact: '可减少黏度波动 30-50%，提升印刷稳定性'
    })
  }

  if (humVariance > 20) {
    suggestions.push({
      id: `sug_${sugId++}`,
      priority: 'medium',
      category: 'environment',
      title: '湿度变化明显，建议控制',
      description: `湿度波动范围达 ${humVariance.toFixed(1)}%，影响油墨转移效率。`,
      suggestedAction: '配备加湿/除湿设备，保持相对湿度在 45-55% 区间',
      estimatedImpact: '可降低纸张吸墨波动，提升印刷一致性'
    })
  }

  const avgAbsorption = env.reduce((sum, e) => sum + e.paperAbsorption, 0) / env.length
  if (avgAbsorption > 65) {
    suggestions.push({
      id: `sug_${sugId++}`,
      priority: 'medium',
      category: 'paper',
      title: '纸张吸墨性偏高',
      description: `平均纸张吸墨系数 ${avgAbsorption.toFixed(0)}%，油墨渗透过快。`,
      suggestedAction: '考虑更换低吸墨性纸张，或适当增加油墨黏度',
      estimatedImpact: '可提升墨层厚度 10-20%，改善图文清晰度'
    })
  }

  const totalRuns = (series[series.length - 1]?.envParams.printRunCount || 0) - (series[0]?.envParams.printRunCount || 0)
  if (totalRuns > 3000) {
    suggestions.push({
      id: `sug_${sugId++}`,
      priority: 'medium',
      category: 'general',
      title: '连续印刷量较大，建议合理安排生产',
      description: `模拟周期内印刷 ${totalRuns} 次，设备持续运行产生疲劳累积。`,
      suggestedAction: '合理安排生产计划，避免长时间连续运行，定期停机检查',
      estimatedImpact: '可延长设备寿命 20-30%，减少突发故障'
    })
  }

  if (qualityAnalysis.degradationRate > 0.5) {
    suggestions.push({
      id: `sug_${sugId++}`,
      priority: 'high',
      category: 'general',
      title: '质量衰减速率偏高，需全面排查',
      description: `质量衰减速率为 ${qualityAnalysis.degradationRate.toFixed(2)}/步，衰减较快。`,
      suggestedAction: '进行全面设备检查，包括滚筒、墨路、压力系统等关键部件',
      estimatedImpact: '及时发现并解决问题，避免质量进一步恶化'
    })
  }

  const abnormalCount = qualityAnalysis.keyFactors.filter(f => f.impact > 50).length
  if (abnormalCount >= 3) {
    suggestions.push({
      id: `sug_${sugId++}`,
      priority: 'high',
      category: 'general',
      title: '多因素影响质量，建议综合治理',
      description: `检测到 ${abnormalCount} 个主要影响因素，印刷系统稳定性较差。`,
      suggestedAction: '制定系统性改进方案，从设备、环境、材料三方面同步优化',
      estimatedImpact: '综合改善可大幅提升印刷质量和生产稳定性'
    })
  }

  if (suggestions.length === 0) {
    suggestions.push({
      id: `sug_${sugId++}`,
      priority: 'low',
      category: 'general',
      title: '系统状态良好',
      description: '当前环境和设备状态良好，印刷质量稳定。',
      suggestedAction: '继续保持现有维护制度和环境控制措施',
      estimatedImpact: '维持当前优良的印刷质量水平'
    })
  }

  return suggestions.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 }
    return priorityOrder[a.priority] - priorityOrder[b.priority]
  })
}

export function runAgingAnalysis(
  baseParams: PrintParams,
  baseEnvParams: EnvironmentParams,
  steps: number = AGING_SIMULATION_CONFIG.defaultSteps,
  template?: PlateTemplate | null
): AgingAnalysisResult {
  const seed = Math.floor(
    baseParams.viscosity * 1000 + baseParams.pressure * 100 +
    baseEnvParams.temperature * 10 + baseEnvParams.humidity * 5
  )

  const envSeries = generateEnvTimeSeries(baseEnvParams, steps, seed)
  const timeSeries: TimeSeriesPoint[] = []

  for (let i = 0; i < steps; i++) {
    const env = envSeries[i]
    const adjustedParams = adjustParamsByEnvironment(baseParams, env)
    const result = runSimulation(adjustedParams, template)

    const riskScore = result.detailedRisk?.overallRiskScore ??
      (result.riskAlerts.reduce((acc, a) => Math.max(acc, a.level * 25), 0))

    timeSeries.push({
      index: i,
      timestamp: Date.now() + i * 60000,
      envParams: env,
      adjustedPrintParams: adjustedParams,
      result,
      riskScore
    })
  }

  const coverages = timeSeries.map(s => s.result.coverage)
  const uniformities = timeSeries.map(s => s.result.uniformity)
  const risks = timeSeries.map(s => s.riskScore)

  const coverageTrend = calculateTrend(coverages)
  const uniformityTrend = calculateTrend(uniformities)
  const riskTrend = calculateTrend(risks)

  const abnormalPhases = detectAbnormalPhases(timeSeries)
  const qualityAnalysis = analyzeQuality(timeSeries)
  const maintenanceSuggestions = generateMaintenanceSuggestions(timeSeries, qualityAnalysis)

  return {
    id: generateAgingAnalysisId(),
    name: `老化分析_${new Date().toLocaleDateString()}`,
    baseParams: { ...baseParams },
    baseEnvParams: { ...baseEnvParams },
    timeSeries,
    totalSteps: steps,
    startTime: timeSeries[0]?.timestamp ?? Date.now(),
    endTime: timeSeries[timeSeries.length - 1]?.timestamp ?? Date.now(),
    coverageTrend,
    uniformityTrend,
    riskTrend,
    abnormalPhases,
    qualityAnalysis,
    maintenanceSuggestions
  }
}
