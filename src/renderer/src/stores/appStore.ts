import { create } from 'zustand'
import type { AuthStatus, AppSettings, LogiItem } from '@shared/types'
import type { ResolvedZones } from '@shared/zones'

interface AppState {
  auth: AuthStatus | null
  settings: AppSettings | null
  interactive: boolean
  zones: ResolvedZones | null
  // cached item catalog (code_name/icon lookups) — refreshed manually
  items: LogiItem[]
  itemsByCode: Record<string, LogiItem>
  itemsById: Record<string, LogiItem>
  updateVersion: string | null

  setAuth: (a: AuthStatus) => void
  setSettings: (s: AppSettings) => void
  setInteractive: (v: boolean) => void
  setZones: (z: ResolvedZones) => void
  setItems: (items: LogiItem[]) => void
  setUpdateVersion: (v: string) => void
}

export const useApp = create<AppState>((set) => ({
  auth: null,
  settings: null,
  interactive: false,
  zones: null,
  items: [],
  itemsByCode: {},
  itemsById: {},
  updateVersion: null,

  setAuth: (auth) => set({ auth }),
  setSettings: (settings) => set({ settings }),
  setInteractive: (interactive) => set({ interactive }),
  setZones: (zones) => set({ zones }),
  setItems: (items) =>
    set({
      items,
      itemsByCode: Object.fromEntries(
        items.filter((i) => i.code_name).map((i) => [i.code_name as string, i])
      ),
      itemsById: Object.fromEntries(
        items
          .map((i) => [String(i.id ?? i.type_id ?? ''), i] as const)
          .filter(([k]) => k !== '')
      )
    }),
  setUpdateVersion: (updateVersion) => set({ updateVersion })
}))

export function iconUrl(icon: string | undefined): string | undefined {
  if (!icon) return undefined
  const base = useApp.getState().auth?.iconBase
  if (!base) return undefined
  return `${base}/${icon}`
}
