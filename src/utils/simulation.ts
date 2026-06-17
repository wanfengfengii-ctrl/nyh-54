import type {
  PrintParams,
  SimulationResult,
  RiskAlert,
  ValidationResult,
  PlateTemplate,
  PlateShape,
  DetailedRiskAnalysis,
  RegionalRisk,
  BatchExperimentConfig,
  BatchExperimentResult,
  BatchRunResult,
  ComparisonReport,
  SavedScheme,
  EnvironmentParams,
  TimeSeriesPoint,
  AgingAnalysisResult,
  AbnormalPhase,
  QualityAnalysis,
  MaintenanceSuggestion
} from '../types'
import {
  GRID_WIDTH,
  GRID_HEIGHT,
  PARAMS_RANGES,
  COVERAGE_THRESHOLDS,
  MAX_BATCH_SIZE
} from '../types'

export function validateParams(params: PrintParams): ValidationResult {
  const errors: string[] = []

  if (params.viscosity <= 0) {
    errors.push('油墨黏度必须大于 0')
  }
  if (params.viscosity > PARAMS_RANGES.viscosity.max) {
    errors.push(`油墨黏度不能超过 ${PARAMS_RANGES.viscosity.max} cP`)
  }

  if (params.pressure <= 0) {
    errors.push('滚筒压力必须大于 0')
  }
  if (params.pressure > PARAMS_RANGES.pressure.max) {
    errors.push(`滚筒压力不能超过 ${PARAMS_RANGES.pressure.max} MPa`)
  }

  if (params.rollingCount <= 0) {
    errors.push('滚动次数必须大于 0')
  }
  if (params.rollingCount > PARAMS_RANGES.rollingCount.max) {
    errors.push(`滚动次数不能超过 ${PARAMS_RANGES.rollingCount.max} 次`)
  }

  if (params.heightDiff < 0) {
    errors.push('字面高度差不能为负数')
  }
  if (params.heightDiff > PARAMS_RANGES.heightDiff.max) {
    errors.push(`字面高度差不能超过 ${PARAMS_RANGES.heightDiff.max} μm`)
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

function pointInShape(shape: PlateShape, px: number, py: number): boolean {
  const cx = shape.x + shape.width / 2
  const cy = shape.y + shape.height / 2

  if (shape.rotation !== 0) {
    const rad = (-shape.rotation * Math.PI) / 180
    const dx = px - cx
    const dy = py - cy
    px = cx + dx * Math.cos(rad) - dy * Math.sin(rad)
    py = cy + dx * Math.sin(rad) + dy * Math.cos(rad)
  }

  switch (shape.type) {
    case 'rectangle':
      return px >= shape.x && px <= shape.x + shape.width &&
             py >= shape.y && py <= shape.y + shape.height
    case 'circle': {
      const radius = Math.min(shape.width, shape.height) / 2
      return Math.pow(px - cx, 2) + Math.pow(py - cy, 2) <= Math.pow(radius, 2)
    }
    case 'ellipse': {
      const rx = shape.width / 2
      const ry = shape.height / 2
      return Math.pow((px - cx) / rx, 2) + Math.pow((py - cy) / ry, 2) <= 1
    }
    case 'polygon':
    case 'freehand': {
      if (!shape.points || shape.points.length < 3) return false
      let inside = false
      const points = shape.points
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const xi = shape.x + points[i].x * shape.width
        const yi = shape.y + points[i].y * shape.height
        const xj = shape.x + points[j].x * shape.width
        const yj = shape.y + points[j].y * shape.height
        if (((yi > py) !== (yj > py)) &&
            (px < (xj - xi) * (py - yi) / (yj - yi + 0.0001) + xi)) {
          inside = !inside
        }
      }
      return inside
    }
    case 'text':
      return px >= shape.x && px <= shape.x + shape.width &&
             py >= shape.y && py <= shape.y + shape.height
    default:
      return false
  }
}

export function generateTemplateHeightMap(template: PlateTemplate, seed: number): number[][] {
  const random = seededRandom(seed)
  const heightMap: number[][] = []
  const maxHeight = PARAMS_RANGES.heightDiff.max
  const sortedShapes = [...template.shapes].sort((a, b) => a.localHeight - b.localHeight)

  for (let y = 0; y < GRID_HEIGHT; y++) {
    const row: number[] = []
    for (let x = 0; x < GRID_WIDTH; x++) {
      let h = template.baseHeight / maxHeight
      for (const shape of sortedShapes) {
        if (pointInShape(shape, x, y)) {
          const shapeNormalized = shape.localHeight / maxHeight
          const noise = (random() - 0.5) * 0.05
          h = Math.max(h, shapeNormalized + noise)
        }
      }
      h = Math.max(0, Math.min(1, h))
      row.push(h)
    }
    heightMap.push(row)
  }
  return heightMap
}

function generateHeightMap(heightDiff: number, seed: number, template?: PlateTemplate | null): number[][] {
  if (template && template.shapes.length > 0) {
    return generateTemplateHeightMap(template, seed)
  }

  const random = seededRandom(seed)
  const heightMap: number[][] = []
  const maxHeight = PARAMS_RANGES.heightDiff.max

  for (let y = 0; y < GRID_HEIGHT; y++) {
    const row: number[] = []
    for (let x = 0; x < GRID_WIDTH; x++) {
      let h = 0
      if (heightDiff > 0) {
        const pattern = Math.sin(x * 0.08 + y * 0.05) * 0.5 + 0.5
        const noise = (random() - 0.5) * 0.4
        h = heightDiff * pattern * (0.6 + noise + 0.4)
        h = Math.max(0, Math.min(heightDiff, h))
      }
      row.push(h / maxHeight)
    }
    heightMap.push(row)
  }
  return heightMap
}

function transferInk(
  paperInk: number[][],
  heightMap: number[][],
  pressure: number,
  viscosity: number,
  rollingCount: number,
  seed: number
): number[][] {
  const random = seededRandom(seed + 1000)
  const result: number[][] = paperInk.map(row => [...row])

  const pressureFactor = pressure / 100
  const viscosityFactor = viscosity / 100

  const baseCoverage = 0.2 + pressureFactor * 0.7 - viscosityFactor * 0.15
  const efficiency = 0.55 + pressureFactor * 0.35 - viscosityFactor * 0.25

  for (let pass = 0; pass < rollingCount; pass++) {
    const passProgress = (pass + 1) / rollingCount
    const passFactor = Math.min(1, passProgress * 1.2)

    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        if (result[y][x] >= 0.95) continue

        const heightVal = heightMap[y][x]
        if (heightVal < 0.01) continue

        const heightPenalty = 0.2 + heightVal * 0.8

        const randomThreshold = 1 - baseCoverage * passFactor * efficiency * heightPenalty
        const rand = random()

        if (rand > randomThreshold) {
          const baseAmount = 0.2 + pressureFactor * 0.5
          const heightBonus = 0.3 + heightVal * 0.5
          const noise = (random() - 0.5) * 0.25

          let inkAmount = baseAmount * heightBonus * (0.85 + noise)
          inkAmount = Math.max(0, Math.min(1, inkAmount))

          result[y][x] = Math.min(1, result[y][x] + inkAmount * 0.6)
        }

        if (result[y][x] > 0.4 && random() > 0.6) {
          const spread = result[y][x] * 0.1 * (1 - viscosityFactor * 0.4)
          if (x > 0) result[y][x - 1] = Math.min(1, result[y][x - 1] + spread * 0.3)
          if (x < GRID_WIDTH - 1) result[y][x + 1] = Math.min(1, result[y][x + 1] + spread * 0.3)
          if (y > 0) result[y - 1][x] = Math.min(1, result[y - 1][x] + spread * 0.3)
          if (y < GRID_HEIGHT - 1) result[y + 1][x] = Math.min(1, result[y + 1][x] + spread * 0.3)
        }
      }
    }
  }

  return result
}

