import { useEffect } from 'react'
import type { App } from 'antd'
import { useArtillery } from './store'
import { requestAutoDetect } from './autoDetect'
import { defaultViewport, panByPx } from './lib/viewport'

type Message = ReturnType<typeof App.useApp>['message']

/** A drag shorter than this (px) is a click, not a pan: no re-detect. */
const MIN_DRAG_PX = 3
/** Re-detect this long after the drag ends, once the map has settled. */
const REDETECT_MS = 300

/**
 * While `active`, left-drags on the game (reported by main's input hook) pan
 * the grid and pins along with the in-game map. The game's pan isn't always
 * exactly 1:1 (smoothing, map edges), so each drag ends with a quiet grid
 * re-detect that snaps the grid back onto the game's lines.
 */
export function useMapDrag(active: boolean, message: Message): void {
  useEffect(() => {
    if (!active) return
    let moved = 0
    const off = window.api.overlay.onMapDrag(({ dx, dy, end }) => {
      const { viewport, setViewport } = useArtillery.getState()
      if (dx !== 0 || dy !== 0) {
        const vp = viewport ?? defaultViewport(window.innerWidth, window.innerHeight)
        setViewport(panByPx(vp, dx, dy))
        moved += Math.hypot(dx, dy)
      }
      if (end) {
        if (moved >= MIN_DRAG_PX) requestAutoDetect(message, REDETECT_MS)
        moved = 0
      }
    })
    void window.api.overlay.setMapDrag(true)
    return () => {
      off()
      void window.api.overlay.setMapDrag(false)
    }
  }, [active, message])
}
