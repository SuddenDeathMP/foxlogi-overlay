import { app } from 'electron'
import { getSettings } from './settings'
import { loadKey } from './auth/store'
import { createOverlayWindow, getOverlay } from './overlay/window'
import { registerIpc, applyHotkeys } from './ipc/handlers'
import { unregisterHotkeys } from './hotkeys'
import { initUpdater } from './updater'

// Some Windows GPU configs render transparent windows as opaque black; allow a
// settings-driven fallback before the app is ready.
if (getSettings().disableHardwareAcceleration) {
  app.disableHardwareAcceleration()
}

// Single instance — a second launch just focuses the existing overlay.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

app.whenReady().then(() => {
  loadKey()
  registerIpc()
  createOverlayWindow()
  applyHotkeys()
  initUpdater()
})

app.on('will-quit', () => {
  unregisterHotkeys()
})

// Keep running with no visible windows is fine for an overlay; on macOS the
// overlay is recreated if it was closed.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (!getOverlay()) createOverlayWindow()
})
