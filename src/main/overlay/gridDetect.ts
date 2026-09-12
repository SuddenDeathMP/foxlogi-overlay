// Finds the in-game map grid from thin strips laid across the screen. Pure (no
// electron imports) so it can be exercised from a plain Node script on a
// screenshot. All positions are in the captured image's physical pixels.
//
// Grid lines cross a strip as short straight segments perpendicular to it,
// evenly spaced one cell apart. They're darker than the map, faint (~5–13 luma
// levels) and exactly 2 px thick per logical px (4 px at 2x). The game draws
// them only inside the current region hex, so any one strip may see few or
// none of them (the screen edges often lie outside the region).
// Per strip: high-pass each row along the strip ("sharpen"), keep features
// that look like such a line across the strip depth as candidates. Per axis,
// keep positions that several parallel strips agree on (a grid line is
// straight across the screen; terrain isn't). Then search one cell size for
// both axes together, scoring each by how unlikely its lattice hits would be
// by chance, and step up from harmonics (a lattice at a half or third of the
// cell also contains every real line).

/** A cropped BGRA (or RGBA — luma below is order-agnostic) pixel buffer. */
export interface Strip {
  data: Uint8Array
  width: number
  height: number
}

/** Which way the lines are measured: 'x' = positions along a horizontal strip
 *  (vertical grid lines), 'y' = along a vertical strip (horizontal lines). */
export type Axis = 'x' | 'y'

/** Line candidates (centres along the strip) for one axis. */
export interface AxisCandidates {
  axis: Axis
  length: number
  scale: number
  lines: number[]
}

/** One strip's candidates, plus its mean luma along the strip (keypadClass). */
export interface StripCandidates extends AxisCandidates {
  profile: Float32Array
}

export interface AxisFit {
  axis: Axis
  /** Line-centre spacing = gap + one line thickness = one grid cell. */
  period: number
  /** Position of one line along the axis (0 ≤ phase < period). */
  phase: number
  /** Lattice positions with a detected line / lattice positions on the axis. */
  hits: number
  expected: number
  /** Lattice indices that have a line. */
  hitIdx: number[]
  /** Probability that a lattice position is hit by chance. */
  chance: number
  /** −log10 of the chance probability of this many hits. */
  significance: number
}

export type GridDetection =
  | { ok: true; period: number; xLine: number; yLine: number; fits: AxisFit[] }
  | { ok: false; fits: AxisFit[] }

/** Strip depth, logical px (20 physical px on a 2x display). */
export const STRIP_DEPTH = 10
/** Parallel strips per axis, evenly spaced from one screen edge to the other. */
const H_STRIPS = 12
const V_STRIPS = 16
/** A line position counts when this many strips show it. 3 already loses the
 *  grid when only part of the screen lies inside the current region. */
const MIN_SUPPORT = 2

/** Line contrast range in luma levels: the game's lines are translucent, so
 *  much stronger features (text, icon and panel edges) aren't grid lines. */
const MIN_CONTRAST = 2
const MAX_CONTRAST = 24
/** …and as a fraction of the local background (measured ~3.5–5%). */
const MIN_REL_CONTRAST = 0.02
const MAX_REL_CONTRAST = 0.08
/** Smallest cell worth detecting, logical px. */
const MIN_CELL_LOGICAL = 30
const MIN_HITS = 2
/** An axis counts as showing the grid at p < 10^-2 against chance hits… */
const AXIS_SIGNIFICANCE = 2
/** …and both axes together at p < 10^-6. */
const MIN_TOTAL_SIGNIFICANCE = 6
/** Or: one axis at p < 10^-5, confirmed on the other at p < 0.05. */
const ANCHOR_SIGNIFICANCE = 5
const CONFIRM_SIGNIFICANCE = 1.3
/** Each axis's lattice must recur across its strips at p < 10^-2 (stripSupport).
 *  Measured: real grids 8.8–13; strips shifted out of line, at most 2.7 on one
 *  axis and 1.5 on the other. */
