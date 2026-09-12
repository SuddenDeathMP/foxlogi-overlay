import { desktopCapturer, systemPreferences } from 'electron'
import { IPC } from '@shared/ipc-contract'
import type { MapOpenState, MapWatchStart } from '@shared/types'
import { targetDisplay } from './zones'
import { getOverlay, isInteractive } from './window'
import { MAP_ICON_REGION, MAP_ICON_THRESHOLD, REF_HEIGHT, mapIconScore } from './mapIcon'
import { addGameInputListener, type MapKey } from './gameInput'
import { grabScreen, isBlack, physicalBounds } from './screenGrab'

/** Pause between captures. A desktopCapturer capture itself takes ~300 ms (far
 *  more on Windows); a GDI corner read on Windows takes milliseconds. */
const POLL_MS = 80
/** Consecutive "no icon" reads before polling alone reports the map closed.
 *  Opening needs just one: nothing but the map scores near the threshold. */
const CLOSE_READS = 2
/** After M / Esc, give the game this long to redraw before capturing; reads
 *  from captures started earlier are stale and ignored. */
const KEY_SETTLE_MS = 100
/** Quiet time after the last wheel step before the map counts as re-zoomed. */
const ZOOM_SETTLE_MS = 400
/** All-black GDI reads in a row before giving up on GDI for this watch (a
 *  GPU/driver setup where GDI can't see the game). */
const BLACK_READS = 3

const PERMISSION_HINT =
  'Map detection needs Screen Recording: allow it for the overlay in System Settings → Privacy & Security, then restart it.'

let generation = 0
let open: boolean | null = null
let closeReads = 0
let timer: ReturnType<typeof setTimeout> | undefined
let inFlight = false
/** A key asked for a fresh capture while one was running. */
let kicked = false
/** Captures started before this (ms epoch) predate the last key press. */
let ignoreBefore = 0
let zoomTimer: ReturnType<typeof setTimeout> | undefined
let offInput: (() => void) | null = null
/** Try the GDI corner read (Windows) this watch; off once its reads come back black. */
let useGdi = false
let blackReads = 0

function push(state: MapOpenState): void {
  getOverlay()?.webContents.send(IPC.pushMapOpen, state)
}

function setOpen(value: boolean): void {
  closeReads = 0
  if (open === value) return
  open = value
  push({ open })
}

function schedule(gen: number, delay: number): void {
  clearTimeout(timer)
  timer = setTimeout(() => void tick(gen), delay)
}

/**
 * The icon score from the fastest capture available. On Windows only the
 * corner is read, with GDI (screenGrab.ts); desktopCapturer would capture and
 * scale the whole display on every poll, which is slow there.
 */
async function readScore(): Promise<number> {
  if (useGdi) {
    // Physical px, top-right corner of the target display.
    const phys = physicalBounds(targetDisplay())
    const scale = phys.height / REF_HEIGHT
    const width = Math.min(phys.width, Math.round(MAP_ICON_REGION.w * scale))
    const height = Math.min(phys.height, Math.round(MAP_ICON_REGION.h * scale))
    const frames = await grabScreen([{ x: phys.x + phys.width - width, y: phys.y, width, height }])
    if (frames) {
      blackReads = isBlack(frames[0]) ? blackReads + 1 : 0
      if (blackReads < BLACK_READS) return mapIconScore(frames[0], scale)
      console.warn('[mapWatch] GDI corner reads are black; using desktopCapturer')
      useGdi = false
    }
  }
  return readScoreCapturer()
}

/** One capture of the display, scaled to REF_HEIGHT; returns the icon score. */
async function readScoreCapturer(): Promise<number> {
  const display = targetDisplay()
  const { width, height } = display.bounds
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    // Normalizing to the reference height makes Retina (2×) and 1× screens alike.
    thumbnailSize: { width: Math.round((REF_HEIGHT * width) / height), height: REF_HEIGHT }
  })
  const source = sources.find((s) => s.display_id === String(display.id)) ?? (sources.length === 1 ? sources[0] : undefined)
  const img = source?.thumbnail
  if (!img || img.isEmpty()) throw new Error('Screen capture returned no image.')
  const size = img.getSize()
  const s = size.height / REF_HEIGHT
  const w = Math.min(size.width, Math.round(MAP_ICON_REGION.w * s))
  const h = Math.min(size.height, Math.round(MAP_ICON_REGION.h * s))
  const corner = img.crop({ x: size.width - w, y: 0, width: w, height: h })
  return mapIconScore({ data: corner.toBitmap(), width: w, height: h }, s)
}

