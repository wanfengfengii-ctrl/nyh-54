function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
}

export function generateSchemeId(): string {
  return generateId('scheme')
}

export function generateTemplateId(): string {
  return generateId('tpl')
}

export function generateHistoryId(): string {
  return generateId('hist')
}

export function generateExperimentId(): string {
  return generateId('exp')
}

export function generateShapeId(): string {
  return generateId('shape')
}

export function generateMachineId(): string {
  return generateId('machine')
}

export function generateOrderId(): string {
  return generateId('order')
}

export function generateAgingAnalysisId(): string {
  return generateId('aging')
}

export function generateMultiMachineResultId(): string {
  return generateId('multi')
}

export function generateReportId(): string {
  return generateId('report')
}
