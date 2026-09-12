import type { App } from 'antd'
import type { GridDetectResult } from '@shared/types'
import { useArtillery } from './store'
import { calibrateFromGrid, defaultViewport, panByPx } from './lib/viewport'

type Message = ReturnType<typeof App.useApp>['message']

/** How a detection ended. */
export type DetectOutcome = 'ok' | 'not-found' | 'error'

/** Automatic runs that don't find the grid try again this many times… */
const AUTO_RETRIES = 2
/** …this far apart, ms: the first try can land in the game's map open / zoom animation. */
const RETRY_MS = 500

/** Resolves once the current DOM state has been painted. */
const afterPaint = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

/** Main keeps the overlay out of the capture via content protection; Linux has
 *  no such flag, so there the overlay fades out for the capture instead. */
const mustHide = window.api.platform === 'linux'

let autoTimer: ReturnType<typeof setTimeout> | undefined
/** Bumped by each request; a retry of an older one stops. */
let autoSeq = 0

/**
 * Automatic re-detect (map opened, map zoomed, map dragged, Artillery tab
 * selected): runs `delay` ms from the latest request, so a burst of triggers
 * makes one run. Quiet — no toasts — since the grid often isn't on screen
 * (zoomed out, map closed). Waits out a detection that is already running
 * rather than dropping. A miss is retried AUTO_RETRIES times.
 */
export function requestAutoDetect(message: Message, delay: number, retries = AUTO_RETRIES): void {
  clearTimeout(autoTimer)
  const seq = ++autoSeq
  const fire = (): void => {
    const s = useArtillery.getState()
    if (s.mode === 'off' || s.calibrating) return
    if (s.detecting) {
      autoTimer = setTimeout(fire, 200)
      return
    }
    void runAutoDetect(message, { quiet: true }).then((outcome) => {
      if (outcome === 'not-found' && retries > 0 && seq === autoSeq) requestAutoDetect(message, RETRY_MS, retries - 1)
    })
  }
  autoTimer = setTimeout(fire, delay)
}

/**
 * Grid auto-detect, shared by the HUD button and the global hotkey: main finds
 * the grid in the screen edges, then the viewport is recalibrated from it.
 * `quiet` skips the result toasts (automatic runs).
 */
export async function runAutoDetect(message: Message, { quiet = false } = {}): Promise<DetectOutcome> {
  const { detecting, setDetecting, mode: startMode } = useArtillery.getState()
  if (detecting) return 'error'
  setDetecting(true)
  const root = document.documentElement
  // Locked mode doesn't draw our grid — belt and braces where the capture
  // can't exclude the window.
  if (mustHide) {
    if (startMode === 'edit') useArtillery.getState().setMode('locked')
    root.classList.add('capture-hidden')
    await afterPaint()
  }
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
    if (mustHide) {
      root.classList.remove('capture-hidden')
      if (startMode === 'edit' && useArtillery.getState().mode === 'locked') useArtillery.getState().setMode('edit')
    }
    setDetecting(false)
  }
  if (!res.ok) {
    if (!quiet) message.error(res.error, 6)
    return res.reason === 'not-found' ? 'not-found' : 'error'
  }

  const { viewport, mode, calibrating, setViewport, setMode } = useArtillery.getState()
  // Artillery turned off, or manual calibration started, while capturing.
  if (quiet && (mode === 'off' || calibrating)) return 'ok'
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
  // From the hotkey with artillery off: show the result without taking the mouse.
  if (mode === 'off') setMode('locked')
  if (quiet) return 'ok'

  message.success(`Grid detected: ${res.cellPx.toFixed(1)} px per cell.`, 3)
  return 'ok'
}
