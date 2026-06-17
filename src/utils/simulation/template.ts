import type { PlateTemplate, PlateShape } from '../../types'
import { generateShapeId } from '../idGenerator'

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

export function createEmptyTemplate(id: string, name: string): PlateTemplate {
  const now = Date.now()
  return {
    id,
    name,
    shapes: [],
    baseHeight: 0,
    createdAt: now,
    updatedAt: now
  }
}

export function cloneShape(shape: PlateShape, newId: string): PlateShape {
  return {
    ...shape,
    id: newId,
    points: shape.points ? [...shape.points] : undefined
  }
}