export function runSimulation(params: PrintParams, template?: PlateTemplate | null): SimulationResult {
  const seed = Math.floor(
    params.viscosity * 1000 + params.pressure * 100 +
    params.rollingCount * 10 + params.heightDiff * 7
  )

  const heightMap = generateHeightMap(params.heightDiff, seed, template)

  const paperInk: number[][] = []
  for (let y = 0; y < GRID_HEIGHT; y++) {
    paperInk.push(new Array(GRID_WIDTH).fill(0))
  }

  const inkMap = transferInk(paperInk, heightMap, params.pressure, params.viscosity, params.rollingCount, seed)

  const coverageMap: number[][] = []
  let totalInk = 0
  let coveredPixels = 0
  const thicknessValues: number[] = []

  for (let y = 0; y < GRID_HEIGHT; y++) {
    const row: number[] = []
    for (let x = 0; x < GRID_WIDTH; x++) {
      const thickness = inkMap[y][x]
      row.push(thresholdToCoverage(thickness))
      totalInk += thickness
      if (thickness > 0.05) {
        coveredPixels++
        thicknessValues.push(thickness)
      }
    }
    coverageMap.push(row)
  }

  const totalPixels = GRID_WIDTH * GRID_HEIGHT
  const coverage = (coveredPixels / totalPixels) * 100
  const averageThickness = totalInk / totalPixels

  const variance = thicknessValues.length > 0
    ? thicknessValues.reduce((acc, v) => acc + Math.pow(v - averageThickness, 2), 0) / thicknessValues.length
    : 0
  const stdDev = Math.sqrt(variance)
  const uniformity = Math.max(0, Math.min(100, (1 - stdDev * 2) * 100))

  const riskAlerts = assessRisks(params, coverage, uniformity, averageThickness, inkMap)
  const detailedRisk = generateDetailedRiskAnalysis(params, coverage, uniformity, averageThickness, inkMap, heightMap)

  return {
    coverage,
    uniformity,
    averageThickness,
    thicknessMap: inkMap,
    coverageMap,
    riskAlerts,
    timestamp: Date.now(),
    detailedRisk,
    templateId: template?.id
  }
}

