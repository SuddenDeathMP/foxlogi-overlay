import { app, ipcMain, BrowserWindow } from 'electron'
import { IPC, type ApiCallRequest } from '@shared/ipc-contract'
import type { AuthStatus, AppSettings } from '@shared/types'
import { getSettings, updateSettings, iconBaseFor } from '../settings'
import { getKey, setKey, clearKey, hasKey, isWeakEncryption } from '../auth/store'
import { authEvents } from '../api/client'
import { dispatch } from '../api/endpoints'
import { ingestFromClipboard } from '../clipboard/ingest'
import { listDisplays } from '../overlay/zones'
import { setInteractive, isInteractive, moveToTargetDisplay, getOverlay } from '../overlay/window'
import { registerHotkeys } from '../hotkeys'

// Cached display name from the last successful identity probe.
let cachedIdentity: { username?: string; displayName?: string } = {}

function buildStatus(): AuthStatus {
  const { host } = getSettings()
  return {
    authenticated: hasKey(),
    host,
    iconBase: iconBaseFor(host),
    username: cachedIdentity.username,
    displayName: cachedIdentity.displayName,
    weakEncryption: isWeakEncryption()
  }
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

/** Probe the backend with the current key to confirm it works and grab identity. */
async function probeIdentity(): Promise<boolean> {
  if (!getKey()) return false
  // pilot-journal returns the current user's profile/totals; any authed endpoint
  // works to validate the key. We use the lightweight planner call.
  const res = await dispatch('logisticPlanner', [])
  if (res.ok) return true
  if (res.status === 401) {
    clearKey()
    cachedIdentity = {}
  }
  return false
}

export function registerIpc(): void {
  // ---- auth ----
  ipcMain.handle(IPC.authSetKey, async (_e, rawKey: string): Promise<AuthStatus> => {
    setKey(rawKey)
    await probeIdentity()
    return buildStatus()
  })
  ipcMain.handle(IPC.authStatus, async (): Promise<AuthStatus> => buildStatus())
  ipcMain.handle(IPC.authClear, async (): Promise<AuthStatus> => {
    clearKey()
    cachedIdentity = {}
    return buildStatus()
  })

  // ---- settings ----
  ipcMain.handle(IPC.settingsGet, async (): Promise<AppSettings> => getSettings())
  ipcMain.handle(IPC.settingsUpdate, async (_e, patch: Partial<AppSettings>): Promise<AppSettings> => {
    const prev = getSettings()
    const next = updateSettings(patch)
    if (patch.displayId !== undefined && patch.displayId !== prev.displayId) moveToTargetDisplay()
    if (next.toggleHotkey !== prev.toggleHotkey || next.ingestHotkey !== prev.ingestHotkey) {
      applyHotkeys()
    }
    broadcast(IPC.authStatus, buildStatus())
    return next
  })
  ipcMain.handle(IPC.displaysList, async () => listDisplays())

  // ---- overlay control ----
  ipcMain.handle(IPC.overlaySetInteractive, async (_e, next: boolean) => {
    setInteractive(!!next)
    return isInteractive()
  })
  ipcMain.handle(IPC.overlayGetState, async () => ({ interactive: isInteractive() }))
  ipcMain.handle(IPC.overlayQuit, async () => {
    app.quit()
  })

  // ---- narrow API gateway ----
  ipcMain.handle(IPC.apiCall, async (_e, req: ApiCallRequest) => {
    return dispatch(req.op, req.args ?? [])
  })

  // ---- clipboard stockpile ingest ----
  ipcMain.handle(IPC.stockpileIngest, async () => ingestFromClipboard())

  // ---- main -> renderer: 401 clears auth everywhere ----
  authEvents.on('unauthorized', () => {
    clearKey()
    cachedIdentity = {}
    broadcast(IPC.pushUnauthorized, buildStatus())
  })
}

/** Hotkey-driven ingest: force interactive mode and push the parsed result. */
export function runHotkeyIngest(): void {
  const result = ingestFromClipboard()
  setInteractive(true)
  getOverlay()?.webContents.send(IPC.pushIngest, result)
}

/** Toggle hotkey: tell the renderer to collapse/expand the overlay UI. */
export function runHotkeyToggle(): void {
  getOverlay()?.webContents.send(IPC.pushToggleUi)
}

/** (Re-)register global hotkeys and surface failures in the overlay UI. */
export function applyHotkeys(): void {
  const result = registerHotkeys(runHotkeyIngest, runHotkeyToggle)
  const { toggleHotkey, ingestHotkey } = getSettings()
  const failed: string[] = []
  if (toggleHotkey && !result.toggle) failed.push(`toggle UI (${toggleHotkey})`)
  if (ingestHotkey && !result.ingest) failed.push(`stockpile ingest (${ingestHotkey})`)
  if (failed.length === 0) return
  console.warn('Hotkey registration failed:', failed.join(', '))
  const wc = getOverlay()?.webContents
  if (!wc) return
  if (wc.isLoading()) wc.once('did-finish-load', () => wc.send(IPC.pushHotkeyWarning, { failed }))
  else wc.send(IPC.pushHotkeyWarning, { failed })
}

export { buildStatus }
