// Overlay safe zones expressed as fractions of the target display's logical
// width/height. Reference layout is 1920x1080 (see data/game_screen.png in the
// backend repo). The center is intentionally left clear for the game's
// inventory/stockpile UI.

export interface ZoneRect {
  /** left, as a fraction of display width (0..1) */
  x: number
  /** top, as a fraction of display height (0..1) */
  y: number
  /** width, as a fraction of display width (0..1) */
  w: number
  /** height, as a fraction of display height (0..1) */
  h: number
}

export type ZoneName = 'top' | 'left' | 'bottom'

export const ZONE_FRACTIONS: Record<ZoneName, ZoneRect> = {
  top: { x: 0.09, y: 0, w: 0.19, h: 0.06 },
  left: { x: 0.0, y: 0.11, w: 0.16, h: 0.58 },
  bottom: { x: 0.18, y: 0.61, w: 0.52, h: 0.39 }
}

export interface PixelRect {
  x: number
  y: number
  w: number
  h: number
}

export interface ResolvedZones {
  /** logical pixel size of the display the overlay covers */
  display: { width: number; height: number }
  zones: Record<ZoneName, PixelRect>
}

// Keep controls legible at 4K and usable at 720p.
const MIN_LEFT_PANEL_PX = 240
const MAX_LEFT_PANEL_PX = 460
const MIN_BAND_PX = 40

/** Convert zone fractions to logical pixels for a given display size. */
export function resolveZones(width: number, height: number): ResolvedZones {
  const px = (rect: ZoneRect): PixelRect => ({
    x: Math.round(rect.x * width),
    y: Math.round(rect.y * height),
    w: Math.round(rect.w * width),
    h: Math.round(rect.h * height)
  })

  const top = px(ZONE_FRACTIONS.top)
  top.h = Math.max(MIN_BAND_PX, top.h)

  const left = px(ZONE_FRACTIONS.left)
  left.w = Math.min(MAX_LEFT_PANEL_PX, Math.max(MIN_LEFT_PANEL_PX, left.w))

  const bottom = px(ZONE_FRACTIONS.bottom)
  bottom.h = Math.max(MIN_BAND_PX, bottom.h)
  bottom.y = height - bottom.h

  return { display: { width, height }, zones: { top, left, bottom } }
}
