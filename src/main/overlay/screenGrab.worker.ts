import { createScreenGrabber, type GrabRect } from './screenGrabWin'
import { serveRequests } from './workerRpc'

/**
 * Windows: reads screen rects with GDI for the map watch and grid detection
 * (see screenGrab.ts). Screen reads wait on the compositor and can stall while
 * the game keeps the GPU busy, so they run here rather than on main, which
 * also drives map-drag following.
 */

// Throws (failing the worker) when koffi or GDI can't load; main then falls back.
const grab = createScreenGrabber()

serveRequests<GrabRect[], Uint8Array[]>(grab, (frames) => frames.map((f) => f.buffer as ArrayBuffer))
