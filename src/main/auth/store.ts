import { app, safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync, rmSync } from 'fs'
import { join } from 'path'

// The raw `fxl_` API key lives ONLY in the main process. It is persisted
// encrypted via Electron safeStorage (Keychain / DPAPI / libsecret) and held in
// an in-memory variable at runtime. The renderer never receives it.

let inMemoryKey: string | null = null

function blobPath(): string {
  return join(app.getPath('userData'), 'auth.bin')
}

export function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

/** True when safeStorage falls back to unencrypted storage (Linux without a keyring). */
export function isWeakEncryption(): boolean {
  try {
    // getSelectedStorageBackend exists on Linux; basic_text means no real keyring.
    const anyStorage = safeStorage as unknown as {
      getSelectedStorageBackend?: () => string
    }
    if (process.platform === 'linux' && anyStorage.getSelectedStorageBackend) {
      return anyStorage.getSelectedStorageBackend() === 'basic_text'
    }
  } catch {
    /* ignore */
  }
  return false
}

export function loadKey(): void {
  try {
    const p = blobPath()
    if (!existsSync(p)) return
    if (encryptionAvailable()) {
      const buf = readFileSync(p)
      inMemoryKey = safeStorage.decryptString(buf)
    }
  } catch (e) {
    console.error('Failed to load API key', e)
    inMemoryKey = null
  }
}

export function setKey(rawKey: string): void {
  const key = (rawKey || '').trim()
  if (!key) throw new Error('Empty API key')
  inMemoryKey = key
  if (encryptionAvailable()) {
    const buf = safeStorage.encryptString(key)
    writeFileSync(blobPath(), buf)
  } else {
    // No encryption backend available; refuse to write plaintext to disk.
    console.warn('safeStorage unavailable: API key kept in memory only')
  }
}

export function getKey(): string | null {
  return inMemoryKey
}

export function hasKey(): boolean {
  return !!inMemoryKey
}

export function clearKey(): void {
  inMemoryKey = null
  try {
    const p = blobPath()
    if (existsSync(p)) rmSync(p)
  } catch (e) {
    console.error('Failed to clear API key blob', e)
  }
}
