// Detects whether the in-game map is open from the magnifier (search) icon the
// map screen shows in the top-right corner. Pure (no electron imports) so it can
// be run from a Node script on a saved screenshot.

/** Screen height the template and search window are defined at. The game's UI
 *  scales with screen height, so frames are resampled to this height first. */
export const REF_HEIGHT = 1080

/** BGRA pixels, rows top-down (NativeImage.toBitmap() layout). */
export interface Frame {
  data: Uint8Array
  width: number
  height: number
}

/** Search window at REF_HEIGHT, anchored at the screen's top-right corner. The
 *  icon's centre sits ~36 px from the right edge and ~38 px from the top. */
export const MAP_ICON_REGION = { w: 150, h: 90 }

/** Template sizes tried, to tolerate the game's UI-scale setting. */
const SCALES = [0.85, 1, 1.15]

/** Normalized cross-correlation at or above this counts as the icon. Measured
 *  on real captures: map screens 0.89–1.0, anything else ≤ 0.68. */
export const MAP_ICON_THRESHOLD = 0.8

// The magnifier at REF_HEIGHT (luma, 19×19), taken from a 2160p capture and
// downsampled 2×. Tight at the top: on macOS the menu bar can end just above it.
const T = 19
// prettier-ignore
const TEMPLATE = Uint8Array.from([
   84,  84,  84,  84,  84,  84,  84,  84,  84,  84,  84,  84,  84,  84,  84,  84,  84,  84,  84,
   84,  84,  84,  84,  86, 161, 255, 255, 255, 222,  94,  84,  84,  84,  84,  84,  84,  84,  84,
   84,  84,  84, 133, 234, 254, 233, 153, 193, 255, 255, 193,  84,  84,  84,  84,  84,  84,  84,
   84,  84, 110, 255, 221,  89,  86,  93,  86,  86, 174, 255, 214,  88,  85,  84,  84,  84,  84,
   84,  84, 249, 255,  89,  85, 222, 202, 212, 178,  85, 158, 252, 114,  84,  85,  84,  84,  84,
   84, 147, 254, 114,  97, 190, 209, 155, 183, 226, 154,  88, 254, 212,  84,  84,  84,  84,  84,
   84, 169, 246, 100, 116, 163, 215, 150, 203, 220, 243,  86, 212, 254,  84,  84,  84,  84,  84,
   84, 169, 237,  89, 132, 163, 205, 152, 210, 220, 244,  99, 148, 254,  84,  84,  84,  84,  84,
   84, 169, 249, 102, 118, 169, 207, 154, 220, 215, 245,  84, 232, 255,  84,  84,  84,  84,  84,
   84, 129, 254, 133,  87, 216, 190, 164, 207, 238, 107, 104, 255, 165,  85,  84,  84,  84,  84,
   84,  84, 211, 255, 127,  84, 139, 158, 156, 118,  84, 201, 244, 102,  84,  84,  84,  84,  84,
   84,  84,  91, 239, 254, 127,  91,  88,  90,  98, 239, 250, 174,  88,  84,  84,  84,  84,  84,
   84,  84,  84, 104, 180, 254, 250, 218, 237, 254, 254, 122,  88, 220, 193,  84,  84,  84,  84,
   84,  84,  84,  84,  84, 106, 174, 184, 182, 144,  84,  84, 231, 255, 255, 214,  96,  84,  84,
   84,  85,  84,  84,  84,  84,  84,  84,  84,  84,  84,  84,  89, 230, 255, 255, 239,  85,  84,
   84,  84,  84,  84,  84,  84,  84,  84,  84,  85,  84,  84,  84, 100, 245, 255, 253, 190,  84,
   84,  84,  84,  84,  84,  84,  84,  84,  84,  84,  84,  84,  84,  84, 114, 252, 184,  84,  84,
   84,  84,  84,  84,  84,  84,  84,  84,  84,  84,  84,  84,  84,  84,  84, 128,  91,  84,  84,
   84,  84,  84,  84,  84,  84,  84,  84,  84,  84,  84,  84,  84,  84,  84,  84,  84,  84,  84
])

interface ScaledTemplate {
  size: number
  /** Zero-mean template values. */
  values: Float32Array
  /** Σ values². */
  energy: number
}

