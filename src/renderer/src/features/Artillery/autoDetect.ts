import type { App } from 'antd'
import type { GridDetectResult } from '@shared/types'
import { useArtillery } from './store'
import { calibrateFromGrid, defaultViewport, panByPx } from './lib/viewport'

type Message = ReturnType<typeof App.useApp>['message']

/** Resolves once the current DOM state has been painted. The timeout covers a
 *  window that paints no frames, which would otherwise hang the detection. */
const afterPaint = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    setTimeout(resolve, 100)
  })

/** Main keeps the overlay out of the capture via content protection; Linux has
 *  no such flag, so there the whole overlay fades out for the capture instead. */
const mustHide = window.api.platform === 'linux'

let autoTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Automatic re-detect (map opened, map zoomed, map dragged, Artillery tab
 * selected): runs `delay` ms from the latest request, so a burst of triggers
 * makes one run. Quiet — no toasts — since the grid often isn't on screen
 * (zoomed out, map closed). Waits out a detection that is already running
 * rather than dropping.
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
 * the grid in strips across the screen, then the viewport is recalibrated from it.
 * `quiet` skips the result toasts (automatic runs).
 */
export async function runAutoDetect(message: Message, { quiet = false } = {}): Promise<void> {
  const { detecting, setDetecting } = useArtillery.getState()
  if (detecting) return
  // ArtilleryLayer stops drawing our grid while detecting: its lines look like
  // the game's, and would break detection wherever the capture can't exclude
  // our window. Main captures only once that frame is on screen.
  setDetecting(true)
  const root = document.documentElement
  if (mustHide) root.classList.add('capture-hidden')
  await afterPaint()
  const w = window.innerWidth
  const h = window.innerHeight
  /** The viewport as the captured frame shows it. */
  const before = useArtillery.getState().viewport ?? defaultViewport(w, h)
  let res: GridDetectResult
  try {
    res = await window.api.overlay.detectGrid()
  } catch (err) {
    res = { ok: false, reason: 'capture', error: `Screen capture failed: ${(err as Error).message}`, found: [] }
  } finally {
    if (mustHide) root.classList.remove('capture-hidden')
    // Same render as the new viewport below, so the grid comes back already moved.
    setDetecting(false)
  }
  const { viewport, mode, calibrating, setViewport, setMode, setGridStatus } = useArtillery.getState()
  // Artillery turned off, or manual calibration started, while capturing.
  if (quiet && (mode === 'off' || calibrating)) return
  if (!res.ok) {
    // Quiet runs too: the HUD shows the outcome of every detection.
    setGridStatus({ kind: res.reason === 'not-found' ? 'not-found' : 'failed', error: res.error, at: Date.now() })
    if (!quiet) message.error(res.error, 6)
    return
  }
  const now = viewport ?? defaultViewport(w, h)
  const lines = { x: res.xLine, y: res.yLine }
  const centre = { x: w / 2, y: h / 2 }
  if (now.zoom === before.zoom) {
    // The lines are where the frame saw them. Map drags (or arrow nudges)
    // during the capture have panned the grid since: calibrate the viewport the
    // frame shows, then replay those pans, instead of snapping them back.
    const fitted = calibrateFromGrid(before, res.cellPx, lines, centre)
    setViewport(panByPx(fitted, now.x - before.x, now.y - before.y))
  } else {
    // Recalibrated meanwhile: nothing to replay onto.
    setViewport(calibrateFromGrid(now, res.cellPx, lines, centre))
  }
  setGridStatus({ kind: 'found', cellPx: res.cellPx, at: Date.now() })
  // From the hotkey with artillery off: show the result without taking the mouse.
  if (mode === 'off') setMode('locked')
  if (quiet) return

  message.success(`Grid detected: ${res.cellPx.toFixed(1)} px per cell.`, 3)
}