const STRIP_SIGNIFICANCE = 2
/** Keypad lattice (keypadClass): on both axes, one lattice class in three is
 *  this many times darker than the next. Measured: keypad zoom 2.8–3.0 on each
 *  axis; a true cell lattice at keypad zoom at most 1.8; ordinary grids 1.0–1.3. */
const KEYPAD_RATIO = 2.2
/** Hits in the lattice positions a harmonic adds are "chance" below p = 0.01. */
const HARMONIC_SIGNIFICANCE = 2
const MAX_CANDIDATES = 300

/** A strip's rect in the captured frame, physical px. */
export interface StripRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Where to read strips in a W×H frame: H_STRIPS horizontal and V_STRIPS
 * vertical ones, STRIP_DEPTH logical px deep, evenly spaced and including the
 * screen edges. `scale` = physical/logical px.
 */
export function stripLayout(W: number, H: number, scale: number): { h: StripRect[]; v: StripRect[] } {
  const D = Math.min(Math.round(STRIP_DEPTH * scale), W, H)
  const spread = (n: number, span: number): number[] =>
    Array.from({ length: n }, (_, i) => Math.round((i * (span - D)) / (n - 1)))
  return {
    h: spread(H_STRIPS, H).map((y) => ({ x: 0, y, width: W, height: D })),
    v: spread(V_STRIPS, W).map((x) => ({ x, y: 0, width: D, height: H }))
  }
}

/** Luma per pixel, reorganised as D rows of length L running along the strip. */
function edgeRows(s: Strip, alongX: boolean): Float32Array[] {
  const L = alongX ? s.width : s.height
  const D = alongX ? s.height : s.width
  const rows: Float32Array[] = []
  for (let r = 0; r < D; r++) {
    const row = new Float32Array(L)
    for (let i = 0; i < L; i++) {
      const o = ((alongX ? r : i) * s.width + (alongX ? i : r)) * 4
      row[i] = (s.data[o] + 2 * s.data[o + 1] + s.data[o + 2]) / 4
    }
    rows.push(row)
  }
  return rows
}

/** v(i) minus the mean of the two side windows [i-k, i-k/2] and [i+k/2, i+k].
 *  The line itself sits in the gap between the windows, so it isn't averaged in. */
function highPass(row: Float32Array, k: number): Float32Array {
  const n = row.length
  const pre = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + row[i]
  const sum = (a: number, b: number): [number, number] => {
    // Inclusive [a, b], clamped to the row.
    const lo = Math.max(0, a)
    const hi = Math.min(n - 1, b)
    return hi < lo ? [0, 0] : [pre[hi + 1] - pre[lo], hi - lo + 1]
  }
  const inner = Math.ceil(k / 2)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const [s1, c1] = sum(i - k, i - inner)
    const [s2, c2] = sum(i + inner, i + k)
    const c = c1 + c2
    out[i] = c ? row[i] - (s1 + s2) / c : 0
  }
  return out
}

