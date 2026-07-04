import { screen, type Display } from 'electron'
import { resolveZones, type ResolvedZones } from '@shared/zones'
import { getSettings } from '../settings'

/** The display the overlay should cover: the configured one, else primary. */
export function targetDisplay(): Display {
  const { displayId } = getSettings()
  if (displayId != null) {
    const match = screen.getAllDisplays().find((d) => d.id === displayId)
    if (match) return match
  }
  return screen.getPrimaryDisplay()
}

/** Compute the safe-zone pixel rects for the current target display. */
export function currentZones(): ResolvedZones {
  const d = targetDisplay()
  // Work in logical pixels (DIPs) — Electron windows are sized in DIPs, so this
  // scales correctly across HiDPI displays.
  return resolveZones(d.workArea.width, d.workArea.height)
}

export function listDisplays(): Array<{ id: number; label: string; primary: boolean }> {
  const primaryId = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: `Display ${i + 1} — ${d.size.width}×${d.size.height}${d.id === primaryId ? ' (primary)' : ''}`,
    primary: d.id === primaryId
  }))
}
