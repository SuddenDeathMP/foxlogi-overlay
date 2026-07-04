import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios'
import { EventEmitter } from 'events'
import { getKey } from '../auth/store'
import { getSettings } from '../settings'
import type { ApiResult } from '@shared/types'

// All backend HTTP happens here, in the MAIN process:
//  - the raw key never enters the renderer/DOM
//  - main is not a browser context, so there is NO CORS to configure backend-side
//  - one place to detect 401 and clear auth

export const authEvents = new EventEmitter()

let instance: AxiosInstance | null = null
let instanceHost: string | null = null

function getClient(): AxiosInstance {
  const host = getSettings().host.replace(/\/+$/, '')
  if (instance && instanceHost === host) return instance

  const client = axios.create({
    baseURL: host,
    timeout: 20000,
    // Not a browser context; no cookies, no CSRF — Bearer only.
    headers: { Accept: 'application/json' }
  })

  client.interceptors.request.use((config) => {
    const key = getKey()
    if (key) {
      config.headers = config.headers ?? {}
      config.headers.Authorization = `Bearer ${key}`
    }
    return config
  })

  client.interceptors.response.use(
    (r) => r,
    (err) => {
      if (err?.response?.status === 401) {
        authEvents.emit('unauthorized')
      }
      return Promise.reject(err)
    }
  )

  instance = client
  instanceHost = host
  return client
}

/** Reset the cached client when the host changes. */
export function resetClient(): void {
  instance = null
  instanceHost = null
}

export async function request<T = unknown>(config: AxiosRequestConfig): Promise<ApiResult<T>> {
  try {
    const res = await getClient().request<T>(config)
    return { ok: true, status: res.status, data: res.data }
  } catch (err) {
    const anyErr = err as { response?: { status?: number; data?: unknown }; message?: string }
    const status = anyErr.response?.status ?? 0
    let error = anyErr.message ?? 'Request failed'
    const body = anyErr.response?.data
    if (body && typeof body === 'object') {
      const detail = (body as Record<string, unknown>).detail ?? (body as Record<string, unknown>).error
      if (typeof detail === 'string') error = detail
    }
    return { ok: false, status, error, data: body as T }
  }
}

export const http = {
  get: <T = unknown>(url: string, params?: Record<string, unknown>) =>
    request<T>({ method: 'get', url, params }),
  post: <T = unknown>(url: string, data?: unknown, params?: Record<string, unknown>) =>
    request<T>({ method: 'post', url, data, params }),
  put: <T = unknown>(url: string, data?: unknown) => request<T>({ method: 'put', url, data }),
  patch: <T = unknown>(url: string, data?: unknown) => request<T>({ method: 'patch', url, data }),
  del: <T = unknown>(url: string, data?: unknown) => request<T>({ method: 'delete', url, data })
}
