import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { AppSettings } from '@shared/types'

// Backend host is fixed per build: packaged builds talk to production, dev
// builds to the local server. Not user-configurable.
export const HOST = app.isPackaged ? 'https://foxlogi.com' : 'http://localhost:5173'

const DEFAULTS: AppSettings = {
  host: HOST,
  displayId: null,
  toggleHotkey: 'Alt+Z',
  ingestHotkey: 'Alt+Shift+S',
  disableHardwareAcceleration: false
}

function configPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

let cached: AppSettings | null = null

export function getSettings(): AppSettings {
  if (cached) return cached
  let next: AppSettings = { ...DEFAULTS }
  try {
    const p = configPath()
    if (existsSync(p)) {
      const raw = JSON.parse(readFileSync(p, 'utf-8'))
      next = { ...DEFAULTS, ...raw }
    }
  } catch {
    next = { ...DEFAULTS }
  }
  next.host = HOST // ignore any host persisted by older versions
  cached = next
  return next
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch, host: HOST }
  cached = next
  try {
    writeFileSync(configPath(), JSON.stringify(next, null, 2), 'utf-8')
  } catch (e) {
    console.error('Failed to persist settings', e)
  }
  return next
}

export function iconBaseFor(host: string): string {
  return `${host.replace(/\/+$/, '')}/stockpile/64`
}
