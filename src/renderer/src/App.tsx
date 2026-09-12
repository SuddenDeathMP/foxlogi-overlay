import { useEffect, useRef, useState } from 'react'
import { App as AntdApp, Button, ConfigProvider, Tooltip } from 'antd'
import { ExpandAltOutlined, ShrinkOutlined } from '@ant-design/icons'
import { C, graphiteTheme } from './theme/graphite'
import { useApp } from './stores/appStore'
import { call } from './lib/api'
import type { LogiItem, ParsedStockpile } from '@shared/types'
import type { ResolvedZones } from '@shared/zones'
import Zone from './components/Zone'
import TopBanner, { ARTILLERY_TAB } from './features/Auth/TopBanner'
import AuthPanel from './features/Auth/AuthPanel'
import SettingsPanel from './features/Settings/SettingsPanel'
import LogisticsPanel from './features/Logistics/LogisticsPanel'
import BunkerSupplyPanel from './features/BunkerSupply/BunkerSupplyPanel'
import PilotMissionPanel from './features/PilotMission/PilotMissionPanel'
import IngestSheet from './features/Logistics/IngestSheet'
import ArtilleryLayer from './features/Artillery/ArtilleryLayer'
import ArtilleryPanel from './features/Artillery/ArtilleryPanel'
import ArtilleryReadout from './features/Artillery/ArtilleryReadout'
import { useArtillery } from './features/Artillery/store'
import { requestAutoDetect, runAutoDetect } from './features/Artillery/autoDetect'
import { useMapWatch } from './features/Artillery/useMapWatch'
import { useMapDrag } from './features/Artillery/useMapDrag'
import { ARTY_THEME } from './features/Artillery/ui'

/** Gap between the artillery HUD and the screen's left edge, px. */
const ARTY_EDGE_GAP = 25
/** Overlay toggle: the theme's small button size, inset like the banner's right
 *  edge (1px surface border + 12px padding). */
const TOGGLE_SIZE = graphiteTheme.token.controlHeightSM
const TOGGLE_INSET = 13
/** Gap between the top banner and the screen's top edge, px. */
const TOP_GAP = 10
/** After a wheel step over the artillery map, cursor moves within this radius
 *  (px) and time (ms) don't re-grab the mouse from the game. */
const WHEEL_HOLD_PX = 8
const WHEEL_HOLD_MS = 1500

