// DTOs shared between main and renderer. These mirror the backend serializer
// shapes loosely; fields not needed by the overlay are omitted.

export interface AuthStatus {
  authenticated: boolean
  host: string
  iconBase: string
  username?: string
  displayName?: string
  /** true on Linux when safeStorage only offers basic (unencrypted) storage */
  weakEncryption?: boolean
}

export interface AppSettings {
  /** backend base URL — fixed per build (prod: foxlogi.com, dev: localhost:5173) */
  host: string
  /** chosen display id the overlay is pinned to (null = primary) */
  displayId: number | null
  /** global hotkey accelerator for showing/hiding the overlay UI */
  toggleHotkey: string
  /** optional global hotkey for clipboard stockpile ingest */
  ingestHotkey: string
  disableHardwareAcceleration: boolean
}

export interface OverlayState {
  interactive: boolean
}

export interface ParsedStockpile {
  hex?: string
  city?: string
  type?: string
  name?: string
  coordinates?: { x: number; y: number } | null
  items: ParsedStockpileItem[]
  /** detected ingest source for the backend cap-bypass, e.g. 'stockpile_csv' */
  source: string
}

export interface ParsedStockpileItem {
  index: number
  name: string
  is_crate: boolean
  quantity: number
}

export interface ApiResult<T = unknown> {
  ok: boolean
  status: number
  data?: T
  error?: string
}

/** A LogisticItemType-ish record used to render icons & names. */
export interface LogiItem {
  id?: number
  type_id?: number
  code_name?: string
  name: string
  icon: string
  category?: string
  per_crate?: number
  bmat?: number
  rmat?: number
  emat?: number
  hemat?: number
}
