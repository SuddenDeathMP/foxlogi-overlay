import { globalShortcut } from 'electron'
import { getSettings } from './settings'

export interface HotkeyResult {
  toggle: boolean
  ingest: boolean
}

/**
 * Register the global hotkeys. Returns which ones registered successfully so the
 * UI can warn about conflicts (another app/the game may already own a combo).
 */
export function registerHotkeys(onIngest: () => void, onToggle: () => void): HotkeyResult {
  globalShortcut.unregisterAll()
  const { ingestHotkey, toggleHotkey } = getSettings()

  const result: HotkeyResult = { toggle: false, ingest: false }

  if (toggleHotkey) {
    try {
      result.toggle = globalShortcut.register(toggleHotkey, onToggle)
    } catch {
      result.toggle = false
    }
  }

  if (ingestHotkey) {
    try {
      result.ingest = globalShortcut.register(ingestHotkey, onIngest)
    } catch {
      result.ingest = false
    }
  }

  return result
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll()
}
