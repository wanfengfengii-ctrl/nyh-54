import { ref, type Ref } from 'vue'
import type { PlaybackState } from '../types'

export interface UsePlaybackOptions<T> {
  items: Ref<T[]>
  defaultSpeed?: number
  onIndexChange?: (index: number, item: T) => void
}

export function usePlayback<T>(options: UsePlaybackOptions<T>) {
  const { items, defaultSpeed = 1000, onIndexChange } = options

  const playbackState = ref<PlaybackState>({
    isPlaying: false,
    isPaused: false,
    currentIndex: -1,
    speed: defaultSpeed,
    direction: 'forward' as 'forward' | 'backward'
  })

  let playbackTimer: number | null = null

  function getCurrentItem(): T | null {
    const idx = playbackState.value.currentIndex
    if (idx < 0 || idx >= items.value.length) return null
    return items.value[idx]
  }

  function jumpToIndex(index: number): T | null {
    if (index < 0 || index >= items.value.length) return null
    playbackState.value.currentIndex = index
    const item = items.value[index]
    if (onIndexChange) {
      onIndexChange(index, item)
    }
    return item
  }

  function startPlayback(callback?: (item: T, index: number) => void) {
    if (items.value.length < 2) return
    stopPlayback()
    playbackState.value.isPlaying = true
    playbackState.value.isPaused = false

    if (playbackState.value.currentIndex < 0 || playbackState.value.currentIndex >= items.value.length - 1) {
      playbackState.value.currentIndex = playbackState.value.direction === 'forward'
        ? 0
        : items.value.length - 1
    }

    const tick = () => {
      if (!playbackState.value.isPlaying || playbackState.value.isPaused) return
      const idx = playbackState.value.currentIndex
      const next = playbackState.value.direction === 'forward'
        ? idx + 1
        : idx - 1
      if (next < 0 || next >= items.value.length) {
        stopPlayback()
        return
      }
      playbackState.value.currentIndex = next
      const item = items.value[next]
      if (onIndexChange) {
        onIndexChange(next, item)
      }
      if (callback) {
        callback(item, next)
      }
      playbackTimer = window.setTimeout(tick, playbackState.value.speed)
    }
    playbackTimer = window.setTimeout(tick, playbackState.value.speed)
  }

  function pausePlayback() {
    playbackState.value.isPaused = true
  }

  function resumePlayback(callback?: (item: T, index: number) => void) {
    if (!playbackState.value.isPlaying) return
    playbackState.value.isPaused = false
    const tick = () => {
      if (!playbackState.value.isPlaying || playbackState.value.isPaused) return
      const idx = playbackState.value.currentIndex
      const next = playbackState.value.direction === 'forward'
        ? idx + 1
        : idx - 1
      if (next < 0 || next >= items.value.length) {
        stopPlayback()
        return
      }
      playbackState.value.currentIndex = next
      const item = items.value[next]
      if (onIndexChange) {
        onIndexChange(next, item)
      }
      if (callback) {
        callback(item, next)
      }
      playbackTimer = window.setTimeout(tick, playbackState.value.speed)
    }
    playbackTimer = window.setTimeout(tick, playbackState.value.speed)
  }

  function stopPlayback() {
    playbackState.value.isPlaying = false
    playbackState.value.isPaused = false
    if (playbackTimer) {
      clearTimeout(playbackTimer)
      playbackTimer = null
    }
  }

  function setPlaybackSpeed(speed: number) {
    playbackState.value.speed = speed
  }

  function setPlaybackDirection(dir: 'forward' | 'backward') {
    playbackState.value.direction = dir
  }

  function resetPlayback() {
    stopPlayback()
    playbackState.value.currentIndex = -1
  }

  return {
    playbackState,
    getCurrentItem,
    jumpToIndex,
    startPlayback,
    pausePlayback,
    resumePlayback,
    stopPlayback,
    setPlaybackSpeed,
    setPlaybackDirection,
    resetPlayback
  }
}
