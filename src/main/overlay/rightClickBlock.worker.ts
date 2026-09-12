import { parentPort, workerData } from 'node:worker_threads'
import { ARMED, BOTTOM, LEFT, RIGHT, STOP, TOP, type RightClickFilter } from './rightClickBlockShared'
import { runWinHook } from './rightClickHookWin'
import { runMacTap } from './rightClickHookMac'

/**
 * Swallows right-clicks while armed, so they never reach the game, and reports
 * each one to main. Everything else passes through untouched.
 *
 * The OS calls the hook on the thread that installed it, from inside that
 * thread's message / run loop. Main's loop can be busy (captures, grid
 * detection), and a slow hook lags the mouse system-wide (macOS even disables
 * a slow tap), so the hook gets its own thread: this worker installs it and
 * then only runs the loop. The hook runs synchronously inside that loop's FFI
 * call, on this thread.
 */

/** Shared with main, see rightClickBlockShared.ts. */
const flags: Int32Array = workerData.flags

/** The press was swallowed, so its release must be too. */
let swallowUp = false

const filter: RightClickFilter = {
  down(point) {
    if (Atomics.load(flags, ARMED) !== 1) return false
    const p = point()
    const inside =
      p.x >= Atomics.load(flags, LEFT) &&
      p.x < Atomics.load(flags, RIGHT) &&
      p.y >= Atomics.load(flags, TOP) &&
      p.y < Atomics.load(flags, BOTTOM)
    if (!inside) return false
    swallowUp = true
    parentPort?.postMessage('rightDown')
    return true
  },
  up() {
    if (!swallowUp) return false
    swallowUp = false
    return true
  },
  stopped: () => Atomics.load(flags, STOP) === 1
}

const onReady = (): void => parentPort?.postMessage('ready')
// Each throws when its hook can't be installed; main then falls back.
if (process.platform === 'win32') runWinHook(filter, onReady)
else if (process.platform === 'darwin') runMacTap(filter, onReady)
else throw new Error(`no right-click hook on ${process.platform}`)
