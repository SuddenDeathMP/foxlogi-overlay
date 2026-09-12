import { app } from 'electron'
import { getSettings } from './settings'
import { loadKey } from './auth/store'
import { createOverlayWindow, getOverlay } from './overlay/window'
import { registerIpc, applyHotkeys } from './ipc/handlers'
import { unregisterHotkeys } from './hotkeys'
import { stopGameInput } from './overlay/gameInput'
import { initUpdater } from './updater'

// Electron defaults to native Wayland in a Wayland session, where always-on-top,
// click-through, global shortcuts and global cursor positions don't work. Run
// under XWayland instead. The Ozone platform is picked before this script runs,
// so appendSwitch is too late: relaunch with the flag. The .desktop entries
// already pass it (electron-builder `executableArgs`); this covers direct runs.
const relaunchForX11 =
  process.platform === 'linux' &&
  app.isPackaged &&
  process.env['XDG_SESSION_TYPE'] === 'wayland' &&
  !app.commandLine.hasSwitch('ozone-platform')
if (relaunchForX11) {
  app.relaunch({
    execPath: process.env['APPIMAGE'] || process.execPath,
    args: [...process.argv.slice(1), '--ozone-platform=x11']
  })
  app.exit(0)
}

// Some Windows GPU configs render transparent windows as opaque black; allow a
// settings-driven fallback before the app is ready.
if (getSettings().disableHardwareAcceleration) {
  app.disableHardwareAcceleration()
}

// Single instance — a second launch just focuses the existing overlay. A process
// that is relaunching must not take the lock from its successor.
const gotLock = !relaunchForX11 && app.requestSingleInstanceLock()
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
  stopGameInput()
})

// Keep running with no visible windows is fine for an overlay; on macOS the
// overlay is recreated if it was closed.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (!getOverlay()) createOverlayWindow()
})
