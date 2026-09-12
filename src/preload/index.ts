import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type ApiOp } from '@shared/ipc-contract'
import type { AuthStatus, AppSettings, ApiResult, GridDetectResult, MapOpenState, MapWatchStart } from '@shared/types'

// Narrow, enumerated bridge. No generic "call any URL" passthrough — every
// backend operation is addressed by its ApiOp key and resolved in main.

function on(channel: string, cb: (payload: any) => void): () => void {
  const listener = (_e: unknown, payload: any): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  /** OS the overlay runs on (e.g. grid capture can't exclude the window on Linux). */
  platform: process.platform,
  auth: {
    setKey: (rawKey: string): Promise<AuthStatus> => ipcRenderer.invoke(IPC.authSetKey, rawKey),
    status: (): Promise<AuthStatus> => ipcRenderer.invoke(IPC.authStatus),
    clear: (): Promise<AuthStatus> => ipcRenderer.invoke(IPC.authClear),
    onUnauthorized: (cb: (s: AuthStatus) => void) => on(IPC.pushUnauthorized, cb),
    onStatus: (cb: (s: AuthStatus) => void) => on(IPC.authStatus, cb)
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.settingsGet),
    update: (patch: Partial<AppSettings>): Promise<AppSettings> =>
      ipcRenderer.invoke(IPC.settingsUpdate, patch),
    listDisplays: (): Promise<Array<{ id: number; label: string; primary: boolean }>> =>
      ipcRenderer.invoke(IPC.displaysList)
  },
  overlay: {
    setInteractive: (next: boolean): Promise<boolean> =>
      ipcRenderer.invoke(IPC.overlaySetInteractive, next),
    getState: (): Promise<{ interactive: boolean }> => ipcRenderer.invoke(IPC.overlayGetState),
    quit: (): Promise<void> => ipcRenderer.invoke(IPC.overlayQuit),
    detectGrid: (): Promise<GridDetectResult> => ipcRenderer.invoke(IPC.overlayDetectGrid),
    /** Start (true → MapWatchStart) or stop (false → null) watching for the in-game map. */
    setMapWatch: (on: boolean): Promise<MapWatchStart | null> => ipcRenderer.invoke(IPC.overlaySetMapWatch, on),
    onMapOpen: (cb: (s: MapOpenState) => void) => on(IPC.pushMapOpen, cb),
    onMapZoomed: (cb: () => void) => on(IPC.pushMapZoomed, cb),
    /** Report right-clicks through the click-through overlay; false = hook unavailable. */
    setMapClicks: (on: boolean): Promise<boolean> => ipcRenderer.invoke(IPC.overlaySetMapClicks, on),
    onMapRightClick: (cb: (p: { x: number; y: number }) => void) => on(IPC.pushMapRightClick, cb),
    /** Report left-drags on the game; false = hook unavailable. */
    setMapDrag: (on: boolean): Promise<boolean> => ipcRenderer.invoke(IPC.overlaySetMapDrag, on),
    onMapDrag: (cb: (d: { dx: number; dy: number; end: boolean }) => void) => on(IPC.pushMapDrag, cb),
    onInteractive: (cb: (s: { interactive: boolean }) => void) => on(IPC.pushInteractive, cb),
    onZones: (cb: (z: unknown) => void) => on(IPC.pushZones, cb),
    onToggleUi: (cb: () => void) => on(IPC.pushToggleUi, cb),
    onDetectGrid: (cb: () => void) => on(IPC.pushDetectGrid, cb),
    onHotkeyWarning: (cb: (w: { failed: string[] }) => void) => on(IPC.pushHotkeyWarning, cb)
  },
  call: <T = unknown>(op: ApiOp, ...args: unknown[]): Promise<ApiResult<T>> =>
    ipcRenderer.invoke(IPC.apiCall, { op, args }),
  stockpile: {
    ingestFromClipboard: () => ipcRenderer.invoke(IPC.stockpileIngest),
    onIngest: (cb: (r: unknown) => void) => on(IPC.pushIngest, cb)
  },
  update: {
    onAvailable: (cb: (i: { version: string }) => void) => on(IPC.pushUpdateAvailable, cb),
    onDownloaded: (cb: (i: { version: string }) => void) => on(IPC.pushUpdateDownloaded, cb)
  }
}

export type OverlayApi = typeof api

contextBridge.exposeInMainWorld('api', api)
