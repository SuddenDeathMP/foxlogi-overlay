import { systemPreferences } from 'electron'
import { uIOhook, UiohookKey, type UiohookKeyboardEvent, type UiohookMouseEvent } from 'uiohook-napi'

/** The keys that toggle/close the in-game map. */
export type MapKey = 'm' | 'escape'

/** Game input observed system-wide. Nothing is consumed: the game still gets it.
 *  Handlers run on the main thread for every event, so keep them cheap. */
export interface GameInputListener {
  key?: (key: MapKey) => void
  /** Any mouse-wheel step (the map zooms on the wheel). */
  wheel?: () => void
  /** Right mouse button pressed. */
  rightDown?: () => void
  /** Left mouse button pressed / released. */
  leftDown?: () => void
  leftUp?: () => void
  /** Mouse moved (with or without a button held). */
  move?: () => void
}

/** libuiohook's button numbering: 1 left, 2 right, 3 middle. */
const LEFT_BUTTON = 1
const RIGHT_BUTTON = 2

let started = false
let failed = false
let prompted = false
const listeners = new Set<GameInputListener>()

function onKeyDown(e: UiohookKeyboardEvent): void {
  if (e.altKey || e.ctrlKey || e.metaKey) return
  const key: MapKey | null = e.keycode === UiohookKey.M ? 'm' : e.keycode === UiohookKey.Escape ? 'escape' : null
  if (key) listeners.forEach((l) => l.key?.(key))
}

function onWheel(): void {
  listeners.forEach((l) => l.wheel?.())
}

function onMouseDown(e: UiohookMouseEvent): void {
  if (e.button === RIGHT_BUTTON) listeners.forEach((l) => l.rightDown?.())
  else if (e.button === LEFT_BUTTON) listeners.forEach((l) => l.leftDown?.())
}

function onMouseUp(e: UiohookMouseEvent): void {
  if (e.button === LEFT_BUTTON) listeners.forEach((l) => l.leftUp?.())
}

// libuiohook reports drags (moves with a button held) as moves too.
function onMouseMove(): void {
  listeners.forEach((l) => l.move?.())
}

/** Start the system-wide hook once; false if it can't run. */
function ensureStarted(): boolean {
  if (started) return true
  if (failed) return false
  if (process.platform === 'darwin' && !systemPreferences.isTrustedAccessibilityClient(false)) {
    // Ask once per run (opens the system prompt); a later subscribe retries.
    if (!prompted) systemPreferences.isTrustedAccessibilityClient(true)
    prompted = true
    return false
  }
  try {
    uIOhook.on('keydown', onKeyDown)
    uIOhook.on('wheel', onWheel)
    uIOhook.on('mousedown', onMouseDown)
    uIOhook.on('mouseup', onMouseUp)
    uIOhook.on('mousemove', onMouseMove)
    uIOhook.start()
    started = true
  } catch (err) {
    failed = true
    uIOhook.removeAllListeners()
    console.warn('[gameInput] global input hook unavailable:', (err as Error).message)
  }
  return started
}

/**
 * Observe keys / wheel / right-clicks system-wide without consuming them
 * (unlike globalShortcut, which would take the keys away from the game).
 * Returns an unsubscribe function, or null when the hook can't run — on macOS
 * the app needs Accessibility permission — so callers can fall back.
 */
export function addGameInputListener(listener: GameInputListener): (() => void) | null {
  if (!ensureStarted()) return null
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** On quit. */
export function stopGameInput(): void {
  listeners.clear()
  if (!started) return
  started = false
  try {
    uIOhook.stop()
  } catch {
    // quitting anyway
  }
}
