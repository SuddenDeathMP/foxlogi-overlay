/** Slots of the Int32Array (on a SharedArrayBuffer) shared by main and the
 *  right-click hook worker. */

/** 1 = swallow right-clicks now: Edit mode, and our window is click-through. */
export const ARMED = 0
/** 1 = unhook and exit. */
export const STOP = 1
/** The overlay's rect in physical screen px (right/bottom exclusive): clicks
 *  elsewhere, e.g. on another monitor, are never taken. */
export const LEFT = 2
export const TOP = 3
export const RIGHT = 4
export const BOTTOM = 5
export const FLAG_COUNT = 6