/** Centres of dark, grid-line-shaped features, and the strip's mean luma profile. */
function findLines(rows: Float32Array[], k: number, scale: number): { lines: number[]; profile: Float32Array } {
  const n = rows[0].length
  const D = rows.length
  // Average the rows (noise down, diagonal features smear out wider than a
  // line), then high-pass the profile along the edge: evidence = darkness.
  const profile = new Float32Array(n)
  for (const row of rows) for (let i = 0; i < n; i++) profile[i] += row[i] / D
  const hp = highPass(profile, k)
  const ev = new Float32Array(n)
  for (let i = 0; i < n; i++) ev[i] = -hp[i]
  const passes = rows.map((row) => highPass(row, k))

  // The game draws a translucent dark line: a few-percent darkening straight
  // across the strip. Text, icons and panel edges contrast more or don't run
  // through (nearly) every row; a row or two disturbed by terrain is tolerated.
  const isGridLike = (i: number): boolean => {
    const rel = ev[i] / Math.max(1, profile[i] + ev[i])
    if (rel < MIN_REL_CONTRAST || rel > MAX_REL_CONTRAST) return false
    let present = 0
    for (const p of passes) if (-p[i] >= 0.4 * ev[i]) present++
    return present >= 0.8 * D
  }
  // Grid lines are 2 px per logical px thick; allow ±1 for anti-aliasing.
  const minWidth = Math.max(1, Math.round(2 * scale) - 1)
  const maxWidth = Math.round(2 * scale) + 1

  const out: { center: number; peak: number }[] = []
  for (let i = 0; i < n; ) {
    if (ev[i] <= MIN_CONTRAST) {
      i++
      continue
    }
    let j = i
    let w = 0
    let wx = 0
    let peak = 0
    let peakAt = i
    while (j < n && ev[j] > MIN_CONTRAST) {
      const e = ev[j] - MIN_CONTRAST
      w += e
      wx += e * j
      if (ev[j] > peak) {
        peak = ev[j]
        peakAt = j
      }
      j++
    }
    if (j - i >= minWidth && j - i <= maxWidth && peak <= MAX_CONTRAST && isGridLike(peakAt)) {
      out.push({ center: wx / w, peak })
    }
    i = j
  }
  const kept = out.length > MAX_CANDIDATES ? [...out].sort((a, b) => b.peak - a.peak).slice(0, MAX_CANDIDATES) : out
  return { lines: kept.map((c) => c.center).sort((a, b) => a - b), profile }
}

/** Line candidates crossing one strip: horizontal for 'x', vertical for 'y'.
 *  `scale` = physical/logical px. */
export function stripCandidates(strip: Strip, axis: Axis, scale: number): StripCandidates {
  const alongX = axis === 'x'
  const length = alongX ? strip.width : strip.height
  const k = Math.max(4, Math.round(6 * scale))
  return { axis, length, scale, ...findLines(edgeRows(strip, alongX), k, scale) }
}

/**
 * One axis's lines from its parallel strips: positions (within the lattice
 * tolerance) that at least MIN_SUPPORT different strips show, at their mean. A
 * grid line runs straight across the screen, so it recurs from strip to strip
 * wherever the region's grid is drawn; terrain and text don't.
 */
export function consensusLines(strips: AxisCandidates[]): AxisCandidates {
  const { axis, length, scale } = strips[0]
  const all = strips.flatMap((s, i) => s.lines.map((c) => ({ c, strip: i }))).sort((a, b) => a.c - b.c)
  const tol = tolFor(scale)
  const lines: number[] = []
  for (let i = 0; i < all.length; ) {
    let j = i
    let sum = 0
    const seenIn = new Set<number>()
    while (j < all.length && all[j].c - all[i].c <= 2 * tol) {
      seenIn.add(all[j].strip)
      sum += all[j].c
      j++
    }
    if (seenIn.size >= MIN_SUPPORT) lines.push(sum / (j - i))
    i = j
  }
  return { axis, length, scale, lines }
}

// ---- lattice scoring -------------------------------------------------------

const LN_FACT: number[] = [0]
function lnFact(n: number): number {
  for (let i = LN_FACT.length; i <= n; i++) LN_FACT[i] = LN_FACT[i - 1] + Math.log(i)
  return LN_FACT[n]
}

/** −log10 P(X ≥ h) for X ~ Binomial(n, p): how surprising h chance hits are. */
function significance(h: number, n: number, p: number): number {
  if (h <= 0) return 0
  if (p <= 0) return 30
  if (p >= 1) return 0
  let sum = 0
  for (let k = h; k <= n; k++) {
    sum += Math.exp(lnFact(n) - lnFact(k) - lnFact(n - k) + k * Math.log(p) + (n - k) * Math.log1p(-p))
  }
  return sum > 0 ? Math.min(30, -Math.log10(sum)) : 30
}

/** How far (px) a line centre may sit from its lattice position: the game
 *  snaps lines to whole pixels, so spacing varies by ±1–2 px along an edge. */
const tolFor = (scale: number): number => 1.5 * Math.max(1, scale)

