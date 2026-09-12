import { globalShortcut } from 'electron'
import { getSettings } from './settings'

export interface HotkeyResult {
  toggle: boolean
  ingest: boolean
  gridDetect: boolean
}

function register(accelerator: string, cb: () => void): boolean {
  if (!accelerator) return false
  try {
    return globalShortcut.register(accelerator, cb)
  } catch {
    return false
  }
}

/**
 * Register the global hotkeys. Returns which ones registered successfully so the
 * UI can warn about conflicts (another app/the game may already own a combo).
 */
export function registerHotkeys(
  onIngest: () => void,
  onToggle: () => void,
  onGridDetect: () => void
): HotkeyResult {
  globalShortcut.unregisterAll()
  const { ingestHotkey, toggleHotkey, gridDetectHotkey } = getSettings()

  return {
    toggle: register(toggleHotkey, onToggle),
    ingest: register(ingestHotkey, onIngest),
    gridDetect: register(gridDetectHotkey, onGridDetect)
  }
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll()
}
