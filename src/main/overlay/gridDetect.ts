// Finds the in-game map grid from thin strips along the screen edges. Pure (no
// electron imports) so it can be exercised from a plain Node script on a
// screenshot. All positions are in the captured image's physical pixels.
//
// Grid lines cross the screen edges as short straight segments perpendicular
// to the edge, evenly spaced one cell apart. They're darker than the map,
// faint (~5–13 luma levels) and exactly 2 px thick per logical px (4 px at 2x).
// Per strip: high-pass each row along the edge ("sharpen"), keep features that
// look like such a line across the strip depth as candidates. Then search one
// cell size for all edges together, scoring each edge by how unlikely its
// lattice hits would be by chance — so edges with clean lines carry the ones
// with busy terrain — and step up from harmonics (a lattice at a half or third
// of the cell also contains every real line).
import type { GridEdge } from '@shared/types'

/** A cropped BGRA (or RGBA — luma below is order-agnostic) pixel buffer. */
export interface Strip {
  data: Uint8Array
  width: number
  height: number
}

/** Line candidates (centres along the edge) found in one edge strip. */
export interface EdgeCandidates {
  edge: GridEdge
  length: number
  scale: number
  lines: number[]
}

export interface EdgeFit {
  edge: GridEdge
  /** Line-centre spacing = gap + one line thickness = one grid cell. */
  period: number
  /** Position of one line along the edge (0 ≤ phase < period). */
  phase: number
  /** Lattice positions with a detected line / lattice positions on the edge. */
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
  | { ok: true; period: number; xLine?: number; yLine?: number; fits: EdgeFit[] }
  | { ok: false; fits: EdgeFit[] }

/** Strip depth into the screen, logical px (20 physical px on a 2x display). */
export const STRIP_DEPTH = 10

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
/** An edge counts as showing the grid at p < 10^-2 against chance hits… */
const EDGE_SIGNIFICANCE = 2
const MIN_EDGES = 2
/** …and the edges together at p < 10^-6. */
const MIN_TOTAL_SIGNIFICANCE = 6
/** Or: one edge at p < 10^-5, confirmed on the other axis at p < 0.05. */
const ANCHOR_SIGNIFICANCE = 5
const CONFIRM_SIGNIFICANCE = 1.3
/** Hits in the lattice positions a harmonic adds are "chance" below p = 0.01. */
const HARMONIC_SIGNIFICANCE = 2
const MAX_CANDIDATES = 300

/** Which image axis runs along each edge. */
const ALONG_X: Record<GridEdge, boolean> = { top: true, bottom: true, left: false, right: false }

/** Luma per pixel, reorganised as D rows of length L running along the edge. */
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

/** Centres of dark, grid-line-shaped features. */
function findLines(rows: Float32Array[], k: number, scale: number): number[] {
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
  return kept.map((c) => c.center).sort((a, b) => a - b)
}

/** Line candidates crossing one edge strip. `scale` = physical/logical px. */
export function edgeCandidates(strip: Strip, edge: GridEdge, scale: number): EdgeCandidates {
  const alongX = ALONG_X[edge]
  const length = alongX ? strip.width : strip.height
  const k = Math.max(4, Math.round(6 * scale))
  return { edge, length, scale, lines: findLines(edgeRows(strip, alongX), k, scale) }
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

/** Fit a lattice of roughly `period` to one edge's candidates (free phase). */
function fitEdge(e: EdgeCandidates, period: number): EdgeFit | null {
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

/** Score a fixed lattice (period, phase) against one edge's candidates. */
function scoreLattice(e: EdgeCandidates, p: number, phase: number): EdgeFit | null {
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
    edge: e.edge,
    period: p,
    phase,
    hits,
    expected,
    hitIdx: [...ks],
    chance,
    significance: significance(hits, expected, chance)
  }
}

/** Summed per-edge evidence (negative significances count as zero). */
const totalScore = (fits: EdgeFit[]): number => fits.reduce((s, f) => s + Math.max(0, f.significance), 0)

/**
 * Fits for one axis (top+bottom share x positions, left+right share y) at a
 * period hypothesis. Opposite edges see the same lines, so the second edge is
 * checked at the first one's exact lattice (no free phase, no discount) — a
 * strong consistency test that chance alignments fail.
 */
function axisFits(a: EdgeCandidates | undefined, b: EdgeCandidates | undefined, period: number): EdgeFit[] {
  const fa = a ? fitEdge(a, period) : null
  const fb = b ? fitEdge(b, period) : null
  const options: EdgeFit[][] = []
  if (fa) options.push([fa])
  if (fb) options.push([fb])
  // Both edges fitted on their own only count together if they put the lines
  // in the same place (they must: the lines run straight across the screen).
  if (fa && fb) {
    const d = Math.abs(fa.phase - fb.phase) % fa.period
    if (Math.min(d, fa.period - d) <= 2 * tolFor(a!.scale)) options.push([fa, fb])
  }
  for (const [src, other] of [
    [fa, b],
    [fb, a]
  ] as const) {
    if (!src || !other) continue
    const fixed = scoreLattice(other, src.period, src.phase)
    if (fixed) options.push([src, fixed])
  }
  let best: EdgeFit[] = []
  let bestScore = 0
  for (const o of options) {
    const s = totalScore(o)
    if (s > bestScore) {
      best = o
      bestScore = s
    }
  }
  return best
}

/**
 * A lattice at the cell size / m also contains every real line, and can outscore
 * the true one by picking up chance hits in between. Returns m (2 or 3) when the
 * lattice positions outside the best residue class mod m are hit no more often
 * than chance, i.e. the real period is m times larger; 1 otherwise.
 */
function harmonicFactor(fits: EdgeFit[]): number {
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
      // The coarser lattice must still hold lines on this edge.
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
 * Find one cell size shared by the edges. Every pairwise gap between candidates
 * (and its halves/thirds, for missed lines) is a period hypothesis; the winner
 * maximises the summed significance across edges, then steps up from harmonics.
 */
export function detectGrid(edges: EdgeCandidates[], scale: number): GridDetection {
  const minP = MIN_CELL_LOGICAL * scale
  const maxP = Math.min(...edges.map((e) => e.length)) / 2

  const periods = new Set<number>()
  for (const { lines: c } of edges) {
    for (let i = 0; i < c.length; i++) {
      for (let j = i + 1; j < c.length; j++) {
        for (let n = 1; n <= 3; n++) {
          const p = (c[j] - c[i]) / n
          if (p >= minP && p <= maxP) periods.add(Math.round(p * 2) / 2)
        }
      }
    }
  }

  const on = (name: GridEdge): EdgeCandidates | undefined => edges.find((e) => e.edge === name)
  const fitsAt = (p: number): EdgeFit[] => [...axisFits(on('top'), on('bottom'), p), ...axisFits(on('left'), on('right'), p)]

  let bestScore = 0
  let bestP = 0
  let bestFits: EdgeFit[] = []
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

  let strong = bestFits.filter((f) => f.significance >= EDGE_SIGNIFICANCE)
  if (strong.length < MIN_EDGES || totalScore(strong) < MIN_TOTAL_SIGNIFICANCE) {
    // Big cells leave only 2–3 lines per side edge (and the macOS menu bar can
    // hide the top). Also accept one very strong edge confirmed by an edge on
    // the other axis showing lines at the same cell size.
    const axis = (f: EdgeFit): boolean => ALONG_X[f.edge]
    const bySig = [...bestFits].sort((a, b) => b.significance - a.significance)
    const anchor = bySig[0]
    const confirm = anchor && bySig.find((f) => axis(f) !== axis(anchor) && f.significance >= CONFIRM_SIGNIFICANCE)
    if (!anchor || anchor.significance < ANCHOR_SIGNIFICANCE || !confirm) return { ok: false, fits: strong }
    strong = [anchor, confirm]
  }

  // Weight each edge's refined period by its line count (longer baseline).
  const total = strong.reduce((s, f) => s + f.hits, 0)
  const period = strong.reduce((s, f) => s + f.period * f.hits, 0) / total
  const bestOn = (on: GridEdge[]): EdgeFit | undefined =>
    strong.filter((f) => on.includes(f.edge)).sort((a, b) => b.significance - a.significance)[0]
  return {
    ok: true,
    period,
    xLine: bestOn(['top', 'bottom'])?.phase,
    yLine: bestOn(['left', 'right'])?.phase,
    fits: strong
  }
}