/** Phase (mod p) where the most centres line up: densest circular window of residues. */
function bestPhase(centers: number[], p: number, tol: number): number {
  const r = centers.map((c) => ((c % p) + p) % p).sort((a, b) => a - b)
  const n = r.length
  const at = (j: number): number => r[j % n] + (j >= n ? p : 0)
  let bestCount = 0
  let best = r[0]
  for (let i = 0, j = 0; i < n; i++) {
    if (j < i) j = i
    while (j < i + n && at(j) - r[i] <= 2 * tol) j++
    if (j - i > bestCount) {
      bestCount = j - i
      let s = 0
      for (let k = i; k < j; k++) s += at(k)
      best = s / (j - i)
    }
  }
  return best % p
}

/** Fit a lattice of roughly `period` to one axis's lines (free phase). */
function fitAxis(e: AxisCandidates, period: number): AxisFit | null {
  const centers = e.lines
  if (centers.length < MIN_HITS) return null
  const tol0 = tolFor(e.scale)
  let p = period
  let a = bestPhase(centers, p, tol0 * 1.5)
  // Count with the hypothesis, refit (least squares c = a + k·p) on its
  // inliers, recount — the hypothesis period is only accurate to ~0.5 px.
  for (let pass = 0; pass < 3; pass++) {
    const tol = tol0 * (pass === 0 ? 1.5 : 1)
    const inl = centers.filter((c) => Math.abs(c - a - Math.round((c - a) / p) * p) <= tol)
    if (inl.length < 2) return null
    const ks = inl.map((c) => Math.round((c - a) / p))
    const n = inl.length
    const mk = ks.reduce((s, k) => s + k, 0) / n
    const mc = inl.reduce((s, c) => s + c, 0) / n
    let sxx = 0
    let sxy = 0
    for (let i = 0; i < n; i++) {
      sxx += (ks[i] - mk) ** 2
      sxy += (ks[i] - mk) * (inl[i] - mc)
    }
    if (sxx > 0 && Math.abs(sxy / sxx - period) < 0.05 * period) {
      p = sxy / sxx
      a = mc - p * mk
    }
  }
  const fit = scoreLattice(e, p, ((a % p) + p) % p)
  if (!fit) return null
  // The phase was searched freely: discount the ~p/2·tol phases tried.
  fit.significance -= Math.log10(p / (2 * tol0))
  return fit
}

/** Score a fixed lattice (period, phase) against one axis's lines. */
function scoreLattice(e: AxisCandidates, p: number, phase: number): AxisFit | null {
  const tol = tolFor(e.scale)
  const expected = Math.floor((e.length - 1 - phase) / p) + 1
  const ks = new Set<number>()
  for (const c of e.lines) {
    const k = Math.round((c - phase) / p)
    if (k >= 0 && k < expected && Math.abs(c - phase - k * p) <= tol) ks.add(k)
  }
  const hits = ks.size
  if (hits < MIN_HITS) return null
  // Chance of a random candidate landing within ±tol of a lattice position.
  const chance = Math.min(0.95, (e.lines.length / e.length) * 2 * tol)
  return {
    axis: e.axis,
    period: p,
    phase,
    hits,
    expected,
    hitIdx: [...ks],
    chance,
    significance: significance(hits, expected, chance)
  }
}

/** Summed per-axis evidence (negative significances count as zero). */
const totalScore = (fits: AxisFit[]): number => fits.reduce((s, f) => s + Math.max(0, f.significance), 0)

/**
 * A lattice at the cell size / m also contains every real line, and can outscore
 * the true one by picking up chance hits in between. Returns m (2 or 3) when the
 * lattice positions outside the best residue class mod m are hit no more often
 * than chance, i.e. the real period is m times larger; 1 otherwise.
 */
