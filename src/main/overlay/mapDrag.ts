import { screen } from 'electron'
import { IPC } from '@shared/ipc-contract'
import { getOverlay, isInteractive } from './window'
import { addGameInputListener } from './gameInput'

/** Minimum gap between pushed drag steps (~one frame). */
const PUSH_MS = 16

let off: (() => void) | null = null
/** Cursor at the last pushed step, while a left-drag on the game is going on. */
let last: { x: number; y: number } | null = null
let pending = { dx: 0, dy: 0 }
let lastPush = 0

function send(end: boolean): void {
  if (!end && pending.dx === 0 && pending.dy === 0) return
  getOverlay()?.webContents.send(IPC.pushMapDrag, { ...pending, end })
  pending = { dx: 0, dy: 0 }
  lastPush = Date.now()
}

const listener = {
  leftDown: (): void => {
    // A press on our own UI (pins, panels) is the DOM's, not a map drag.
    last = isInteractive() ? null : screen.getCursorScreenPoint()
    pending = { dx: 0, dy: 0 }
  },
  move: (): void => {
    if (!last) return
    const p = screen.getCursorScreenPoint()
    pending.dx += p.x - last.x
    pending.dy += p.y - last.y
    last = p
    if (Date.now() - lastPush >= PUSH_MS) send(false)
  },
  leftUp: (): void => {
    if (!last) return
    last = null
    send(true)
  }
}

/**
 * Left-drags on the game (the map pans 1:1 under the cursor) are pushed as
 * push:mapDrag steps in logical px, so the renderer can pan the grid and pins
 * along; the last step has `end: true`. Returns false when the global input
 * hook can't run.
 */
export function setMapDrag(on: boolean): boolean {
  off?.()
  last = null
  off = on ? addGameInputListener(listener) : null
  return off != null
}
