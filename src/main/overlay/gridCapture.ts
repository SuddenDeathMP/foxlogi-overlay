import { app, desktopCapturer, systemPreferences, type Display, type NativeImage } from 'electron'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import type { GridAxis, GridDetectResult } from '@shared/types'
import { targetDisplay } from './zones'
import { getOverlay } from './window'
import { detectGridInStrips, stripLayout, type GridDetection, type Strip, type StripRect } from './gridDetect'
import createDetectWorker from './gridDetect.worker?nodeWorker'
import type { GridDetectRequest } from './gridDetect.worker'
import { grabScreen, isBlack, physicalBounds, type Frame } from './screenGrab'
import { createWorkerClient } from './workerRpc'

/** Margin for the window server to apply content protection (immediate on macOS). */
const EXCLUDE_SETTLE_MS = 30

const analysis = createWorkerClient<GridDetectRequest, GridDetection>('gridDetect', () => createDetectWorker({}))

const PERMISSION_HINT =
  'Screen capture is blocked. Allow Screen Recording for the overlay in System Settings → Privacy & Security, then restart it.'

/**
 * Dev aid: save the exact frame the detector saw, for tuning on real captures.
 * Written as an uncompressed 32-bit BMP (the bitmap is already BGRA) after the
 * current detection returns — PNG-encoding a 4K frame blocks main for ~1.4 s.
 */
function dumpFrame(frame: () => Frame): void {
  setImmediate(() => {
    const { data, width, height } = frame()
    const pixels = Buffer.from(data.buffer, data.byteOffset, data.byteLength)
    const header = Buffer.alloc(54)
    header.write('BM', 0)
    header.writeUInt32LE(54 + pixels.length, 2)
    header.writeUInt32LE(54, 10)
    header.writeUInt32LE(40, 14)
    header.writeInt32LE(width, 18)
    header.writeInt32LE(-height, 22) // negative: rows top-down
    header.writeUInt16LE(1, 26)
    header.writeUInt16LE(32, 28)
    header.writeUInt32LE(pixels.length, 34)
    const file = join(app.getPath('temp'), 'foxlogi-grid-capture.bmp')
    writeFile(file, Buffer.concat([header, pixels])).then(
      () => console.log(`[grid] capture saved to ${file}`),
      () => {}
    )
  })
}

/** One frame's strips (see stripLayout), in physical px. */
interface Strips {
  h: Strip[]
  v: Strip[]
  /** Physical px per logical px. */
  scale: number
}

/**
 * Windows: read only the strips, with GDI (screenGrab.ts) — milliseconds,
 * where desktopCapturer captures the whole display at full resolution. Null
 * when GDI isn't available or can't see the screen (all black).
 */
async function stripsFromGdi(display: Display): Promise<Strips | null> {
  const phys = physicalBounds(display)
  const scale = phys.width / display.bounds.width
  const { h, v } = stripLayout(phys.width, phys.height, scale)
  const onScreen = (r: StripRect): StripRect => ({ ...r, x: phys.x + r.x, y: phys.y + r.y })
  // Dev builds also read the whole display in the same call for the dump, so
  // it shows the same moment the strips come from.
  const full = !app.isPackaged ? [{ x: phys.x, y: phys.y, width: phys.width, height: phys.height }] : []
  const frames = await grabScreen([...h, ...v].map(onScreen).concat(full))
  if (!frames) return null
  const strips = frames.slice(0, h.length + v.length)
  if (strips.every(isBlack)) {
    console.warn('[grid] GDI strips are black; using desktopCapturer')
    return null
  }
  if (full.length) dumpFrame(() => frames[frames.length - 1])
  return { h: strips.slice(0, h.length), v: strips.slice(h.length), scale }
}