async function tick(gen: number): Promise<void> {
  if (gen !== generation) return
  inFlight = true
  kicked = false
  const startedAt = Date.now()
  let score: number
  try {
    score = await readScore()
  } catch (err) {
    inFlight = false
    if (gen !== generation) return
    stopMapWatch()
    push({ open: null, error: `Map detection stopped: ${(err as Error).message}` })
    return
  }
  inFlight = false
  if (gen !== generation) return

  if (startedAt >= ignoreBefore) {
    if (score >= MAP_ICON_THRESHOLD) setOpen(true)
    else if (open !== false && (open == null || ++closeReads >= CLOSE_READS)) setOpen(false)
  }
  schedule(gen, kicked ? Math.max(0, ignoreBefore - Date.now()) : POLL_MS)
}

/**
 * M / Esc from the global key hook. The map closes only through these, so an
 * open map is reported closed at once; captures then confirm (M typed into
 * chat, say, is corrected by the next read). Either way a fresh capture is
 * started as soon as the game has redrawn, which also catches the map opening.
 */
function onMapKey(key: MapKey): void {
  const wasOpen = open === true
  if (wasOpen) setOpen(false)
  // Esc never opens the map, so with it closed there's nothing to rush.
  if (key === 'escape' && !wasOpen) return
  ignoreBefore = Date.now() + KEY_SETTLE_MS
  if (inFlight) kicked = true
  else schedule(generation, KEY_SETTLE_MS)
}

/**
 * Mouse wheel over the open map = the game zooming it. Once the wheel has been
 * quiet for ZOOM_SETTLE_MS, tell the renderer so it can re-detect the grid.
 * Wheel steps over our own UI (window interactive) are ours, not the game's.
 */
function onWheel(): void {
  if (open !== true || isInteractive()) return
  clearTimeout(zoomTimer)
  zoomTimer = setTimeout(() => {
    if (open === true) getOverlay()?.webContents.send(IPC.pushMapZoomed)
  }, ZOOM_SETTLE_MS)
}

/**
 * Start polling the screen for the map's search icon; changes arrive as
 * push:mapOpen. Returns the probed corner in window coordinates so the renderer
 * can keep its own drawings out of it (they'd be in the capture otherwise).
 */
export function startMapWatch(): MapWatchStart {
  if (process.platform === 'darwin') {
    const access = systemPreferences.getMediaAccessStatus('screen')
    if (access === 'denied' || access === 'restricted') return { ok: false, error: PERMISSION_HINT }
  }
  const gen = ++generation
  open = null
  closeReads = 0
  ignoreBefore = 0
  kicked = false
  useGdi = process.platform === 'win32'
  blackReads = 0
  schedule(gen, 0)
  offInput?.()
  offInput = addGameInputListener({ key: onMapKey, wheel: onWheel })
  const keys = offInput != null

  const display = targetDisplay()
  const k = display.bounds.height / REF_HEIGHT
  const w = MAP_ICON_REGION.w * k
  const h = MAP_ICON_REGION.h * k
  // Display space → window space (on macOS the window sits below the menu bar).
  const content = getOverlay()?.getContentBounds() ?? display.bounds
  return {
    ok: true,
    keys,
    region: {
      x: display.bounds.x + display.bounds.width - w - content.x,
      y: display.bounds.y - content.y,
      w,
      h
    }
  }
}

export function stopMapWatch(): void {
  generation++
  clearTimeout(timer)
  clearTimeout(zoomTimer)
  offInput?.()
  offInput = null
  open = null
  closeReads = 0
}
