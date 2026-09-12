import { screen } from 'electron'
import type { Worker } from 'node:worker_threads'
import createWorker from './rightClickBlock.worker?nodeWorker'
import { ARMED, BOTTOM, FLAG_COUNT, LEFT, RIGHT, STOP, TOP } from './rightClickBlockFlags'
import { getOverlay, isInteractive, onInteractiveChange } from './window'

/** The overlay's rect in physical px, which is what the hook reports. Without
 *  a window it stays empty, so nothing is taken. */
function storeRect(flags: Int32Array): void {
  const win = getOverlay()
  const r = win ? screen.dipToScreenRect(win, win.getBounds()) : { x: 0, y: 0, width: 0, height: 0 }
  Atomics.store(flags, LEFT, r.x)
  Atomics.store(flags, TOP, r.y)
  Atomics.store(flags, RIGHT, r.x + r.width)
  Atomics.store(flags, BOTTOM, r.y + r.height)
}

/**
 * Swallow right-clicks that would reach the game, so the game doesn't act on
 * the right-click that opens our place menu (Windows only, see
 * rightClickBlock.worker.ts). Only clicks made while our window is click-through
 * are taken; clicks on our own UI stay with the DOM. `onRightDown` runs for
 * each swallowed click.
 *
 * Resolves to a stop function, or null where it can't run (other platforms, or
 * the hook failed), so the caller can fall back to observing clicks.
 */
export function blockRightClicks(onRightDown: () => void): Promise<(() => void) | null> {
  if (process.platform !== 'win32') return Promise.resolve(null)

  const flags = new Int32Array(new SharedArrayBuffer(FLAG_COUNT * Int32Array.BYTES_PER_ELEMENT))
  let worker: Worker
  try {
    worker = createWorker({ workerData: { flags } })
  } catch (err) {
    console.warn('[rightClickBlock] worker failed to start:', (err as Error).message)
    return Promise.resolve(null)
  }

  // The rect is refreshed along the way: the overlay can move to another
  // display (Settings), and it follows display changes (window.ts, registered
  // earlier, so it has already moved when these listeners run).
  const arm = (interactive: boolean): void => {
    storeRect(flags)
    Atomics.store(flags, ARMED, interactive ? 0 : 1)
  }
  arm(isInteractive())
  const offInteractive = onInteractiveChange(arm)
  const onDisplays = (): void => storeRect(flags)
  screen.on('display-metrics-changed', onDisplays)
  screen.on('display-added', onDisplays)
  screen.on('display-removed', onDisplays)

  return new Promise((resolve) => {
    let stopped = false
    // The worker notices within its poll interval, unhooks and exits.
    const stop = (): void => {
      if (stopped) return
      stopped = true
      offInteractive()
      screen.off('display-metrics-changed', onDisplays)
      screen.off('display-added', onDisplays)
      screen.off('display-removed', onDisplays)
      Atomics.store(flags, ARMED, 0)
      Atomics.store(flags, STOP, 1)
    }
    worker.on('message', (m: string) => {
      if (m === 'ready') resolve(stop)
      else if (m === 'rightDown' && !stopped) onRightDown()
    })
    worker.on('error', (err) => {
      console.warn('[rightClickBlock] mouse hook unavailable:', err.message)
      stop()
      resolve(null)
    })
    // Before 'ready' this is a failed start; after it, resolve is a no-op.
    worker.on('exit', () => {
      stop()
      resolve(null)
    })
  })
}
