import { screen } from 'electron'
import { IPC } from '@shared/ipc-contract'
import { getOverlay, isInteractive } from './window'
import { addGameInputListener } from './gameInput'
import { blockRightClicks } from './rightClickBlock'

let off: (() => void) | null = null
/** Bumped on every setMapClicks, so a slow start that was overtaken stops itself. */
let generation = 0

/** Tell the renderer where the right-click was, in window px, so it can open
 *  the place menu there. */
function sendRightClick(): void {
  const win = getOverlay()
  if (!win) return
  const p = screen.getCursorScreenPoint()
  const c = win.getContentBounds()
  win.webContents.send(IPC.pushMapRightClick, { x: p.x - c.x, y: p.y - c.y })
}

/** Observed (not swallowed) right-click. Clicks over our own UI (window
 *  interactive) are left to the DOM. */
function onRightDown(): void {
  if (!isInteractive()) sendRightClick()
}

/**
 * Right-click on the game while the overlay is click-through (artillery Edit
 * mode draws the grid but leaves the mouse to the game) opens the place menu.
 * On Windows the click is swallowed, so the game never sees it. Elsewhere the
 * global input hook only observes it and the game gets it too: a window can't
 * take just one mouse button.
 *
 * Resolves to false when neither hook can run (macOS without Accessibility),
 * so the renderer can fall back to taking the mouse itself.
 */
export async function setMapClicks(on: boolean): Promise<boolean> {
  const mine = ++generation
  off?.()
  off = null
  if (!on) return false
  // The blocker only reports clicks it swallowed, so no interactivity check:
  // a swallowed click must open the menu or it's lost.
  const stopBlocking = await blockRightClicks(sendRightClick)
  if (mine !== generation) {
    stopBlocking?.()
    return false
  }
  off = stopBlocking ?? addGameInputListener({ rightDown: onRightDown })
  return off != null
}
