import { useEffect } from 'react'
import type { App } from 'antd'
import { useArtillery } from './store'

type Message = ReturnType<typeof App.useApp>['message']

/** The macOS Accessibility hint is shown once per run. */
let keysHintShown = false

/**
 * While `active`, main polls the screen for the in-game map's search icon and
 * pushes open/closed changes into the artillery store (mapOpen). Stops, and
 * resets mapOpen to null, when inactive or unmounted.
 */
export function useMapWatch(active: boolean, message: Message): void {
  useEffect(() => {
    if (!active) return
    const { setMapWatch, setHideWithMap } = useArtillery.getState()
    let cancelled = false
    const off = window.api.overlay.onMapOpen((s) => {
      if (s.open != null) {
        setMapWatch({ mapOpen: s.open })
        return
      }
      setMapWatch({ mapOpen: null, mapProbe: null })
      setHideWithMap(false)
      message.error(s.error, 8)
    })
    window.api.overlay.setMapWatch(true).then((res) => {
      if (cancelled || !res) return
      if (res.ok) {
        setMapWatch({ mapProbe: res.region })
        if (!res.keys && window.api.platform === 'darwin' && !keysHintShown) {
          keysHintShown = true
          message.info(
            'To hide the overlay the moment you press M or Esc, allow Accessibility for the overlay in System Settings → Privacy & Security, then turn artillery off and on. Until then the map is detected by screen checks only.',
            10
          )
        }
      } else {
        setHideWithMap(false)
        message.error(res.error, 8)
      }
    })
    return () => {
      cancelled = true
      off()
      void window.api.overlay.setMapWatch(false)
      setMapWatch({ mapOpen: null, mapProbe: null })
    }
  }, [active, message])
}
