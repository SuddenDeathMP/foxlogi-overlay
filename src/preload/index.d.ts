import type { OverlayApi } from './index'

declare global {
  interface Window {
    api: OverlayApi
  }
}

export {}