function thresholdToCoverage(thickness: number): number {
  if (thickness <= 0.05) return 0
  if (thickness >= 0.95) return 100
  return ((thickness - 0.05) / 0.9) * 100
}

export function generateDetailedRiskAnalysis(
  params: PrintParams,
  coverage: number,
  uniformity: number,
  _averageThickness: number,
  inkMap: number[][],
  heightMap: number[][]
): DetailedRiskAnalysis {
  const coverageRisk = coverage < COVERAGE_THRESHOLDS.tooLow || coverage > COVERAGE_THRESHOLDS.tooHigh
    ? Math.min(100, Math.max(0,
        coverage < COVERAGE_THRESHOLDS.tooLow
          ? (COVERAGE_THRESHOLDS.tooLow - coverage) * 3
          : (coverage - COVERAGE_THRESHOLDS.tooHigh) * 3
      ))
    : 0

  const uniformityRisk = Math.max(0, 100 - uniformity * 1.2)

  let highInkRatio = 0
  let lowInkRatio = 0
  const totalPixels = GRID_WIDTH * GRID_HEIGHT
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      if (inkMap[y][x] > 0.85) highInkRatio++
      if (inkMap[y][x] > 0.02 && inkMap[y][x] < 0.15) lowInkRatio++
    }
  }
  highInkRatio = (highInkRatio / totalPixels) * 100
  lowInkRatio = (lowInkRatio / totalPixels) * 100

  const smearingRisk = Math.min(100, highInkRatio * 4)
  const missingInkRisk = Math.min(100, lowInkRatio * 5)

  let maxHeightDiff = 0
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      if (x > 0) maxHeightDiff = Math.max(maxHeightDiff, Math.abs(heightMap[y][x] - heightMap[y][x - 1]))
      if (y > 0) maxHeightDiff = Math.max(maxHeightDiff, Math.abs(heightMap[y][x] - heightMap[y - 1][x]))
    }
  }
  const heightDifferenceRisk = Math.min(100, params.heightDiff * 1.5 + maxHeightDiff * 50)

  let parameterCompatibilityRisk = 0
  if (params.viscosity > 80 && params.pressure < 30) parameterCompatibilityRisk += 40
  if (params.viscosity < 20 && params.pressure > 80) parameterCompatibilityRisk += 30
  if (params.rollingCount <= 1 && coverage < 60) parameterCompatibilityRisk += 20
  parameterCompatibilityRisk = Math.min(100, parameterCompatibilityRisk)

  const overallRiskScore = Math.round(
    coverageRisk * 0.25 +
    uniformityRisk * 0.25 +
    smearingRisk * 0.15 +
    missingInkRisk * 0.15 +
    heightDifferenceRisk * 0.1 +
    parameterCompatibilityRisk * 0.1
  )

  const regionalRisks = detectRegionalRisks(inkMap, heightMap)

  const suggestions: string[] = []
  if (coverageRisk > 50) {
    if (coverage < COVERAGE_THRESHOLDS.optimalMin) {
      suggestions.push('覆盖率过低：建议增加滚筒压力10-15MPa或提高滚动次数2-3次')
    } else {
      suggestions.push('覆盖率过高：建议降低黏度10-15cP或减小滚筒压力')
    }
  }
  if (uniformityRisk > 50) {
    suggestions.push('均匀度不足：建议增加滚动次数并微调黏度至中间区间(40-60cP)')
  }
  if (smearingRisk > 50) {
    suggestions.push('糊版风险高：建议降低压力或增加油墨黏度，减少厚墨区域')
  }
  if (missingInkRisk > 50) {
    suggestions.push('缺墨风险高：建议检查高区域的局部高度设置，增加该区域的压力')
  }
  if (parameterCompatibilityRisk > 40) {
    suggestions.push('参数组合不匹配：建议重新平衡黏度与压力的配比')
  }
  if (suggestions.length === 0) {
    suggestions.push('当前参数配置良好，可在此基础上做微小调整以进一步优化')
  }

  const coverageRecommendation = coverageRisk > 50
    ? (coverage < COVERAGE_THRESHOLDS.optimalMin
        ? '增加滚筒压力或滚动次数'
        : '降低黏度或减小滚筒压力')
    : '当前覆盖率处于较优区间'

  const uniformityRecommendation = uniformityRisk > 50
    ? '增加滚动次数并微调黏度至中间区间'
    : '均匀度表现良好'

  const smearingRecommendation = smearingRisk > 50
    ? '降低压力或增加油墨黏度'
    : '糊版风险较低'

  const missingInkRecommendation = missingInkRisk > 50
    ? '检查高区域局部高度设置，增加压力'
    : '缺墨风险较低'

  const heightDiffRecommendation = heightDifferenceRisk > 50
    ? '减小字面高度差或优化模板布局'
    : '高度差处于可接受范围'

  const paramCompatRecommendation = parameterCompatibilityRisk > 40
    ? '重新平衡黏度与压力的配比'
    : '参数组合兼容性良好'

  return {
    overallRiskScore,
    riskBreakdown: {
      coverageRisk: { score: Math.round(coverageRisk), recommendation: coverageRecommendation },
      uniformityRisk: { score: Math.round(uniformityRisk), recommendation: uniformityRecommendation },
      smearingRisk: { score: Math.round(smearingRisk), recommendation: smearingRecommendation },
      missingInkRisk: { score: Math.round(missingInkRisk), recommendation: missingInkRecommendation },
      heightDifferenceRisk: { score: Math.round(heightDifferenceRisk), recommendation: heightDiffRecommendation },
      parameterCompatibilityRisk: { score: Math.round(parameterCompatibilityRisk), recommendation: paramCompatRecommendation }
    },
    regionalRisks,
    suggestions
  }
}

