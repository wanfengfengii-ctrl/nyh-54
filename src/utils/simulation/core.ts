import type { PrintParams, SimulationResult, ValidationResult, PlateTemplate, PlateShape, RiskAlert } from '../../types'
import { GRID_WIDTH, GRID_HEIGHT, PARAMS_RANGES, COVERAGE_THRESHOLDS } from '../../types'
import { generateDetailedRiskAnalysis } from './risk'

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

function thresholdToCoverage(thickness: number): number {
  if (thickness <= 0.05) return 0
  if (thickness >= 0.95) return 100
  return ((thickness - 0.05) / 0.9) * 100
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
