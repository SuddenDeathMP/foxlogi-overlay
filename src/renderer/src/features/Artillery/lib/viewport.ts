// Screen <-> world transform for the map layer. A trimmed port of fox-fall's
// Viewport (packages/frontend-libs/src/viewport/viewport.ts) without rotation.
import type { Vec } from './vector'

/** Foxhole map grid cell (the lettered/numbered squares) in meters. */
export const CELL = 125
/** Keypad sub-cell (3×3 per cell). */
export const SUBCELL = CELL / 3
/** Region hex height in meters, flat top edge to flat bottom edge
 *  (fox-fall packages/data/src/artillery/map.ts: HEX_SIZE, 2197 m wide × 0.866). */
export const HEX_HEIGHT = 2197 * 0.866

export interface Viewport {
  /** Screen position (logical px) of the world origin. */
  x: number
  y: number
  /** Pixels per meter. */
  zoom: number
}

/** fox-fall's default: 250 m spans the shorter screen side, origin centred. */
export function defaultViewport(width: number, height: number): Viewport {
  return { x: width / 2, y: height / 2, zoom: Math.min(width, height) / 250 }
}

export function toScreen(vp: Viewport, p: Vec): Vec {
  return { x: vp.x + p.x * vp.zoom, y: vp.y + p.y * vp.zoom }
}

export function toWorld(vp: Viewport, s: Vec): Vec {
  return { x: (s.x - vp.x) / vp.zoom, y: (s.y - vp.y) / vp.zoom }
}

/** Change zoom while keeping the world point under `pin` (screen px) fixed. */
export function zoomAt(vp: Viewport, zoom: number, pin: Vec): Viewport {
  const next = Math.max(0.001, zoom)
  const w = toWorld(vp, pin)
  return { x: pin.x - w.x * next, y: pin.y - w.y * next, zoom: next }
}

export function panByPx(vp: Viewport, dx: number, dy: number): Viewport {
  return { ...vp, x: vp.x + dx, y: vp.y + dy }
}

/**
 * Calibrate from an auto-detected grid: `cellPx` screen px per 125 m cell, and
 * optionally the screen position of one vertical (`x`) / horizontal (`y`) grid
 * line. Zooms about `pin`, then shifts the origin by the smallest amount that
 * puts world multiples of 125 m on those lines. Units keep world coordinates.
 */
export function calibrateFromGrid(vp: Viewport, cellPx: number, lines: { x?: number; y?: number }, pin: Vec): Viewport {
  const zoomed = zoomAt(vp, cellPx / CELL, pin)
  // Offset in (−cell/2, cell/2] that makes `origin + offset ≡ line (mod cell)`.
  const shift = (line: number | undefined, origin: number): number => {
    if (line == null) return 0
    const d = (((line - origin) % cellPx) + cellPx) % cellPx
    return d > cellPx / 2 ? d - cellPx : d
  }
  return panByPx(zoomed, shift(lines.x, zoomed.x), shift(lines.y, zoomed.y))
}

/**
 * Calibrate from a rectangle dragged corner-to-corner over one in-game grid
 * cell (fox-fall lib/grid-calibration.ts). Width+height of the drag = 250 m sets
 * the scale; then the drag's centre is snapped onto the nearest cell centre so
 * our grid lines land on the game's. Returns null if the drag is too small.
 */
export function calibrateFromRect(vp: Viewport, a: Vec, b: Vec): Viewport | null {
  const dx = Math.abs(b.x - a.x)
  const dy = Math.abs(b.y - a.y)
  if (Math.hypot(dx, dy) <= 10) return null

  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const zoomed = zoomAt(vp, (dx + dy) / (2 * CELL), mid)

  const m = toWorld(zoomed, mid)
  const snap = (v: number): number => Math.round((v - CELL / 2) / CELL) * CELL + CELL / 2 - v
  return panByPx(zoomed, -snap(m.x) * zoomed.zoom, -snap(m.y) * zoomed.zoom)
}

/** Shortest vertical drag accepted for hex-height calibration, px. */
export const MIN_HEX_DRAG_PX = 60

/**
 * Calibrate the scale from a drag between a region hex's flat top and bottom
 * edges — for map zoom levels where the game doesn't draw its grid. The edges
 * are horizontal, so only the vertical span counts (HEX_HEIGHT meters). Zooms
 * about the drag's midpoint; grid alignment can't be derived from the hex, so
 * the origin is otherwise left alone. Returns null if the drag is too short.
 */
export function calibrateFromHexHeight(vp: Viewport, a: Vec, b: Vec): Viewport | null {
  const dy = Math.abs(b.y - a.y)
  if (dy < MIN_HEX_DRAG_PX) return null
  return zoomAt(vp, dy / HEX_HEIGHT, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
}
