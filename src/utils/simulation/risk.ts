import type { PrintParams, DetailedRiskAnalysis, RegionalRisk } from '../../types'
import { GRID_WIDTH, GRID_HEIGHT, COVERAGE_THRESHOLDS } from '../../types'

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