/** Everywhere else (and the Windows fallback): capture the whole display, cut the strips. */
async function stripsFromCapturer(display: Display): Promise<Strips | GridDetectResult> {
  const { width, height } = display.bounds
  let img: NativeImage | undefined
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.round(width * display.scaleFactor),
        height: Math.round(height * display.scaleFactor)
      }
    })
    const source = sources.find((s) => s.display_id === String(display.id)) ?? (sources.length === 1 ? sources[0] : undefined)
    img = source?.thumbnail
  } catch (err) {
    return { ok: false, reason: 'capture', error: `Screen capture failed: ${(err as Error).message}`, found: [] }
  }
  if (!img || img.isEmpty()) {
    const error = process.platform === 'darwin' ? PERMISSION_HINT : 'Screen capture returned no image.'
    return { ok: false, reason: 'capture', error, found: [] }
  }
  const frame = img
  const size = frame.getSize()
  if (!app.isPackaged) dumpFrame(() => ({ data: frame.toBitmap(), ...size }))

  // Physical px per logical px, from the frame we actually got.
  const scale = size.width / width
  const { h, v } = stripLayout(size.width, size.height, scale)
  const cut = (r: StripRect): Strip => ({ data: frame.crop(r).toBitmap(), width: r.width, height: r.height })
  return { h: h.map(cut), v: v.map(cut), scale }
}

/** Lines found per axis: 'x' fits are vertical lines, 'y' fits horizontal. */
const AXIS_LINES = { x: 'vertical', y: 'horizontal' } as const satisfies Record<'x' | 'y', GridAxis>

/**
 * Capture the overlay's display and detect the map grid from thin strips laid
 * across it (gridDetect.ts). Our own window is kept out of the frame (see
 * below). Only numbers leave the main process, never pixels.
 */
export async function detectGridOnScreen(): Promise<GridDetectResult> {
  if (process.platform === 'darwin') {
    const access = systemPreferences.getMediaAccessStatus('screen')
    // 'not-determined' falls through: the first capture triggers the OS prompt.
    if (access === 'denied' || access === 'restricted') {
      return { ok: false, reason: 'permission', error: PERMISSION_HINT, found: [] }
    }
  }

  const display = targetDisplay()
  const win = getOverlay()
  let captured: Strips | GridDetectResult
  // Keep our own drawings out of the frame. On macOS/Windows content protection
  // excludes the window from screen capture while it stays visible on screen
  // (no blink); on Windows that covers GDI reads too. Linux has no such flag;
  // there the renderer fades the overlay out before calling this.
  const exclude = win != null && process.platform !== 'linux'
  if (exclude) win.setContentProtection(true)
  try {
    if (exclude) await new Promise((r) => setTimeout(r, EXCLUDE_SETTLE_MS))
    const gdi = process.platform === 'win32' ? await stripsFromGdi(display) : null
    captured = gdi ?? (await stripsFromCapturer(display))
  } finally {
    if (exclude) win.setContentProtection(false)
  }
  if ('ok' in captured) return captured

  // The game's own panels only hide the lines where they are: their contrast
  // fails the line filter. Strips are copied to the worker (not transferred),
  // so they're still here if it's unavailable.
  const { h, v, scale } = captured
  const result = (await analysis.request({ h, v, scale })) ?? detectGridInStrips(h, v, scale)

  if (!result.ok) {
    const found = result.fits.map((f) => AXIS_LINES[f.axis])
    const what = found.length ? `only ${found[0]} lines found; need both` : 'no grid lines found'
    return {
      ok: false,
      reason: 'not-found',
      error: `Grid not found (${what}). Zoom the map in until grid lines show. The game draws them only inside the current region, so keep most of the screen inside it.`,
      found
    }
  }
  // Line positions are in display space; the renderer works in window space.
  // They differ when the OS keeps the window off reserved areas (macOS puts it
  // below the menu bar even when asked for the full display bounds).
  const content = win?.getContentBounds() ?? display.bounds
  return {
    ok: true,
    cellPx: result.period / scale,
    xLine: result.xLine / scale - (content.x - display.bounds.x),
    yLine: result.yLine / scale - (content.y - display.bounds.y)
  }
}