function detectRegionalRisks(inkMap: number[][], _heightMap: number[][]): RegionalRisk[] {
  const risks: RegionalRisk[] = []
  const regionSize = 20
  let riskId = 0

  for (let by = 0; by < GRID_HEIGHT; by += regionSize) {
    for (let bx = 0; bx < GRID_WIDTH; bx += regionSize) {
      const x2 = Math.min(bx + regionSize, GRID_WIDTH)
      const y2 = Math.min(by + regionSize, GRID_HEIGHT)
      let sumInk = 0
      let highInkPixels = 0
      let lowInkPixels = 0
      let varianceSum = 0
      const values: number[] = []
      const pixelCount = (x2 - bx) * (y2 - by)

      for (let y = by; y < y2; y++) {
        for (let x = bx; x < x2; x++) {
          const v = inkMap[y][x]
          sumInk += v
          values.push(v)
          if (v > 0.85) highInkPixels++
          if (v > 0.02 && v < 0.15) lowInkPixels++
        }
      }

      const avgInk = sumInk / pixelCount
      for (const v of values) {
        varianceSum += Math.pow(v - avgInk, 2)
      }
      const regionStd = Math.sqrt(varianceSum / pixelCount)
      const highRatio = (highInkPixels / pixelCount) * 100
      const lowRatio = (lowInkPixels / pixelCount) * 100
      const regionUniformity = Math.max(0, 100 - regionStd * 200)

      const regionName = `区域[${Math.floor(bx / regionSize) + 1},${Math.floor(by / regionSize) + 1}]`

      if (highRatio > 25) {
        risks.push({
          id: `risk_${riskId++}`,
          regionName,
          bounds: { x1: bx, y1: by, x2, y2 },
          riskType: 'smearing',
          severity: Math.min(100, highRatio * 3),
          description: `${regionName} 糊版风险 (${highRatio.toFixed(1)}% 像素过厚)`
        })
      } else if (lowRatio > 20) {
        risks.push({
          id: `risk_${riskId++}`,
          regionName,
          bounds: { x1: bx, y1: by, x2, y2 },
          riskType: 'missing_ink',
          severity: Math.min(100, lowRatio * 4),
          description: `${regionName} 缺墨风险 (${lowRatio.toFixed(1)}% 像素过薄)`
        })
      } else if (regionUniformity < 55) {
        risks.push({
          id: `risk_${riskId++}`,
          regionName,
          bounds: { x1: bx, y1: by, x2, y2 },
          riskType: 'uniformity',
          severity: Math.min(100, (100 - regionUniformity) * 2),
          description: `${regionName} 均匀度差 (${regionUniformity.toFixed(1)}%)`
        })
      }
    }
  }

  return risks.sort((a, b) => b.severity - a.severity).slice(0, 8)
}