/** Bilinear resize of the template, made zero-mean for the correlation. */
function scaleTemplate(k: number): ScaledTemplate {
  const size = Math.max(5, Math.round(T * k))
  const values = new Float32Array(size * size)
  const f = (T - 1) / (size - 1)
  let sum = 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = x * f
      const sy = y * f
      const x0 = Math.floor(sx)
      const y0 = Math.floor(sy)
      const x1 = Math.min(T - 1, x0 + 1)
      const y1 = Math.min(T - 1, y0 + 1)
      const ax = sx - x0
      const ay = sy - y0
      const top = TEMPLATE[y0 * T + x0] * (1 - ax) + TEMPLATE[y0 * T + x1] * ax
      const bottom = TEMPLATE[y1 * T + x0] * (1 - ax) + TEMPLATE[y1 * T + x1] * ax
      const v = top * (1 - ay) + bottom * ay
      values[y * size + x] = v
      sum += v
    }
  }
  const mean = sum / values.length
  let energy = 0
  for (let i = 0; i < values.length; i++) {
    values[i] -= mean
    energy += values[i] * values[i]
  }
  return { size, values, energy }
}

let templates: ScaledTemplate[] | null = null

/** Luma of the search window (top-right corner), box-resampled by 1/s to REF_HEIGHT. */
function searchWindow(frame: Frame, s: number): { luma: Float32Array; w: number; h: number } {
  const w = Math.min(MAP_ICON_REGION.w, Math.floor(frame.width / s))
  const h = Math.min(MAP_ICON_REGION.h, Math.floor(frame.height / s))
  const x0 = frame.width - w * s
  const luma = new Float32Array(w * h)
  for (let v = 0; v < h; v++) {
    const ya = Math.floor(v * s)
    const yb = Math.max(ya + 1, Math.min(frame.height, Math.floor((v + 1) * s)))
    for (let u = 0; u < w; u++) {
      const xa = Math.floor(x0 + u * s)
      const xb = Math.max(xa + 1, Math.min(frame.width, Math.floor(x0 + (u + 1) * s)))
      let sum = 0
      for (let y = ya; y < yb; y++) {
        let i = (y * frame.width + xa) * 4
        for (let x = xa; x < xb; x++, i += 4) {
          sum += (frame.data[i] + 2 * frame.data[i + 1] + frame.data[i + 2]) / 4
        }
      }
      luma[v * w + u] = sum / ((yb - ya) * (xb - xa))
    }
  }
  return { luma, w, h }
}

/**
 * Best normalized cross-correlation of the map's search icon within the frame's
 * top-right corner, in [-1, 1]. Compare against MAP_ICON_THRESHOLD.
 *
 * `frame` is a whole screen, or just its top-right corner; `scale` is frame px
 * per REF_HEIGHT px (for a whole screen: its height / REF_HEIGHT).
 */
export function mapIconScore(frame: Frame, scale = frame.height / REF_HEIGHT): number {
  templates ??= SCALES.map(scaleTemplate)
  const { luma, w, h } = searchWindow(frame, scale)

  // Integral images of luma and luma² for per-window mean/variance.
  const iw = w + 1
  const sum = new Float64Array(iw * (h + 1))
  const sq = new Float64Array(iw * (h + 1))
  for (let y = 0; y < h; y++) {
    let rs = 0
    let rq = 0
    for (let x = 0; x < w; x++) {
      const v = luma[y * w + x]
      rs += v
      rq += v * v
      sum[(y + 1) * iw + x + 1] = sum[y * iw + x + 1] + rs
      sq[(y + 1) * iw + x + 1] = sq[y * iw + x + 1] + rq
    }
  }

  let best = -1
  for (const t of templates) {
    const n = t.size * t.size
    for (let y = 0; y + t.size <= h; y++) {
      for (let x = 0; x + t.size <= w; x++) {
        const a = y * iw + x
        const b = y * iw + x + t.size
        const c = (y + t.size) * iw + x
        const d = (y + t.size) * iw + x + t.size
        const s1 = sum[d] - sum[b] - sum[c] + sum[a]
        const s2 = sq[d] - sq[b] - sq[c] + sq[a]
        const variance = s2 - (s1 * s1) / n
        // Flat patches (sky, menus) can't hold the icon's contrast.
        if (variance < n * 100) continue
        let cross = 0
        for (let ty = 0; ty < t.size; ty++) {
          const row = (y + ty) * w + x
          const trow = ty * t.size
          for (let tx = 0; tx < t.size; tx++) cross += t.values[trow + tx] * luma[row + tx]
        }
        const ncc = cross / Math.sqrt(variance * t.energy)
        if (ncc > best) best = ncc
      }
    }
  }
  return best
}
