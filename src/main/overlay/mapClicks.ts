import { screen } from 'electron'
import { IPC } from '@shared/ipc-contract'
import { getOverlay, isInteractive } from './window'
import { addGameInputListener } from './gameInput'

let off: (() => void) | null = null

/**
 * Right-click on the game while the overlay is click-through (artillery Edit
 * mode draws the grid but leaves the mouse to the game): tell the renderer
 * where, in window px, so it can open the place menu there. Clicks over our own
 * UI (window interactive) are left to the DOM. The game still receives the
 * click: a window can't take just one mouse button, and the hook only observes.
 */
function onRightDown(): void {
  if (isInteractive()) return
  const win = getOverlay()
  if (!win) return
  const p = screen.getCursorScreenPoint()
  const c = win.getContentBounds()
  win.webContents.send(IPC.pushMapRightClick, { x: p.x - c.x, y: p.y - c.y })
}

/** Start/stop reporting right-clicks. Returns false when the global input
 *  hook can't run (macOS without Accessibility), so the renderer can fall back
 *  to taking the mouse itself. */
export function setMapClicks(on: boolean): boolean {
  off?.()
  off = on ? addGameInputListener({ rightDown: onRightDown }) : null
  return off != null
}