function harmonicFactor(fits: AxisFit[]): number {
  for (const m of [2, 3]) {
    let otherHits = 0
    let otherPositions = 0
    let chanceSum = 0
    let valid = fits.length > 0
    for (const f of fits) {
      const hits = new Array<number>(m).fill(0)
      const positions = new Array<number>(m).fill(0)
      for (let k = 0; k < f.expected; k++) positions[k % m]++
      for (const k of f.hitIdx) hits[k % m]++
      let keep = 0
      for (let c = 1; c < m; c++) if (hits[c] > hits[keep]) keep = c
      // The coarser lattice must still hold lines on this axis.
      if (hits[keep] < 2) valid = false
      for (let c = 0; c < m; c++) {
        if (c === keep) continue
        otherHits += hits[c]
        otherPositions += positions[c]
        chanceSum += f.chance * positions[c]
      }
    }
    if (!valid || otherPositions === 0) continue
    if (significance(otherHits, otherPositions, chanceSum / otherPositions) < HARMONIC_SIGNIFICANCE) return m
  }
  return 1
}

/**
 * Find one cell size shared by both axes. Every pairwise gap between lines
 * (and its halves/thirds, for missed lines) is a period hypothesis; the winner
 * maximises the summed significance of the two axes, then steps up from
 * harmonics. Success always has both axes, so both line positions.
 */
export function detectGrid(x: AxisCandidates, y: AxisCandidates, scale: number): GridDetection {
  const axes = [x, y]
  const minP = MIN_CELL_LOGICAL * scale
  const maxP = Math.min(x.length, y.length) / 2

  const periods = new Set<number>()
  for (const { lines: c } of axes) {
    for (let i = 0; i < c.length; i++) {
      for (let j = i + 1; j < c.length; j++) {
        for (let n = 1; n <= 3; n++) {
          const p = (c[j] - c[i]) / n
          if (p >= minP && p <= maxP) periods.add(Math.round(p * 2) / 2)
        }
      }
    }
  }

  const fitsAt = (p: number): AxisFit[] => axes.map((a) => fitAxis(a, p)).filter((f): f is AxisFit => f != null)

  let bestScore = 0
  let bestP = 0
  let bestFits: AxisFit[] = []
  for (const p of periods) {
    const fits = fitsAt(p)
    const score = totalScore(fits)
    if (score > bestScore) {
      bestScore = score
      bestP = p
      bestFits = fits
    }
  }

  // Step up from harmonics (possibly twice, e.g. a sixth → half → whole).
  for (let i = 0; i < 3 && bestFits.length; i++) {
    const m = harmonicFactor(bestFits)
    if (m === 1 || bestP * m > maxP) break
    bestP *= m
    bestFits = fitsAt(bestP)
  }

  const fx = bestFits.find((f) => f.axis === 'x')
  const fy = bestFits.find((f) => f.axis === 'y')
  const strong = bestFits.filter((f) => f.significance >= AXIS_SIGNIFICANCE)
  // Both axes clearly show the grid. Or, since big cells leave only 2–3 lines
  // on the short axis: one very strong axis, confirmed by the other showing
  // lines at the same cell size.
  const both = fx && fy && fx.significance >= AXIS_SIGNIFICANCE && fy.significance >= AXIS_SIGNIFICANCE
  const [hi, lo] = fx && fy ? [fx, fy].sort((a, b) => b.significance - a.significance) : []
  const anchored = hi && lo && hi.significance >= ANCHOR_SIGNIFICANCE && lo.significance >= CONFIRM_SIGNIFICANCE
  if (!fx || !fy || !((both && totalScore(strong) >= MIN_TOTAL_SIGNIFICANCE) || anchored)) {
    return { ok: false, fits: strong }
  }

  // Weight each axis's refined period by its line count (longer baseline).
  const period = (fx.period * fx.hits + fy.period * fy.hits) / (fx.hits + fy.hits)
  return { ok: true, period, xLine: fx.phase, yLine: fy.phase, fits: [fx, fy] }
}

/**
 * How unlikely it is that this many strips have a line on the fitted lattice
 * by chance, as −log10 p. Each strip's chance is set by its own candidate
 * count. A real grid recurs in most strips it crosses. Strips with periodic
 * lines that merely happen to line up in two of them (which consensus alone
 * would accept) don't.
 */