export default function App(): React.ReactElement {
  const { message } = AntdApp.useApp()
  const auth = useApp((s) => s.auth)
  const zones = useApp((s) => s.zones)
  const setAuth = useApp((s) => s.setAuth)
  const setSettings = useApp((s) => s.setSettings)
  const setInteractive = useApp((s) => s.setInteractive)
  const setZones = useApp((s) => s.setZones)
  const setItems = useApp((s) => s.setItems)
  const setUpdateVersion = useApp((s) => s.setUpdateVersion)
  const artyMode = useArtillery((s) => s.mode)
  const setArtyMode = useArtillery((s) => s.setMode)
  const hideWithMap = useArtillery((s) => s.hideWithMap)
  const mapOpen = useArtillery((s) => s.mapOpen)
  const calibrating = useArtillery((s) => s.calibrating)

  const [showSettings, setShowSettings] = useState(false)
  const [ingest, setIngest] = useState<ParsedStockpile | null>(null)
  const [activeTab, setActiveTab] = useState('logi')
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('overlay-collapsed') === '1')
  // Expanded by hand while auto-hidden: stays shown until the map next opens/closes.
  const [forceShow, setForceShow] = useState(false)

  useEffect(() => {
    localStorage.setItem('overlay-collapsed', collapsed ? '1' : '0')
  }, [collapsed])

  const artyOn = artyMode !== 'off'
  // Artillery: follow the in-game map — hidden while it's closed.
  useMapWatch(artyOn && hideWithMap && !collapsed && !showSettings && !calibrating, message)
  useEffect(() => setForceShow(false), [mapOpen])
  // Map just opened (or was open when watching started): re-sync to its grid.
  useEffect(() => {
    if (mapOpen) requestAutoDetect(message, 150)
  }, [mapOpen, message])
  // Auto-hide starts only once the map has been open since artillery was turned
  // on — opening the Artillery tab with the map closed keeps the panel in view.
  const [mapSeen, setMapSeen] = useState(false)
  useEffect(() => {
    if (!artyOn) setMapSeen(false)
    else if (mapOpen) setMapSeen(true)
  }, [artyOn, mapOpen])
  const autoHidden = artyOn && mapSeen && mapOpen === false && !forceShow
  const hidden = collapsed || autoHidden
  // Pan the grid and pins along when the in-game map is dragged. Only with the
  // map known to be open — or, without map tracking, in Edit mode — so that
  // left-drags in gameplay (aiming, shooting) never move them.
  useMapDrag(
    artyOn && !hidden && !calibrating && (mapOpen === true || (mapOpen === null && artyMode === 'edit')),
    message
  )

  // Toggle button and hotkey: while auto-hidden, "expand" overrides the map watch.
  const toggleUi = (): void => {
    if (autoHidden && !collapsed) setForceShow(true)
    else setCollapsed((c) => !c)
  }
  const toggleUiRef = useRef(toggleUi)
  toggleUiRef.current = toggleUi

  // Hover-driven interactivity: the window is click-through, but forwarded
  // mousemove still hit-tests the DOM. Over a UI element (anything but the
  // transparent body) → accept the mouse; off it → back to click-through after
  // a short grace period so tiny gaps between elements don't flicker.
  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | undefined
    let active = false
    // Set by a wheel step over the artillery map: the window stays click-through
    // (so the game gets the wheel) until the cursor really moves away from here.
    let wheelHold: { x: number; y: number; t: number } | null = null

    const release = (): void => {
      if (active || hideTimer) {
        if (hideTimer) clearTimeout(hideTimer)
        hideTimer = setTimeout(() => {
          hideTimer = undefined
          active = false
          window.api.overlay.setInteractive(false)
        }, 150)
      }
    }

    const onMove = (e: MouseEvent): void => {
      if (wheelHold) {
        // Hand jitter while scrolling mustn't grab the mouse back mid-zoom.
        const still = Math.hypot(e.clientX - wheelHold.x, e.clientY - wheelHold.y) < WHEEL_HOLD_PX
        if (still && Date.now() - wheelHold.t < WHEEL_HOLD_MS) return
        wheelHold = null
      }
      const overUi =
        e.target instanceof Element &&
        e.target !== document.documentElement &&
        e.target !== document.body
      if (overUi) {
        if (hideTimer) {
          clearTimeout(hideTimer)
          hideTimer = undefined
        }
        if (!active) {
          active = true
          window.api.overlay.setInteractive(true)
        }
      } else if (active && !hideTimer) {
        release()
      }
    }

    const onLeave = (e: MouseEvent): void => {
      // Cursor left the window entirely (other display / off-screen).
      if (!e.relatedTarget) release()
    }

    // A wheel step over the artillery map (Edit mode takes the mouse): hand the
    // mouse back to the game at once so the following steps zoom its map. This
    // first step is ours and is lost; the OS can't pass through only the wheel.
    const onWheel = (e: WheelEvent): void => {
      if (!(e.target instanceof Element) || !e.target.closest('[data-wheel-through]')) return
      if (hideTimer) {
        clearTimeout(hideTimer)
        hideTimer = undefined
      }
      wheelHold = { x: e.clientX, y: e.clientY, t: Date.now() }
      active = false
      window.api.overlay.setInteractive(false)
    }

    document.addEventListener('mousemove', onMove, true)
    document.addEventListener('mouseout', onLeave, true)
    document.addEventListener('wheel', onWheel, { capture: true, passive: true })
    return () => {
      document.removeEventListener('mousemove', onMove, true)
      document.removeEventListener('mouseout', onLeave, true)
      document.removeEventListener('wheel', onWheel, true)
      if (hideTimer) clearTimeout(hideTimer)
    }
  }, [])

  // Initial load + push subscriptions.
  useEffect(() => {
    window.api.auth.status().then(setAuth)
    window.api.settings.get().then(setSettings)
    window.api.overlay.getState().then((s) => setInteractive(s.interactive))

    const offs = [
      window.api.overlay.onZones((z) => setZones(z as ResolvedZones)),
      window.api.overlay.onInteractive((s) => setInteractive(s.interactive)),
      window.api.auth.onUnauthorized((s) => {
        setAuth(s)
        message.error('API key was rejected — please re-enter it.')
      }),
      window.api.auth.onStatus((s) => setAuth(s)),
      window.api.update.onAvailable((i) => setUpdateVersion(i.version)),
      window.api.update.onDownloaded((i) => {
        setUpdateVersion(i.version)
        message.success(`Update ${i.version} downloaded — restart to apply.`)
      }),
      window.api.stockpile.onIngest((r) => {
        const res = r as { ok: boolean; error?: string; stockpile?: ParsedStockpile }
        if (res.ok && res.stockpile) setIngest(res.stockpile)
        else message.warning(res.error || 'No stockpile data found on clipboard.')
      }),
      window.api.overlay.onToggleUi(() => toggleUiRef.current()),
      window.api.overlay.onDetectGrid(() => runAutoDetect(message)),
      // The open map was wheel-zoomed and has settled (600 ms): re-sync.
      window.api.overlay.onMapZoomed(() => requestAutoDetect(message, 0)),
      window.api.overlay.onHotkeyWarning((w) =>
        message.warning(`Hotkey not registered (already in use?): ${w.failed.join(', ')}`, 8)
      )
    ]
    return () => offs.forEach((off) => off())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load the item catalog once authenticated (icons + names).
  useEffect(() => {
    if (!auth?.authenticated) return
    call<LogiItem[]>('logisticItemList', true).then((res) => {
      if (res.ok && Array.isArray(res.data)) setItems(res.data)
    })
  }, [auth?.authenticated, setItems])

  const z = zones?.zones
  // The top banner hangs TOP_GAP below the screen edge and is sized to its
  // controls, with the same inset above and below them as at its sides.
  const topRect = z?.top && { ...z.top, y: z.top.y + TOP_GAP, h: TOGGLE_SIZE + 2 * TOGGLE_INSET }
  // One collapse/expand toggle, pinned at the top banner's left edge in both
  // states so it can be clicked at the same spot; zones fly into its centre.
  const togglePos = { x: (topRect?.x ?? 0) + TOGGLE_INSET, y: (topRect?.y ?? 0) + TOGGLE_INSET }
  const collapseTo = { x: togglePos.x + TOGGLE_SIZE / 2, y: togglePos.y + TOGGLE_SIZE / 2 }

  return (
    <>
      {/* Full-screen map layer; rendered first so the zones paint above it. */}
      <ConfigProvider theme={ARTY_THEME}>
        <ArtilleryLayer hidden={hidden} />
      </ConfigProvider>

      {/* Grows with its buttons/tags so nothing in the bar gets clipped. */}
      <Zone rect={topRect} hidden={hidden} collapseTo={collapseTo} growToContent>
        <TopBanner
          onOpenSettings={() => setShowSettings(true)}
          tab={artyOn ? ARTILLERY_TAB : activeTab}
          onTabChange={(tab) => {
            if (tab === ARTILLERY_TAB) {
              if (!artyOn) {
                setArtyMode('edit')
                requestAutoDetect(message, 400)
              }
              return
            }
            setActiveTab(tab)
            setArtyMode('off')
          }}
          toggleSpace={TOGGLE_INSET + TOGGLE_SIZE}
        />
      </Zone>

      {/* Kept off the screen edge so the game's grid stays visible there (auto-detect reads the edges). */}
      <Zone
        rect={z?.left && { ...z.left, x: z.left.x + ARTY_EDGE_GAP }}
        hidden={hidden || !artyOn}
        collapseTo={collapseTo}
        className="arty-zone"
      >
        <ConfigProvider theme={ARTY_THEME}>
          <ArtilleryPanel />
        </ConfigProvider>
      </Zone>

      {/* Collapse/expand toggle: outside the zones so it stays put in both states. */}
      {topRect && (
        <div className="overlay-toggle" style={{ left: togglePos.x, top: togglePos.y }}>
          <Tooltip title={hidden ? 'Expand overlay' : 'Collapse overlay'} placement="bottom">
            <Button
              size="small"
              icon={hidden ? <ExpandAltOutlined style={{ color: C.accent }} /> : <ShrinkOutlined />}
              onClick={toggleUi}
              aria-label={hidden ? 'Expand overlay' : 'Collapse overlay'}
            />
          </Tooltip>
        </div>
      )}

      {/* Collapsed: the active firing solution stays readable next to the toggle. */}
      <div
        className={`mini-launcher${hidden ? '' : ' zone-hidden'}`}
        style={{
          left: togglePos.x + TOGGLE_SIZE + 6,
          top: togglePos.y,
          height: TOGGLE_SIZE,
          display: 'flex',
          alignItems: 'center',
          pointerEvents: 'none'
        }}
      >
        <ArtilleryReadout />
      </div>

      {/* Artillery mode clears the bottom strip so the whole map is usable. */}
      <Zone rect={z?.bottom} hidden={hidden || artyOn} collapseTo={collapseTo}>
        {!auth?.authenticated ? (
          <AuthPanel />
        ) : (
          <div className="scroll-y" style={{ padding: 12 }}>
            {/* Keep panels mounted (like Tabs did) so task state survives switching. */}
            <div style={{ display: activeTab === 'logi' ? undefined : 'none', height: '100%' }}>
              <LogisticsPanel />
            </div>
            <div style={{ display: activeTab === 'bunker' ? undefined : 'none', height: '100%' }}>
              <BunkerSupplyPanel />
            </div>
            <div style={{ display: activeTab === 'pilot' ? undefined : 'none' }}>
              <PilotMissionPanel />
            </div>
          </div>
        )}
      </Zone>

      <SettingsPanel open={showSettings} onClose={() => setShowSettings(false)} />
      <IngestSheet stockpile={ingest} onClose={() => setIngest(null)} />
    </>
  )
}
