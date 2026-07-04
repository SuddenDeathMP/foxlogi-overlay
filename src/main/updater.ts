import pkg from 'electron-updater'
import { IPC } from '@shared/ipc-contract'
import { getOverlay } from './overlay/window'

const { autoUpdater } = pkg

// Auto-update via electron-updater against the publish provider in
// electron-builder.yml (GitHub Releases by default). macOS auto-update requires
// a signed + notarized build; unsigned dev builds simply no-op.
export function initUpdater(): void {
  autoUpdater.autoDownload = true
  autoUpdater.on('update-available', (info) => {
    getOverlay()?.webContents.send(IPC.pushUpdateAvailable, { version: info.version })
  })
  autoUpdater.on('update-downloaded', (info) => {
    getOverlay()?.webContents.send(IPC.pushUpdateDownloaded, { version: info.version })
  })
  autoUpdater.on('error', (err) => {
    console.error('autoUpdater error', err)
  })

  // Don't crash dev runs without an update feed.
  autoUpdater.checkForUpdatesAndNotify().catch((e) => {
    console.warn('Update check skipped:', e?.message ?? e)
  })
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall()
}
