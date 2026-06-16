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
  SavedScheme
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

function generateDetailedRiskAnalysis(
  params: PrintParams,
  coverage: number,
  uniformity: number,
  averageThickness: number,
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

  return {
    overallRiskScore,
    riskBreakdown: {
      coverageRisk: Math.round(coverageRisk),
      uniformityRisk: Math.round(uniformityRisk),
      smearingRisk: Math.round(smearingRisk),
      missingInkRisk: Math.round(missingInkRisk),
      heightDifferenceRisk: Math.round(heightDifferenceRisk),
      parameterCompatibilityRisk: Math.round(parameterCompatibilityRisk)
    },
    regionalRisks,
    suggestions
  }
}

function detectRegionalRisks(inkMap: number[][], heightMap: number[][]): RegionalRisk[] {
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

export function calculateBatchScore(result: SimulationResult, target: string): { coverage: number; uniformity: number; balanced: number } {
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
