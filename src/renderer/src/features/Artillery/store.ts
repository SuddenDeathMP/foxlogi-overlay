import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_PLATFORM } from './lib/platforms'
import { wrapDegrees, type Vec } from './lib/vector'
import type { Viewport } from './lib/viewport'
import type { Wind } from './lib/solution'

/** off: feature hidden · edit: map layer captures the mouse · locked: click-through. */
export type ArtyMode = 'off' | 'edit' | 'locked'
export type UnitKind = 'gun' | 'target'
/** Manual calibration: drag across one grid cell, or a hex's full height. */
export type CalibrationKind = 'cell' | 'hex'

export interface ArtyUnit {
  id: string
  kind: UnitKind
  label: string
  /** World position in meters. */
  x: number
  y: number
  /** Guns only: platform id from PLATFORMS. */
  platform?: string
}

const NATO = [
  'Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India',
  'Juliett', 'Kilo', 'Lima', 'Mike', 'November', 'Oscar', 'Papa', 'Quebec', 'Romeo',
  'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey', 'X-ray', 'Yankee', 'Zulu'
]

// Labels are assigned once (first free name) so they stay stable as units are removed.
function nextLabel(units: ArtyUnit[], kind: UnitKind): string {
  const used = new Set(units.filter((u) => u.kind === kind).map((u) => u.label))
  for (let i = 0; ; i++) {
    const label =
      kind === 'gun'
        ? NATO[i % NATO.length] + (i >= NATO.length ? ` ${Math.floor(i / NATO.length) + 1}` : '')
        : `T${i + 1}`
    if (!used.has(label)) return label
  }
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function normalizeWind(w: Wind): Wind {
  return {
    azimuth: wrapDegrees(Math.round(w.azimuth / 5) * 5),
    tier: Math.min(5, Math.max(0, Math.round(w.tier)))
  }
}

interface ArtilleryState {
  mode: ArtyMode
  /** Manual calibration in progress, and which kind (false when idle). */
  calibrating: CalibrationKind | false
  /** Grid auto-detect in progress (not persisted). */
  detecting: boolean
  /** Hide the overlay while the in-game map is closed (watches the screen). */
  hideWithMap: boolean
  /** In-game map open? null while not watching (not persisted). */
  mapOpen: boolean | null
  /** Screen corner being watched, in window px — nothing may be drawn there
   *  or it would show up in the capture (not persisted). */
  mapProbe: { x: number; y: number; w: number; h: number } | null
  /** null until the first calibration/pan — the layer falls back to defaultViewport(). */
  viewport: Viewport | null
  units: ArtyUnit[]
  activeGunId: string | null
  activeTargetId: string | null
  /** Last clicked unit (keyboard Delete target, highlight). */
  selectedId: string | null
  wind: Wind
  /** Platform preselected for the next placed gun. */
  lastPlatform: string

  setMode: (mode: ArtyMode) => void
  setCalibrating: (kind: CalibrationKind | false) => void
  setDetecting: (on: boolean) => void
  setHideWithMap: (on: boolean) => void
  setMapWatch: (patch: { mapOpen?: boolean | null; mapProbe?: ArtilleryState['mapProbe'] }) => void
  setViewport: (vp: Viewport) => void
  addUnit: (kind: UnitKind, pos: Vec, platform?: string) => string
  moveUnit: (id: string, pos: Vec) => void
  removeUnit: (id: string) => void
  setPlatform: (id: string, platform: string) => void
  /** Select a unit and make it the active gun/target of its kind. */
  select: (id: string | null) => void
  setWind: (patch: Partial<Wind>) => void
  clearAll: () => void
}

export const useArtillery = create<ArtilleryState>()(
  persist(
    (set) => ({
      mode: 'off',
      calibrating: false,
      detecting: false,
      hideWithMap: true,
      mapOpen: null,
      mapProbe: null,
      viewport: null,
      units: [],
      activeGunId: null,
      activeTargetId: null,
      selectedId: null,
      wind: { azimuth: 0, tier: 0 },
      lastPlatform: DEFAULT_PLATFORM,

      setMode: (mode) => set(mode === 'off' ? { mode, calibrating: false } : { mode }),
      setCalibrating: (calibrating) => set({ calibrating }),
      setDetecting: (detecting) => set({ detecting }),
      setHideWithMap: (hideWithMap) => set({ hideWithMap }),
      setMapWatch: (patch) => set(patch),
      setViewport: (viewport) => set({ viewport }),

      addUnit: (kind, pos, platform) => {
        const id = newId()
        set((s) => {
          const unit: ArtyUnit = {
            id,
            kind,
            label: nextLabel(s.units, kind),
            x: pos.x,
            y: pos.y,
            ...(kind === 'gun' ? { platform: platform ?? s.lastPlatform } : {})
          }
          return {
            units: [...s.units, unit],
            selectedId: id,
            ...(kind === 'gun'
              ? { activeGunId: id, lastPlatform: unit.platform! }
              : { activeTargetId: id })
          }
        })
        return id
      },

      moveUnit: (id, pos) =>
        set((s) => ({ units: s.units.map((u) => (u.id === id ? { ...u, x: pos.x, y: pos.y } : u)) })),

      removeUnit: (id) =>
        set((s) => {
          const removed = s.units.find((u) => u.id === id)
          const units = s.units.filter((u) => u.id !== id)
          // Fall back to the most recently added unit of the same kind.
          const lastOf = (kind: UnitKind): string | null =>
            [...units].reverse().find((u) => u.kind === kind)?.id ?? null
          return {
            units,
            selectedId: s.selectedId === id ? null : s.selectedId,
            activeGunId:
              removed?.kind === 'gun' && s.activeGunId === id ? lastOf('gun') : s.activeGunId,
            activeTargetId:
              removed?.kind === 'target' && s.activeTargetId === id ? lastOf('target') : s.activeTargetId
          }
        }),

      setPlatform: (id, platform) =>
        set((s) => ({
          units: s.units.map((u) => (u.id === id ? { ...u, platform } : u)),
          lastPlatform: platform
        })),

      select: (id) =>
        set((s) => {
          const unit = id ? s.units.find((u) => u.id === id) : undefined
          if (!unit) return { selectedId: null }
          return unit.kind === 'gun'
            ? { selectedId: id, activeGunId: id }
            : { selectedId: id, activeTargetId: id }
        }),

      setWind: (patch) => set((s) => ({ wind: normalizeWind({ ...s.wind, ...patch }) })),

      clearAll: () => set({ units: [], activeGunId: null, activeTargetId: null, selectedId: null })
    }),
    {
      name: 'artillery',
      version: 1,
      // Mode is session-only: the overlay always starts with artillery off.
      partialize: (s) => ({
        viewport: s.viewport,
        units: s.units,
        activeGunId: s.activeGunId,
        activeTargetId: s.activeTargetId,
        wind: s.wind,
        lastPlatform: s.lastPlatform,
        hideWithMap: s.hideWithMap
      })
    }
  )
)
