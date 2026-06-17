import type { ComparisonReport, SavedScheme, SimulationResult } from '../../types'
import { generateReportId } from '../idGenerator'

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
    id: generateReportId(),
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
