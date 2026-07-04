import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type ApiOp } from '@shared/ipc-contract'
import type { AuthStatus, AppSettings, ApiResult } from '@shared/types'

// Narrow, enumerated bridge. No generic "call any URL" passthrough — every
// backend operation is addressed by its ApiOp key and resolved in main.

function on(channel: string, cb: (payload: any) => void): () => void {
  const listener = (_e: unknown, payload: any): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
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
    onInteractive: (cb: (s: { interactive: boolean }) => void) => on(IPC.pushInteractive, cb),
    onZones: (cb: (z: unknown) => void) => on(IPC.pushZones, cb),
    onToggleUi: (cb: () => void) => on(IPC.pushToggleUi, cb),
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
