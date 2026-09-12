import { app, desktopCapturer, systemPreferences, type NativeImage } from 'electron'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import type { GridDetectResult, GridEdge } from '@shared/types'
import { targetDisplay } from './zones'
import { getOverlay } from './window'
import { STRIP_DEPTH, detectGrid, edgeCandidates, type Strip } from './gridDetect'

/** Margin for the window server to apply content protection (immediate on macOS). */
const EXCLUDE_SETTLE_MS = 30

const PERMISSION_HINT =
  'Screen capture is blocked. Allow Screen Recording for the overlay in System Settings → Privacy & Security, then restart it.'

/**
 * Dev aid: save the exact frame the detector saw, for tuning on real captures.
 * Written as an uncompressed 32-bit BMP (the bitmap is already BGRA) after the
 * current detection returns — PNG-encoding a 4K frame blocks main for ~1.4 s.
 */
function dumpFrame(img: NativeImage): void {
  setImmediate(() => {
    const { width, height } = img.getSize()
    const pixels = img.toBitmap()
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

function strip(img: NativeImage, x: number, y: number, width: number, height: number): Strip {
  const data = img.crop({ x, y, width, height }).toBitmap()
  return { data, width, height }
}

/**
 * Capture the overlay's display and detect the map grid from thin strips
 * (STRIP_DEPTH logical px) along each edge. Our own window is kept out of the
 * frame (see below). Only numbers leave the main process, never pixels.
 */
export async function detectGridOnScreen(): Promise<GridDetectResult> {
  if (process.platform === 'darwin') {
    const access = systemPreferences.getMediaAccessStatus('screen')
    // 'not-determined' falls through: the first capture triggers the OS prompt.
    if (access === 'denied' || access === 'restricted') {
      return { ok: false, reason: 'permission', error: PERMISSION_HINT, edges: [] }
    }
  }

  const display = targetDisplay()
  const { width, height } = display.bounds
  const win = getOverlay()
  let img: NativeImage | undefined
  // Keep our own drawings out of the frame. On macOS/Windows content protection
  // excludes the window from screen capture while it stays visible on screen
  // (no blink). Linux has no such flag; there the renderer fades the overlay
  // out before calling this.
  const exclude = win != null && process.platform !== 'linux'
  if (exclude) win.setContentProtection(true)
  try {
    if (exclude) await new Promise((r) => setTimeout(r, EXCLUDE_SETTLE_MS))
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
    return { ok: false, reason: 'capture', error: `Screen capture failed: ${(err as Error).message}`, edges: [] }
  } finally {
    if (exclude) win.setContentProtection(false)
  }
  if (!img || img.isEmpty()) {
    const error = process.platform === 'darwin' ? PERMISSION_HINT : 'Screen capture returned no image.'
    return { ok: false, reason: 'capture', error, edges: [] }
  }
  if (!app.isPackaged) dumpFrame(img)

  const size = img.getSize()
  // Physical px per logical px, from the frame we actually got.
  const scale = size.width / width
  // Read the display's own edges: the game fills the screen, and inside the
  // overlay window's area the top strip would cut through the map's legend
  // panels. When the macOS menu bar or Dock covers an edge, their icons don't
  // pass the grid-line filter, so that edge just contributes nothing.
  const W = size.width
  const H = size.height
  const D = Math.min(Math.round(STRIP_DEPTH * scale), W, H)
  const result = detectGrid(
    [
      edgeCandidates(strip(img, 0, 0, W, D), 'top', scale),
      edgeCandidates(strip(img, 0, H - D, W, D), 'bottom', scale),
      edgeCandidates(strip(img, 0, 0, D, H), 'left', scale),
      edgeCandidates(strip(img, W - D, 0, D, H), 'right', scale)
    ],
    scale
  )
  const edges: GridEdge[] = result.fits.map((f) => f.edge)

  if (!result.ok) {
    const found = edges.length ? `only on the ${edges.join(', ')} edge` : 'on no screen edge'
    return {
      ok: false,
      reason: 'not-found',
      error: `Grid not found (lines ${found}; need 2). Zoom the map in until grid lines show and let the map reach the screen edges.`,
      edges
    }
  }
  // Line positions are in display space; the renderer works in window space.
  // They differ when the OS keeps the window off reserved areas (macOS puts it
  // below the menu bar even when asked for the full display bounds).
  const content = win?.getContentBounds() ?? display.bounds
  const offsetX = content.x - display.bounds.x
  const offsetY = content.y - display.bounds.y
  return {
    ok: true,
    cellPx: result.period / scale,
    xLine: result.xLine != null ? result.xLine / scale - offsetX : undefined,
    yLine: result.yLine != null ? result.yLine / scale - offsetY : undefined,
    edges
  }
}
