import { useEffect, useState } from 'react'
import { App as AntdApp, Button, Tooltip } from 'antd'
import { ExpandAltOutlined } from '@ant-design/icons'
import { C } from './theme/graphite'
import { useApp } from './stores/appStore'
import { call } from './lib/api'
import type { LogiItem, ParsedStockpile } from '@shared/types'
import type { ResolvedZones } from '@shared/zones'
import Zone from './components/Zone'
import TopBanner from './features/Auth/TopBanner'
import AuthPanel from './features/Auth/AuthPanel'
import SettingsPanel from './features/Settings/SettingsPanel'
import LogisticsPanel from './features/Logistics/LogisticsPanel'
import BunkerSupplyPanel from './features/BunkerSupply/BunkerSupplyPanel'
import PilotMissionPanel from './features/PilotMission/PilotMissionPanel'
import IngestSheet from './features/Logistics/IngestSheet'

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

  const [showSettings, setShowSettings] = useState(false)
  const [ingest, setIngest] = useState<ParsedStockpile | null>(null)
  const [activeTab, setActiveTab] = useState('logi')
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('overlay-collapsed') === '1')

  useEffect(() => {
    localStorage.setItem('overlay-collapsed', collapsed ? '1' : '0')
  }, [collapsed])

  // Hover-driven interactivity: the window is click-through, but forwarded
  // mousemove still hit-tests the DOM. Over a UI element (anything but the
  // transparent body) → accept the mouse; off it → back to click-through after
  // a short grace period so tiny gaps between elements don't flicker.
  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | undefined
    let active = false

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

    document.addEventListener('mousemove', onMove, true)
    document.addEventListener('mouseout', onLeave, true)
    return () => {
      document.removeEventListener('mousemove', onMove, true)
      document.removeEventListener('mouseout', onLeave, true)
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
      window.api.overlay.onToggleUi(() => setCollapsed((c) => !c)),
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
  // Where collapsing zones fly to: the centre of the mini-launcher button.
  const launcherPos = { x: (z?.top?.x ?? 12) + 4, y: (z?.top?.y ?? 0) + 6 }
  const collapseTo = { x: launcherPos.x + 20, y: launcherPos.y + 20 }

  return (
    <>
      <Zone rect={z?.top} hidden={collapsed} collapseTo={collapseTo}>
        <TopBanner
          onOpenSettings={() => setShowSettings(true)}
          tab={activeTab}
          onTabChange={setActiveTab}
          onCollapse={() => setCollapsed(true)}
        />
      </Zone>

      {/* Collapsed mode: everything folds into this one small launcher. */}
      <div
        className={`mini-launcher${collapsed ? '' : ' zone-hidden'}`}
        style={{ left: launcherPos.x, top: launcherPos.y }}
      >
        <Tooltip title="Expand overlay" placement="right">
          <Button
            shape="circle"
            // type="primary"
            size="large"
            icon={<ExpandAltOutlined style={{ color: C.accent }}/>}
            onClick={() => setCollapsed(false)}
          />
        </Tooltip>
      </div>

      <Zone rect={z?.bottom} hidden={collapsed} collapseTo={collapseTo}>
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
