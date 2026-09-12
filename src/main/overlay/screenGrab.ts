import { screen, type Display, type Rectangle } from 'electron'
import createGrabWorker from './screenGrab.worker?nodeWorker'
import type { GrabRect } from './screenGrabWin'
import { createWorkerClient } from './workerRpc'

/** BGRA pixels, rows top-down (the NativeImage.toBitmap() layout). */
export interface Frame {
  data: Uint8Array
  width: number
  height: number
}

const client =
  process.platform === 'win32'
    ? createWorkerClient<GrabRect[], Uint8Array[]>('screenGrab', () => createGrabWorker({}))
    : null

/**
 * Windows: reads screen rects (physical px) with GDI in a worker
 * (screenGrab.worker.ts) — milliseconds for small rects, where desktopCapturer
 * captures and scales the whole display on every call. Resolves null where GDI
 * isn't available (other platforms, the worker failed, or this read failed),
 * so callers fall back to desktopCapturer.
 */
export async function grabScreen(rects: GrabRect[]): Promise<Frame[] | null> {
  const frames = client ? await client.request(rects) : null
  return frames && frames.map((data, i) => ({ data, width: rects[i].width, height: rects[i].height }))
}

/** No pixel with any colour: GDI can't see what's on screen (some GPU/driver setups). */
export function isBlack(frame: Frame): boolean {
  const d = frame.data
  for (let i = 0; i < d.length; i += 4) if (d[i] || d[i + 1] || d[i + 2]) return false
  return true
}

/** A display's bounds in physical screen px (the coordinates GDI reads in).
 *  Windows only: Electron has no dipToScreenRect on macOS. */
export function physicalBounds(display: Display): Rectangle {
  return screen.dipToScreenRect(null, display.bounds)
}
