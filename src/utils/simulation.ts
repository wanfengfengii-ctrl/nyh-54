import type { PrintParams, SimulationResult, RiskAlert, ValidationResult } from '../types'
import { GRID_WIDTH, GRID_HEIGHT, PARAMS_RANGES, COVERAGE_THRESHOLDS } from '../types'

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

function generateHeightMap(heightDiff: number, seed: number): number[][] {
  const random = seededRandom(seed)
  const heightMap: number[][] = []
  
  for (let y = 0; y < GRID_HEIGHT; y++) {
    const row: number[] = []
    for (let x = 0; x < GRID_WIDTH; x++) {
      let h = 0
      if (heightDiff > 0) {
        const xFactor = Math.sin(x * 0.05) * 0.3 + 0.7
        const yFactor = Math.cos(y * 0.08) * 0.2 + 0.8
        const noise = (random() - 0.5) * 0.5
        h = heightDiff * xFactor * yFactor * (0.5 + noise + 0.5)
        h = Math.max(0, Math.min(heightDiff, h))
      }
      row.push(h)
    }
    heightMap.push(row)
  }
  return heightMap
}

function applyRolling(
  inkMap: number[][],
  pressure: number,
  viscosity: number,
  rollingCount: number,
  heightMap: number[][],
  seed: number
): number[][] {
  const random = seededRandom(seed + 1000)
  const result: number[][] = inkMap.map(row => [...row])
  
  const pressureFactor = pressure / 100
  const viscosityFactor = viscosity / 100
  const transferEfficiency = 0.3 + pressureFactor * 0.5 - viscosityFactor * 0.2
  const spreadFactor = 0.05 + (1 - viscosityFactor) * 0.15

  for (let pass = 0; pass < rollingCount; pass++) {
    const passOffset = pass * 3
    const tempMap: number[][] = result.map(row => [...row])

    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        const heightFactor = 1 - (heightMap[y][x] / 50) * 0.6
        const localPressure = pressureFactor * heightFactor
        const noise = (random() - 0.5) * 0.1

        const sourceX = (x + passOffset) % GRID_WIDTH
        const sourceY = y
        const availableInk = tempMap[sourceY][sourceX]
        
        const transferAmount = availableInk * transferEfficiency * localPressure * (0.8 + noise)
        result[y][x] = Math.min(1, result[y][x] + transferAmount)
        
        if (spreadFactor > 0 && result[y][x] > 0.3) {
          const spreadAmount = result[y][x] * spreadFactor * (1 - viscosityFactor * 0.5)
          if (x > 0) result[y][x - 1] = Math.min(1, result[y][x - 1] + spreadAmount * 0.25)
          if (x < GRID_WIDTH - 1) result[y][x + 1] = Math.min(1, result[y][x + 1] + spreadAmount * 0.25)
          if (y > 0) result[y - 1][x] = Math.min(1, result[y - 1][x] + spreadAmount * 0.25)
          if (y < GRID_HEIGHT - 1) result[y + 1][x] = Math.min(1, result[y + 1][x] + spreadAmount * 0.25)
        }
      }
    }
  }

  return result
}

function generateInitialInkMap(viscosity: number, pressure: number, seed: number): number[][] {
  const random = seededRandom(seed + 500)
  const inkMap: number[][] = []
  const baseAmount = 0.4 + (pressure / 100) * 0.3 - (viscosity / 100) * 0.1

  for (let y = 0; y < GRID_HEIGHT; y++) {
    const row: number[] = []
    for (let x = 0; x < GRID_WIDTH; x++) {
      const edgeFactor = 0.8 + Math.sin(x * 0.1 + y * 0.05) * 0.15
      const noise = (random() - 0.5) * 0.4
      let amount = baseAmount * edgeFactor * (0.7 + noise + 0.3)
      amount = Math.max(0, Math.min(1, amount))
      row.push(amount)
    }
    inkMap.push(row)
  }

  return inkMap
}

export function runSimulation(params: PrintParams): SimulationResult {
  const seed = Math.floor(params.viscosity * 1000 + params.pressure * 100 + params.rollingCount * 10 + params.heightDiff * 7)
  
  const heightMap = generateHeightMap(params.heightDiff, seed)
  let inkMap = generateInitialInkMap(params.viscosity, params.pressure, seed)
  inkMap = applyRolling(inkMap, params.pressure, params.viscosity, params.rollingCount, heightMap, seed)

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

  return {
    coverage,
    uniformity,
    averageThickness,
    thicknessMap: inkMap,
    coverageMap,
    riskAlerts,
    timestamp: Date.now()
  }
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
      level: 3
    })
  } else if (coverage < COVERAGE_THRESHOLDS.optimalMin) {
    alerts.push({
      type: 'warning',
      title: '覆盖率偏低',
      message: `当前覆盖率 ${coverage.toFixed(1)}%，略低于理想范围（${COVERAGE_THRESHOLDS.optimalMin}%-${COVERAGE_THRESHOLDS.optimalMax}%）。`,
      level: 2
    })
  } else if (coverage > COVERAGE_THRESHOLDS.tooHigh) {
    alerts.push({
      type: 'danger',
      title: '覆盖率过高',
      message: `当前覆盖率达 ${coverage.toFixed(1)}%，油墨过量易造成糊版。建议减小压力或降低黏度。`,
      level: 3
    })
  } else if (coverage > COVERAGE_THRESHOLDS.optimalMax) {
    alerts.push({
      type: 'warning',
      title: '覆盖率偏高',
      message: `当前覆盖率 ${coverage.toFixed(1)}%，略高于理想范围（${COVERAGE_THRESHOLDS.optimalMin}%-${COVERAGE_THRESHOLDS.optimalMax}%）。`,
      level: 2
    })
  }

  if (uniformity < 50) {
    alerts.push({
      type: 'danger',
      title: '印刷均匀度过差',
      message: `均匀度仅 ${uniformity.toFixed(1)}%，会产生浓淡不均。建议增加滚动次数或调整压力。`,
      level: 3
    })
  } else if (uniformity < 70) {
    alerts.push({
      type: 'warning',
      title: '印刷均匀度一般',
      message: `均匀度 ${uniformity.toFixed(1)}%，局部可能存在浓淡差异。`,
      level: 2
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
      level: 3
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
      level: 3
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
      level: 2
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
