import type { App } from 'antd'
import type { GridDetectResult } from '@shared/types'
import { useArtillery } from './store'
import { calibrateFromGrid, defaultViewport } from './lib/viewport'

type Message = ReturnType<typeof App.useApp>['message']

/** Resolves once the current DOM state has been painted. */
const afterPaint = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

/** Main keeps the overlay out of the capture via content protection; Linux has
 *  no such flag, so there the overlay fades out for the capture instead. */
const mustHide = window.api.platform === 'linux'

let autoTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Automatic re-detect (map opened, map zoomed, Artillery tab selected): runs
 * `delay` ms from the latest request, so a burst of triggers makes one run.
 * Quiet — no toasts — since the grid often isn't on screen (zoomed out, map
 * closed). Waits out a detection that is already running rather than dropping.
 */
export function requestAutoDetect(message: Message, delay: number): void {
  clearTimeout(autoTimer)
  const fire = (): void => {
    const s = useArtillery.getState()
    if (s.mode === 'off' || s.calibrating) return
    if (s.detecting) {
      autoTimer = setTimeout(fire, 200)
      return
    }
    void runAutoDetect(message, { quiet: true })
  }
  autoTimer = setTimeout(fire, delay)
}

/**
 * Grid auto-detect, shared by the HUD button and the global hotkey: main finds
 * the grid in the screen edges, then the viewport is recalibrated from it.
 * `quiet` skips the result toasts (automatic runs).
 */
export async function runAutoDetect(message: Message, { quiet = false } = {}): Promise<void> {
  const { detecting, setDetecting, mode: startMode } = useArtillery.getState()
  if (detecting) return
  setDetecting(true)
  const root = document.documentElement
  // Locked mode doesn't draw our grid — belt and braces where the capture
  // can't exclude the window.
  if (mustHide) {
    if (startMode === 'edit') useArtillery.getState().setMode('locked')
    root.classList.add('capture-hidden')
    await afterPaint()
  }
  let res: GridDetectResult
  try {
    res = await window.api.overlay.detectGrid()
  } catch (err) {
    res = { ok: false, reason: 'capture', error: `Screen capture failed: ${(err as Error).message}`, edges: [] }
  } finally {
    if (mustHide) {
      root.classList.remove('capture-hidden')
      if (startMode === 'edit' && useArtillery.getState().mode === 'locked') useArtillery.getState().setMode('edit')
    }
    setDetecting(false)
  }
  if (!res.ok) {
    if (!quiet) message.error(res.error, 6)
    return
  }

  const { viewport, mode, setViewport, setMode } = useArtillery.getState()
  const w = window.innerWidth
  const h = window.innerHeight
  const vp = viewport ?? defaultViewport(w, h)
  setViewport(calibrateFromGrid(vp, res.cellPx, { x: res.xLine, y: res.yLine }, { x: w / 2, y: h / 2 }))
  // From the hotkey with artillery off: show the result without taking the mouse.
  if (mode === 'off') setMode('locked')
  if (quiet) return

  const hint =
    res.xLine == null
      ? ' Left/right alignment not found: nudge with ←/→.'
      : res.yLine == null
        ? ' Up/down alignment not found: nudge with ↑/↓.'
        : ''
  message.success(`Grid detected: ${res.cellPx.toFixed(1)} px per cell (${res.edges.join(', ')}).${hint}`, hint ? 6 : 3)
}
