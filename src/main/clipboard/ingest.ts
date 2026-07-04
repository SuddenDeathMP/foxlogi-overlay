import { clipboard } from 'electron'
import type { ParsedStockpile, ParsedStockpileItem } from '@shared/types'

// Parses stockpile text the game copies to the clipboard. Mirrors the logic in
// the web app's frontend/src/utils/csv/stockpileCsv.js but is delimiter-tolerant
// (the game exports TSV; users sometimes paste CSV).

// Heuristic source detection by row count, matching the backend's expectations.
// `source` is sent to /api/stockpile/contents/update/ to bypass per-item caps.
function detectSource(lineCount: number): string {
  if (lineCount >= 435) return 'airport_csv'
  if (lineCount > 430) return 'seaport_csv'
  if (lineCount > 400) return 'stockpile_csv'
  if (lineCount > 200) return 'bunker_csv'
  return 'stockpile_csv'
}

function splitRow(line: string): string[] {
  // Prefer tab (game default); fall back to comma. Strip surrounding quotes.
  const cells = (line.includes('\t') ? line.split('\t') : line.split(',')).map((c) =>
    c.trim().replace(/^"(.*)"$/, '$1')
  )
  return cells
}

function parseCoordinates(text: string): { x: number; y: number } | null {
  // "X: 123.45 Y: 67.89" — tolerate comma decimal separators.
  const m = text.replace(/,/g, '.').match(/X:\s*([\d.]+)\s*Y:\s*([\d.]+)/i)
  if (!m) return null
  return { x: parseFloat(m[1]), y: parseFloat(m[2]) }
}

export interface ParseResult {
  ok: boolean
  error?: string
  stockpile?: ParsedStockpile
}

export function parseStockpileText(text: string): ParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0)

  if (lines.length < 2) {
    return { ok: false, error: 'Clipboard does not contain stockpile data.' }
  }

  const header = splitRow(lines[0])
  // Header first cell looks like "Hex - City - Type - Name - X: .. Y: .."
  const headerParts = (header[0] ?? '').split(' - ').map((s) => s.trim())
  const coordinates = parseCoordinates(header[0] ?? '')

  let hex: string | undefined
  let city: string | undefined
  let type: string | undefined
  let name: string | undefined
  if (headerParts.length >= 3) {
    ;[hex, city, type] = headerParts
    const middle = headerParts.slice(3).filter((p) => !/^X:/i.test(p))
    name = middle.join(' - ') || undefined
  }

  const items: ParsedStockpileItem[] = []
  let index = 0
  let looksLikeStockpile = false
  for (let i = 1; i < lines.length; i++) {
    const cells = splitRow(lines[i])
    if (cells.length < 2) continue
    const rawName = cells[0]
    const qty = parseInt(cells[cells.length - 1].replace(/[^\d-]/g, ''), 10)
    if (!rawName || Number.isNaN(qty)) continue
    const isCrate = /\(crate\)/i.test(rawName)
    const cleanName = rawName.replace(/\s*\(crate\)\s*/i, '').trim()
    items.push({ index: index++, name: cleanName, is_crate: isCrate, quantity: qty })
    looksLikeStockpile = true
  }

  if (!looksLikeStockpile || items.length === 0) {
    return { ok: false, error: 'Clipboard does not look like a stockpile export.' }
  }

  return {
    ok: true,
    stockpile: {
      hex,
      city,
      type,
      name,
      coordinates,
      items,
      source: detectSource(lines.length)
    }
  }
}

/** Read and parse whatever stockpile text is currently on the clipboard. */
export function ingestFromClipboard(): ParseResult {
  const text = clipboard.readText()
  if (!text || !text.trim()) {
    return { ok: false, error: 'Clipboard is empty.' }
  }
  return parseStockpileText(text)
}
