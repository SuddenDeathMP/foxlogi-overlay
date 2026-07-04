import { BrowserWindow, screen, type Display } from 'electron'
import { join } from 'path'
import { IPC } from '@shared/ipc-contract'
import { currentZones, targetDisplay } from './zones'

let overlay: BrowserWindow | null = null
let interactive = false

export function getOverlay(): BrowserWindow | null {
  return overlay
}

export function isInteractive(): boolean {
  return interactive
}

function applyBounds(win: BrowserWindow, display: Display): void {
  const { x, y } = display.workArea
  const { width, height } = display.workArea
  win.setBounds({ x, y, width, height })
}

export function createOverlayWindow(): BrowserWindow {
  const display = targetDisplay()

  overlay = new BrowserWindow({
    x: display.workArea.x,
    y: display.workArea.y,
    width: display.workArea.width,
    height: display.workArea.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    focusable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Stay above borderless/fullscreen-windowed games. 'screen-saver' is the
  // highest practical level that still sits over most borderless games.
  overlay.setAlwaysOnTop(true, 'screen-saver')
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // Start in click-through mode: the game receives all mouse input. `forward`
  // still delivers mousemove so the UI can show hover affordances.
  setInteractive(false)

  overlay.once('ready-to-show', () => {
    overlay?.showInactive()
    pushZones()
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    overlay.loadURL(devUrl)
  } else {
    overlay.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Recompute geometry when displays change.
  const recompute = (): void => {
    if (!overlay) return
    applyBounds(overlay, targetDisplay())
    applyMouseState()
    pushZones()
  }
  screen.on('display-metrics-changed', recompute)
  screen.on('display-added', recompute)
  screen.on('display-removed', recompute)

  overlay.on('closed', () => {
    overlay = null
  })

  return overlay
}

/** Apply the OS-level mouse pass-through to match the current `interactive` flag,
 *  without broadcasting. Call after anything that may reset it (e.g. setBounds). */
function applyMouseState(): void {
  if (!overlay) return
  if (interactive) {
    overlay.setIgnoreMouseEvents(false)
  } else {
    overlay.setIgnoreMouseEvents(true, { forward: true })
  }
}

export function setInteractive(next: boolean): void {
  if (interactive === next) return
  interactive = next
  if (!overlay) return
  applyMouseState()
  // No focus() here: interactivity is hover-driven, and stealing keyboard focus
  // from the game on mere hover would be disruptive. Clicking focuses naturally.
  overlay.webContents.send(IPC.pushInteractive, { interactive: next })
}

export function toggleInteractive(): boolean {
  setInteractive(!interactive)
  return interactive
}

export function pushZones(): void {
  if (!overlay) return
  overlay.webContents.send(IPC.pushZones, currentZones())
}

/** Move the overlay to a different display (after a settings change). */
export function moveToTargetDisplay(): void {
  if (!overlay) return
  applyBounds(overlay, targetDisplay())
  // setBounds can drop the mouse pass-through state on some platforms; re-assert.
  applyMouseState()
  pushZones()
}
