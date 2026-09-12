/** Shared by main and the right-click hook worker (rightClickBlock.worker.ts). */

/** Slots of the Int32Array (on a SharedArrayBuffer) main writes and the hook
 *  reads. */
/** 1 = swallow right-clicks now: Edit mode, and our window is click-through. */
export const ARMED = 0
/** 1 = remove the hook and exit. */
export const STOP = 1
/** The overlay's rect in the hook's screen coordinates (right/bottom
 *  exclusive): physical px on Windows, points on macOS. Clicks elsewhere, e.g.
 *  on another monitor, are never taken. */
export const LEFT = 2
export const TOP = 3
export const RIGHT = 4
export const BOTTOM = 5
export const FLAG_COUNT = 6

/** How often a hook's loop wakes up to check STOP. */
export const POLL_MS = 100

/** What a platform hook asks about each right-button event. */
export interface RightClickFilter {
  /** Right button pressed; `point` reads the cursor in the hook's screen
   *  coordinates. true = swallow it. */
  down(point: () => { x: number; y: number }): boolean
  /** Right button released. true = swallow it. */
  up(): boolean
  /** Checked each time the hook's loop wakes up. */
  stopped(): boolean
}