function stripSupport(strips: AxisCandidates[], fit: AxisFit): number {
  const tol = tolFor(strips[0].scale)
  let hit = 0
  let chance = 0
  for (const s of strips) {
    const onLattice = s.lines.some((c) => {
      const d = (((c - fit.phase) % fit.period) + fit.period) % fit.period
      return Math.min(d, fit.period - d) <= tol
    })
    if (onLattice) hit++
    chance += 1 - Math.pow(1 - Math.min(1, (2 * tol) / fit.period), s.lines.length)
  }
  return significance(hit, strips.length, chance / strips.length)
}

/** How much darker the line at `c` is than its surroundings on a strip's luma
 *  profile: the flanks (2.5–6 line widths out) minus the darkest core pixel,
 *  clamped to [0, MAX_CONTRAST]. Null too close to the strip's ends. */
function lineDip(profile: Float32Array, c: number, scale: number): number | null {
  const core = Math.max(1, Math.round(scale))
  const f0 = Math.round(2.5 * scale)
  const f1 = Math.round(6 * scale)
  const at = Math.round(c)
  if (at - f1 < 0 || at + f1 >= profile.length) return null
  let min = Infinity
  for (let i = at - core; i <= at + core; i++) min = Math.min(min, profile[i])
  let sum = 0
  for (let o = f0; o <= f1; o++) sum += profile[at - o] + profile[at + o]
  return Math.min(MAX_CONTRAST, Math.max(0, sum / (2 * (f1 - f0 + 1)) - min))
}

/**
 * Zoomed far in, the game also draws the 3×3 keypad lines inside each cell.
 * They pass the line filter, so the lattice can fit the keypad: a third of the
 * cell, with every real line still on it. They're much fainter, though (~0–3
 * luma levels against ~6–12): measured straight from the pixels at each
 * lattice position, averaged over all strips, one class in three is then far
 * darker. Returns that class (0–2) and how many times darker than the next it
 * is. Counting detected lines instead doesn't work: with big cells there are
 * only 4–6 lines per axis, so one class can hold twice the lines by chance.
 */
function keypadClass(strips: StripCandidates[], fit: AxisFit): { cls: number; ratio: number } {
  const { scale, length } = strips[0]
  const sum = [0, 0, 0]
  const count = [0, 0, 0]
  for (let k = 0; fit.phase + k * fit.period < length; k++) {
    const dips = strips
      .map((s) => lineDip(s.profile, fit.phase + k * fit.period, scale))
      .filter((d): d is number => d != null)
    if (!dips.length) continue
    sum[k % 3] += dips.reduce((a, b) => a + b, 0) / dips.length
    count[k % 3]++
  }
  const mean = sum.map((s, i) => (count[i] ? s / count[i] : 0))
  const cls = mean.indexOf(Math.max(...mean))
  const next = Math.max(...mean.filter((_, i) => i !== cls))
  return { cls, ratio: mean[cls] / Math.max(next, 0.05) }
}

/** The grid in one frame's strips (see stripLayout): `h` horizontal, `v` vertical. */
export function detectGridInStrips(h: Strip[], v: Strip[], scale: number): GridDetection {
  const hc = h.map((s) => stripCandidates(s, 'x', scale))
  const vc = v.map((s) => stripCandidates(s, 'y', scale))
  const result = detectGrid(consensusLines(hc), consensusLines(vc), scale)
  if (!result.ok) return result
  const [fx, fy] = result.fits
  const weak = [
    stripSupport(hc, fx) < STRIP_SIGNIFICANCE ? fx : null,
    stripSupport(vc, fy) < STRIP_SIGNIFICANCE ? fy : null
  ]
  if (weak.some(Boolean)) return { ok: false, fits: result.fits.filter((f) => !weak.includes(f)) }

  // Keypad lines run both ways, so both axes must show the pattern. Each axis's
  // real lines are its own darkest class.
  const kx = keypadClass(hc, fx)
  const ky = keypadClass(vc, fy)
  if (kx.ratio < KEYPAD_RATIO || ky.ratio < KEYPAD_RATIO) return result
  return {
    ...result,
    period: result.period * 3,
    xLine: fx.phase + kx.cls * fx.period,
    yLine: fy.phase + ky.cls * fy.period
  }
}