function assessRisks(
  params: PrintParams,
  coverage: number,
  uniformity: number,
  _averageThickness: number,
  inkMap: number[][]
): RiskAlert[] {
  const alerts: RiskAlert[] = []

  if (coverage < COVERAGE_THRESHOLDS.tooLow) {
    alerts.push({
      type: 'danger',
      title: '覆盖率过低',
      message: `当前覆盖率仅 ${coverage.toFixed(1)}%，严重低于标准。建议增加滚筒压力或滚动次数。`,
      level: 3,
      suggestion: '增加滚筒压力 10-20 MPa，或增加滚动次数 2-4 次'
    })
  } else if (coverage < COVERAGE_THRESHOLDS.optimalMin) {
    alerts.push({
      type: 'warning',
      title: '覆盖率偏低',
      message: `当前覆盖率 ${coverage.toFixed(1)}%，略低于理想范围（${COVERAGE_THRESHOLDS.optimalMin}%-${COVERAGE_THRESHOLDS.optimalMax}%）。`,
      level: 2,
      suggestion: '适当增加压力或降低黏度'
    })
  } else if (coverage > COVERAGE_THRESHOLDS.tooHigh) {
    alerts.push({
      type: 'danger',
      title: '覆盖率过高',
      message: `当前覆盖率达 ${coverage.toFixed(1)}%，油墨过量易造成糊版。建议减小压力或降低黏度。`,
      level: 3,
      suggestion: '降低滚筒压力 10-15 MPa，或增加黏度 10-15 cP'
    })
  } else if (coverage > COVERAGE_THRESHOLDS.optimalMax) {
    alerts.push({
      type: 'warning',
      title: '覆盖率偏高',
      message: `当前覆盖率 ${coverage.toFixed(1)}%，略高于理想范围（${COVERAGE_THRESHOLDS.optimalMin}%-${COVERAGE_THRESHOLDS.optimalMax}%）。`,
      level: 2,
      suggestion: '轻微减小压力以优化质量'
    })
  }

  if (uniformity < 50) {
    alerts.push({
      type: 'danger',
      title: '印刷均匀度过差',
      message: `均匀度仅 ${uniformity.toFixed(1)}%，会产生浓淡不均。建议增加滚动次数或调整压力。`,
      level: 3,
      suggestion: '增加滚动次数至 4-6 次，检查印版高度均匀性'
    })
  } else if (uniformity < 70) {
    alerts.push({
      type: 'warning',
      title: '印刷均匀度一般',
      message: `均匀度 ${uniformity.toFixed(1)}%，局部可能存在浓淡差异。`,
      level: 2,
      suggestion: '增加滚动次数可提升均匀度'
    })
  }

  let lowInkCount = 0
  let highInkCount = 0
  const totalPixels = GRID_WIDTH * GRID_HEIGHT
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      if (inkMap[y][x] > 0.02 && inkMap[y][x] < 0.15) lowInkCount++
      if (inkMap[y][x] > 0.85) highInkCount++
    }
  }
  const lowInkRatio = (lowInkCount / totalPixels) * 100
  const highInkRatio = (highInkCount / totalPixels) * 100

  if (lowInkRatio > 15) {
    alerts.push({
      type: 'danger',
      title: '缺墨风险高',
      message: `检测到 ${lowInkRatio.toFixed(1)}% 区域油墨不足，存在缺墨风险。建议提高油墨供给量或增加压力。`,
      level: 3,
      suggestion: '提高局部高度或增加压力'
    })
  } else if (lowInkRatio > 8) {
    alerts.push({
      type: 'warning',
      title: '存在局部缺墨可能',
      message: `约 ${lowInkRatio.toFixed(1)}% 区域油墨偏薄，细线条处可能出现缺墨。`,
      level: 2
    })
  }

  if (highInkRatio > 20) {
    alerts.push({
      type: 'danger',
      title: '糊版风险高',
      message: `检测到 ${highInkRatio.toFixed(1)}% 区域油墨过厚，极易造成糊版和网点扩大。`,
      level: 3,
      suggestion: '降低压力或增加油墨黏度'
    })
  } else if (highInkRatio > 10) {
    alerts.push({
      type: 'warning',
      title: '存在糊版可能',
      message: `约 ${highInkRatio.toFixed(1)}% 区域油墨偏厚，细小文字可能粘连。`,
      level: 2
    })
  }

  if (params.heightDiff > 20) {
    alerts.push({
      type: 'warning',
      title: '字面高度差较大',
      message: `高度差 ${params.heightDiff}μm，高低区域油墨量差异明显，可能导致图文深浅不一。`,
      level: 2
    })
  }

  if (params.viscosity > 80 && params.pressure < 30) {
    alerts.push({
      type: 'warning',
      title: '高黏度低压力组合',
      message: '高黏度油墨配合较低压力，转印效率会大幅下降，建议适当提高压力或降低黏度。',
      level: 2,
      suggestion: '黏度 > 80cP 时压力应 >= 35MPa'
    })
  }

  if (params.rollingCount <= 1 && coverage < 70) {
    alerts.push({
      type: 'info',
      title: '建议增加滚压次数',
      message: '单次滚压无法使油墨均匀分布，建议至少滚动 2-3 次。',
      level: 1
    })
  }

  if (alerts.length === 0) {
    alerts.push({
      type: 'success',
      title: '参数配置优良',
      message: '当前参数组合处于理想区间，印刷质量预期良好。',
      level: 0
    })
  }

  alerts.sort((a, b) => b.level - a.level)
  return alerts
}

