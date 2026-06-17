export type ShapeType = 'rectangle' | 'circle' | 'ellipse' | 'polygon' | 'text' | 'freehand'

export interface PlateShape {
  id: string
  type: ShapeType
  x: number
  y: number
  width: number
  height: number
  localHeight: number
  rotation: number
  color: string
  label?: string
  points?: { x: number; y: number }[]
  text?: string
  fontSize?: number
}

export interface PlateTemplate {
  id: string
  name: string
  shapes: PlateShape[]
  baseHeight: number
  createdAt: number
  updatedAt: number
  preview?: string
}
