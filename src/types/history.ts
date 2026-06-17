import type { PrintParams, SimulationResult } from './core'

export interface ParamHistoryEntry {
  id: string
  timestamp: number
  params: PrintParams
  result: SimulationResult
  templateId?: string
  note?: string
  changes: {
    param: keyof PrintParams
    oldValue: number
    newValue: number
  }[]
}

export interface PlaybackState {
  isPlaying: boolean
  isPaused: boolean
  currentIndex: number
  speed: number
  direction: 'forward' | 'backward'
}