export function generateSchemeId(): string {
  return `scheme_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
}

export function generateTemplateId(): string {
  return `tpl_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
}

export function generateHistoryId(): string {
  return `hist_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
}

export function generateExperimentId(): string {
  return `exp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
}

export function generateShapeId(): string {
  return `shape_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
}

export function generatePresetTemplate(presetName: string, templateId: string): PlateTemplate {
  const now = Date.now()
  const base: PlateTemplate = {
    id: templateId,
    name: presetName,
    shapes: [],
    baseHeight: 0,
    createdAt: now,
    updatedAt: now
  }

  switch (presetName) {
    case '标准文字':
      base.shapes = [
        { id: generateShapeId(), type: 'rectangle', x: 10, y: 10, width: 100, height: 15, localHeight: 35, rotation: 0, color: '#1e293b', label: '标题区域' },
        { id: generateShapeId(), type: 'rectangle', x: 10, y: 32, width: 70, height: 8, localHeight: 30, rotation: 0, color: '#334155', label: '正文行1' },
        { id: generateShapeId(), type: 'rectangle', x: 10, y: 44, width: 70, height: 8, localHeight: 30, rotation: 0, color: '#334155', label: '正文行2' },
        { id: generateShapeId(), type: 'rectangle', x: 10, y: 56, width: 70, height: 8, localHeight: 30, rotation: 0, color: '#334155', label: '正文行3' },
        { id: generateShapeId(), type: 'rectangle', x: 88, y: 32, width: 22, height: 32, localHeight: 25, rotation: 0, color: '#475569', label: '装饰图案' }
      ]
      break
    case '图文混排':
      base.shapes = [
        { id: generateShapeId(), type: 'rectangle', x: 8, y: 8, width: 55, height: 12, localHeight: 35, rotation: 0, color: '#1e293b', label: '标题' },
        { id: generateShapeId(), type: 'circle', x: 70, y: 10, width: 30, height: 30, localHeight: 28, rotation: 0, color: '#3b82f6', label: '圆形图标' },
        { id: generateShapeId(), type: 'rectangle', x: 8, y: 28, width: 50, height: 40, localHeight: 22, rotation: 0, color: '#94a3b8', label: '图片占位' },
        { id: generateShapeId(), type: 'rectangle', x: 64, y: 48, width: 48, height: 6, localHeight: 30, rotation: 0, color: '#334155', label: '说明行1' },
        { id: generateShapeId(), type: 'rectangle', x: 64, y: 58, width: 48, height: 6, localHeight: 30, rotation: 0, color: '#334155', label: '说明行2' },
        { id: generateShapeId(), type: 'ellipse', x: 8, y: 68, width: 104, height: 8, localHeight: 20, rotation: 0, color: '#cbd5e1', label: '底部装饰' }
      ]
      break
    case '大幅面':
      base.shapes = [
        { id: generateShapeId(), type: 'rectangle', x: 5, y: 5, width: 110, height: 70, localHeight: 25, rotation: 0, color: '#475569', label: '主实地区域' },
        { id: generateShapeId(), type: 'rectangle', x: 20, y: 20, width: 80, height: 10, localHeight: 40, rotation: 0, color: '#1e293b', label: '中心标题' },
        { id: generateShapeId(), type: 'rectangle', x: 20, y: 40, width: 80, height: 20, localHeight: 35, rotation: 0, color: '#334155', label: '中心图案' }
      ]
      break
    case '精细线条':
      base.shapes = [
        { id: generateShapeId(), type: 'rectangle', x: 10, y: 10, width: 100, height: 2, localHeight: 45, rotation: 0, color: '#0f172a', label: '细线1' },
        { id: generateShapeId(), type: 'rectangle', x: 10, y: 18, width: 100, height: 2, localHeight: 45, rotation: 0, color: '#0f172a', label: '细线2' },
        { id: generateShapeId(), type: 'rectangle', x: 10, y: 26, width: 100, height: 2, localHeight: 45, rotation: 0, color: '#0f172a', label: '细线3' },
        { id: generateShapeId(), type: 'polygon', x: 20, y: 35, width: 30, height: 30, localHeight: 40, rotation: 0, color: '#1e293b', label: '三角形', points: [{ x: 0.5, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] },
        { id: generateShapeId(), type: 'polygon', x: 60, y: 35, width: 30, height: 30, localHeight: 40, rotation: 0, color: '#1e293b', label: '五边形', points: [{ x: 0.5, y: 0 }, { x: 1, y: 0.38 }, { x: 0.81, y: 1 }, { x: 0.19, y: 1 }, { x: 0, y: 0.38 }] }
      ]
      break
    default:
      base.shapes = []
  }

  return base
}

export function calculateBatchScore(result: SimulationResult, _target: string): { coverage: number; uniformity: number; balanced: number } {
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

  return {
    coverage: Math.round(coverageScore),
    uniformity: Math.round(uniformityScore),
    balanced: Math.round(balancedScore)
  }
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
    const score = calculateBatchScore(result, config.optimizationTarget)

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

  results.sort((a, b) => b.score[targetKey] - a.score[targetKey])
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

export function generateComparisonReport(
  schemes: SavedScheme[]
): ComparisonReport {
  const metricsKeys = ['coverage', 'uniformity', 'averageThickness', 'overallRiskScore']
  const metricsComparison: ComparisonReport['metricsComparison'] = {}

  for (const key of metricsKeys) {
    const values = schemes.map(s => ({
      schemeId: s.id,
      value: key === 'overallRiskScore'
        ? (s.result.detailedRisk?.overallRiskScore ?? 50)
        : key === 'averageThickness'
          ? s.result[key] * 100
          : s.result[key as keyof SimulationResult] as number
    }))

    let bestIdx = 0
    let worstIdx = 0
    for (let i = 1; i < values.length; i++) {
      const isBetter = key === 'overallRiskScore'
        ? values[i].value < values[bestIdx].value
        : values[i].value > values[bestIdx].value
      const isWorse = key === 'overallRiskScore'
        ? values[i].value > values[worstIdx].value
        : values[i].value < values[worstIdx].value
      if (isBetter) bestIdx = i
      if (isWorse) worstIdx = i
    }

    metricsComparison[key] = {
      values,
      best: schemes[bestIdx].name,
      worst: schemes[worstIdx].name,
      delta: Math.abs(values[bestIdx].value - values[worstIdx].value)
    }
  }

  const recommendations: string[] = []
  const bestCoverage = metricsComparison.coverage.best
  const bestUniformity = metricsComparison.uniformity.best
  const lowestRisk = metricsComparison.overallRiskScore.best

  if (bestCoverage === bestUniformity && bestUniformity === lowestRisk) {
    recommendations.push(`方案「${bestCoverage}」在所有核心指标上均表现最优，推荐优先采用`)
  } else {
    recommendations.push(`覆盖率最优：「${bestCoverage}」(覆盖率 ${metricsComparison.coverage.values[metricsComparison.coverage.values.findIndex(v => v.schemeId === schemes.find(s => s.name === bestCoverage)?.id)]?.value.toFixed(1)}%)`)
    recommendations.push(`均匀度最优：「${bestUniformity}」(均匀度 ${metricsComparison.uniformity.values[metricsComparison.uniformity.values.findIndex(v => v.schemeId === schemes.find(s => s.name === bestUniformity)?.id)]?.value.toFixed(1)}%)`)
    recommendations.push(`风险最低：「${lowestRisk}」(风险评分 ${metricsComparison.overallRiskScore.values[metricsComparison.overallRiskScore.values.findIndex(v => v.schemeId === schemes.find(s => s.name === lowestRisk)?.id)]?.value.toFixed(0)})`)
  }

  const avgCoverage = metricsComparison.coverage.values.reduce((s, v) => s + v.value, 0) / schemes.length
  const avgUniformity = metricsComparison.uniformity.values.reduce((s, v) => s + v.value, 0) / schemes.length
  const summary = `对比 ${schemes.length} 个方案：平均覆盖率 ${avgCoverage.toFixed(1)}%，平均均匀度 ${avgUniformity.toFixed(1)}%，最大差异 ${metricsComparison.coverage.delta.toFixed(1)}% 覆盖率 / ${metricsComparison.uniformity.delta.toFixed(1)}% 均匀度`

  return {
    id: `report_${Date.now()}`,
    generatedAt: Date.now(),
    schemes: schemes.map(s => ({
      id: s.id,
      name: s.name,
      params: s.params,
      result: s.result
    })),
    metricsComparison,
    recommendations,
    summary
  }
}

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

function calculateTrend(values: number[]): { slope: number; stability: number } {
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
    {
      factor: '滚筒磨损',
      impact: 0,
      description: ''
    },
    {
      factor: '温度波动',
      impact: 0,
      description: ''
    },
    {
      factor: '湿度变化',
      impact: 0,
      description: ''
    },
    {
      factor: '纸张吸墨',
      impact: 0,
      description: ''
    },
    {
      factor: '连续印刷',
      impact: 0,
      description: ''
    }
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
  steps: number = 50,
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
    id: `aging_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
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

export function generateAgingId(): string {
  return `aging_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
}

export function exportReportAsText(report: ComparisonReport): string {
  let text = '='.repeat(60) + '\n'
  text += '            印刷方案对比分析报告\n'
  text += '='.repeat(60) + '\n\n'
  text += `报告生成时间：${new Date(report.generatedAt).toLocaleString('zh-CN')}\n`
  text += `参与对比方案数：${report.schemes.length}\n\n`
  text += '【概要】\n'
  text += report.summary + '\n\n'
  text += '-'.repeat(60) + '\n\n'

  for (const scheme of report.schemes) {
    text += `【方案：${scheme.name}】\n`
    text += `  参数：黏度${scheme.params.viscosity}cP | 压力${scheme.params.pressure}MPa | 滚动${scheme.params.rollingCount}次 | 高差${scheme.params.heightDiff}μm\n`
    text += `  指标：覆盖率${scheme.result.coverage.toFixed(1)}% | 均匀度${scheme.result.uniformity.toFixed(1)}% | 墨厚${(scheme.result.averageThickness * 100).toFixed(1)}%\n`
    const risk = scheme.result.detailedRisk?.overallRiskScore ?? 50
    text += `  风险评分：${risk}/100 ${risk < 30 ? '(低风险)' : risk < 60 ? '(中风险)' : '(高风险)'}\n`
    text += '  主要风险：\n'
    scheme.result.riskAlerts.slice(0, 3).forEach(a => {
      text += `    - [${a.type}] ${a.title}：${a.message}\n`
    })
    text += '\n'
  }

  text += '-'.repeat(60) + '\n\n'
  text += '【优化建议】\n'
  report.recommendations.forEach((r, i) => {
    text += `  ${i + 1}. ${r}\n`
  })

  return text
}
