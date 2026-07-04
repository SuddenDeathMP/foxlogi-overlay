import type { ApiOp } from '@shared/ipc-contract'
import type { ApiResult } from '@shared/types'

// Thin renderer-side wrapper over the preload bridge. The renderer never sees
// the key or talks to the network directly — it asks main to run an op.
export function call<T = unknown>(op: ApiOp, ...args: unknown[]): Promise<ApiResult<T>> {
  return window.api.call<T>(op, ...args)
}

/** Convenience: return data or throw the error string (for try/catch UIs). */
export async function callOrThrow<T = unknown>(op: ApiOp, ...args: unknown[]): Promise<T> {
  const res = await call<T>(op, ...args)
  if (!res.ok) throw new Error(res.error || `Request failed (${res.status})`)
  return res.data as T
}
