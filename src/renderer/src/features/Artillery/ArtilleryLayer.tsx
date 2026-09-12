import { useEffect, useMemo, useRef, useState } from 'react'
import { Dropdown, type MenuProps } from 'antd'
import { AimOutlined, DeleteOutlined } from '@ant-design/icons'
import { C } from '../../theme/graphite'
import { useArtillery, type ArtyUnit } from './store'
import GridLines from './GridLines'
import UnitMarker, { labelShadow } from './UnitMarker'
import CalibrationPane from './CalibrationPane'
import { HIT_FILL } from './ui'
import { GUN_ICON, SHELL_ICON, platformIcon } from './icons'
import { SHELLS, platformsOf, specsOf } from './lib/platforms'
import { solve, windOffset } from './lib/solution'
import { add, type Vec } from './lib/vector'
import { CELL, defaultViewport, panByPx, toScreen, toWorld, zoomAt, type Viewport } from './lib/viewport'

interface Props {
  /** Overlay UI collapsed (Alt+X): draw nothing. */
  hidden: boolean
}

interface ContextMenuState {
  x: number
  y: number
  world: Vec
  unitId?: string
}

/** Latest viewport straight from the store (for native listeners / key handlers). */
function currentViewport(): Viewport {
  return useArtillery.getState().viewport ?? defaultViewport(window.innerWidth, window.innerHeight)
}

function useWindowSize(): { w: number; h: number } {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  useEffect(() => {
    const onResize = (): void => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return size
}

const menuIcon: React.CSSProperties = { width: 18, height: 18, objectFit: 'contain' }

/** React bubbles events from portals (the context menu and its submenus) up the
 *  component tree, not the DOM. Without this check, pressing a menu item would
 *  reach the layer's pointerdown, close the menu, and the click would be lost. */
function fromPortal(e: React.SyntheticEvent): boolean {
  return !(e.currentTarget as Node).contains(e.target as Node)
}

function platformMenu(prefix: string): NonNullable<MenuProps['items']> {
  return SHELLS.map((shell) => ({
    key: `${prefix}shell:${shell.id}`,
    label: shell.label,
    icon: <img src={SHELL_ICON[shell.id]} alt="" style={menuIcon} />,
    children: platformsOf(shell.id).map((p) => ({
      key: `${prefix}${p.id}`,
      label: p.name,
      icon: <img src={platformIcon(p.id)} alt="" style={menuIcon} />
    }))
  }))
}

/**
 * Shell-trajectory style arc from gun to target. It bows sideways off the
 * gun→target line (towards the upper side where there is one) rather than
 * rising straight up, so it visibly leaves the pin's tip — the exact launch
 * point — instead of running up the pin's body.
 */
function arc(g: Vec, t: Vec): { d: string; apex: Vec } {
  const dx = t.x - g.x
  const dy = t.y - g.y
  const len = Math.hypot(dx, dy) || 1
  // Unit normal to the line, on the side facing up (or right when vertical).
  let nx = dy / len
  let ny = -dx / len
  if (ny > 0 || (ny === 0 && nx < 0)) {
    nx = -nx
    ny = -ny
  }
  const bow = 0.3 * len
  const c = { x: (g.x + t.x) / 2 + nx * bow, y: (g.y + t.y) / 2 + ny * bow }
  return {
    d: `M ${g.x} ${g.y} Q ${c.x} ${c.y}, ${t.x} ${t.y}`,
    // Quadratic midpoint (t = ½) sits halfway between the chord and the control point.
    apex: { x: (g.x + t.x) / 4 + c.x / 2, y: (g.y + t.y) / 4 + c.y / 2 }
  }
}

function ring(c: Vec, r: number): string {
  return `M ${c.x - r} ${c.y} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`
}

/**
 * Full-screen artillery map layer. It's pointer-events:none in every mode, so the
 * game gets clicks, drags and the wheel — except on the markers, which stay
 * draggable and right-clickable. Edit mode draws the grid, and main reports
 * right-clicks on the game (global input hook) to open the place menu; without
 * the hook, Edit mode falls back to capturing the mouse.
 */
export default function ArtilleryLayer({ hidden }: Props): React.ReactElement | null {
  const mode = useArtillery((s) => s.mode)
  const calibrating = useArtillery((s) => s.calibrating)
  const storedVp = useArtillery((s) => s.viewport)
  const units = useArtillery((s) => s.units)
  const activeGunId = useArtillery((s) => s.activeGunId)
  const activeTargetId = useArtillery((s) => s.activeTargetId)
  const selectedId = useArtillery((s) => s.selectedId)
  const mapProbe = useArtillery((s) => s.mapProbe)
  const detecting = useArtillery((s) => s.detecting)
  const wind = useArtillery((s) => s.wind)
  const lastPlatform = useArtillery((s) => s.lastPlatform)
  const setViewport = useArtillery((s) => s.setViewport)
  const setMode = useArtillery((s) => s.setMode)
  const addUnit = useArtillery((s) => s.addUnit)
  const removeUnit = useArtillery((s) => s.removeUnit)
  const setPlatform = useArtillery((s) => s.setPlatform)
  const select = useArtillery((s) => s.select)

  const size = useWindowSize()
  const vp = storedVp ?? defaultViewport(size.w, size.h)
  const rootRef = useRef<HTMLDivElement>(null)
  const [ctx, setCtx] = useState<ContextMenuState | null>(null)
  /** Main reports right-clicks made through the click-through layer (Edit
   *  mode). false = its input hook can't run, so the layer takes the mouse. */
  const [clickHook, setClickHook] = useState<boolean | null>(null)

  const visible = mode !== 'off' && !hidden
  const editing = visible && mode === 'edit' && !calibrating
  /** Edit mode without the hook: fall back to capturing the mouse ourselves. */
  const capturing = editing && clickHook === false

  // Focus the layer on entering Edit so Esc / Delete / arrows reach it
  // (only effective once the window itself has focus, i.e. after a click).
  useEffect(() => {
    if (editing) rootRef.current?.focus({ preventScroll: true })
    else setCtx(null)
  }, [editing])

  // Edit mode only draws the grid: left clicks, drags and the wheel go to the
  // game. A right-click on the map opens the place menu where it was made.
  useEffect(() => {
    if (!editing) return
    let cancelled = false
    const off = window.api.overlay.onMapRightClick((p) => setCtx({ ...p, world: toWorld(currentViewport(), p) }))
    window.api.overlay.setMapClicks(true).then((ok) => !cancelled && setClickHook(ok))
    return () => {
      cancelled = true
      off()
      void window.api.overlay.setMapClicks(false)
    }
  }, [editing])

  const guns = useMemo(() => units.filter((u) => u.kind === 'gun'), [units])
  const activeGun = guns.find((u) => u.id === activeGunId)
  const activeTarget = units.find((u) => u.kind === 'target' && u.id === activeTargetId)

  if (!visible) return null
  if (calibrating) return <CalibrationPane vp={vp} kind={calibrating} />

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (fromPortal(e)) return
    const cur = currentViewport()
    switch (e.key) {
      case 'Escape':
        if (ctx) setCtx(null)
        else if (editing) setMode('locked')
        else return
        break
      case 'Delete':
      case 'Backspace':
        if (selectedId) removeUnit(selectedId)
        break
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight': {
        // Moving the map is Edit-only; Locked keeps the grid where it is.
        if (!editing) return
        if (e.ctrlKey) {
          // Fine zoom ±0.1% around the screen centre.
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            const f = e.key === 'ArrowUp' ? 1.001 : 0.999
            setViewport(zoomAt(cur, cur.zoom * f, { x: size.w / 2, y: size.h / 2 }))
          }
          break
        }
        // 1 px nudge, or a whole grid cell with Shift.
        const m = e.shiftKey ? CELL * cur.zoom : 1
        const dx = e.key === 'ArrowLeft' ? -m : e.key === 'ArrowRight' ? m : 0
        const dy = e.key === 'ArrowUp' ? -m : e.key === 'ArrowDown' ? m : 0
        setViewport(panByPx(cur, dx, dy))
        break
      }
      default:
        return
    }
    e.preventDefault()
  }

  const onMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (!ctx) return
    if (key === 'target') addUnit('target', ctx.world)
    else if (key === 'quick-gun') addUnit('gun', ctx.world)
    else if (key.startsWith('gun:')) addUnit('gun', ctx.world, key.slice(4))
    else if (key === 'delete' && ctx.unitId) removeUnit(ctx.unitId)
    else if (key.startsWith('platform:') && ctx.unitId) setPlatform(ctx.unitId, key.slice(9))
    setCtx(null)
  }

  const ctxUnit: ArtyUnit | undefined = ctx?.unitId ? units.find((u) => u.id === ctx.unitId) : undefined
  const menuItems: MenuProps['items'] = ctxUnit
    ? [
        ...(ctxUnit.kind === 'gun'
          ? [
              { key: 'platform', label: 'Platform', children: platformMenu('platform:') },
              { type: 'divider' as const }
            ]
          : []),
        { key: 'delete', label: `Delete ${ctxUnit.label}`, icon: <DeleteOutlined />, danger: true }
      ]
    : [
        {
          key: 'quick-gun',
          label: `Place gun — ${specsOf(lastPlatform)?.name ?? 'gun'}`,
          icon: <img src={platformIcon(lastPlatform)} alt="" style={menuIcon} />
        },
        {
          key: 'gun',
          label: 'Place gun',
          icon: <img src={GUN_ICON} alt="" style={menuIcon} />,
          children: platformMenu('gun:')
        },
        { key: 'target', label: 'Place target', icon: <AimOutlined style={{ color: C.danger }} /> }
      ]

  // ---- geometry (screen space) ----
  const sol = activeGun && activeTarget ? solve(activeGun, activeGun.platform, activeTarget, wind) : null
  const gunSpecs = specsOf(activeGun?.platform)
  const ringCentre = activeGun ? toScreen(vp, add(activeGun, windOffset(activeGun.platform, wind))) : null
  const tScreen = activeTarget ? toScreen(vp, activeTarget) : null
  const activeArc = activeGun && tScreen ? arc(toScreen(vp, activeGun), tScreen) : null
  const aimScreen = sol && wind.tier > 0 && gunSpecs ? toScreen(vp, sol.aim) : null

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      // The wheel over the map belongs to the game (it zooms the in-game map):
      // App's hover tracker releases the mouse on a wheel step here.
      data-wheel-through=""
      onKeyDown={onKeyDown}
      // Capture phase, before a marker's stopPropagation: clicking a pin (even in
      // Locked mode) focuses the layer so Delete / Esc reach it.
      onPointerDownCapture={(e) => {
        if (!fromPortal(e)) rootRef.current?.focus({ preventScroll: true })
      }}
      onPointerDown={(e) => {
        if (fromPortal(e)) return
        setCtx(null)
      }}
      // Only reached while the layer takes the mouse (a menu is open, or Edit
      // mode without the input hook): a right-click there (re)opens the menu.
      onContextMenu={(e) => {
        e.preventDefault()
        if (!editing || fromPortal(e)) return
        const p = { x: e.clientX, y: e.clientY }
        setCtx({ ...p, world: toWorld(vp, p) })
      }}
      style={{
        position: 'fixed',
        inset: 0,
        outline: 'none',
        // Click-through in every mode except on the markers — the grid is only
        // drawn, never dragged. While a menu is open the layer takes the mouse, so
        // a click on the map closes the menu instead of going to the game and
        // leaving the menu stuck open.
        pointerEvents: capturing || ctx ? 'auto' : 'none',
        // Windows passes clicks through fully transparent pixels.
        background: capturing || ctx ? HIT_FILL : undefined,
        // Map watch: never paint over the corner main is capturing, or our own
        // drawings would hide the game's map icon from it.
        clipPath: mapProbe
          ? `path(evenodd, "M0 0H${size.w}V${size.h}H0Z M${mapProbe.x} ${mapProbe.y}h${mapProbe.w}v${mapProbe.h}h${-mapProbe.w}Z")`
          : undefined,
        cursor: 'crosshair'
      }}
    >
      {capturing && <div className="interactive-tint" />}

      <svg width={size.w} height={size.h} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        {/* Hidden during auto-detect: our lines would be read as the game's. */}
        {editing && !detecting && <GridLines vp={vp} width={size.w} height={size.h} />}

        {/* Active gun reach: min–max range annulus, shifted downwind. */}
        {ringCentre && gunSpecs && (
          <path
            d={ring(ringCentre, gunSpecs.MAX_RANGE * vp.zoom) + ring(ringCentre, gunSpecs.MIN_RANGE * vp.zoom)}
            fillRule="evenodd"
            fill={C.danger}
            fillOpacity={0.1}
            stroke={C.danger}
            strokeOpacity={0.6}
            strokeWidth={1}
          />
        )}

        {/* Other guns → active target. */}
        {tScreen &&
          guns
            .filter((g) => g.id !== activeGunId)
            .map((g) => (
              <path
                key={g.id}
                d={arc(toScreen(vp, g), tScreen).d}
                fill="none"
                stroke={C.text2}
                strokeOpacity={0.55}
                strokeWidth={1.5}
                strokeDasharray="8 6"
              />
            ))}

        {/* Spread at the target for the active gun's current distance. */}
        {tScreen && sol?.spread != null && (
          <circle
            cx={tScreen.x}
            cy={tScreen.y}
            r={sol.spread * vp.zoom}
            fill={C.warning}
            fillOpacity={0.15}
            stroke={C.warning}
            strokeOpacity={0.7}
          />
        )}

        {/* Where to actually aim once wind is applied. */}
        {tScreen && aimScreen && (
          <g stroke={C.accentHover} strokeWidth={1.5} fill="none">
            <line x1={tScreen.x} y1={tScreen.y} x2={aimScreen.x} y2={aimScreen.y} strokeDasharray="3 3" strokeOpacity={0.8} />
            <circle cx={aimScreen.x} cy={aimScreen.y} r={6} />
            <line x1={aimScreen.x - 10} y1={aimScreen.y} x2={aimScreen.x + 10} y2={aimScreen.y} />
            <line x1={aimScreen.x} y1={aimScreen.y - 10} x2={aimScreen.x} y2={aimScreen.y + 10} />
          </g>
        )}

        {activeArc && activeGun && (
          <>
            <path d={activeArc.d} fill="none" stroke="#000" strokeOpacity={0.5} strokeWidth={4} />
            <path className="arty-arc" d={activeArc.d} fill="none" stroke={C.accent} strokeWidth={2} strokeDasharray="20 8" />
            {/* Launch point: a ring pulsing out from the gun's exact position. */}
            <circle
              className="arty-launch"
              cx={toScreen(vp, activeGun).x}
              cy={toScreen(vp, activeGun).y}
              r={6}
              fill="none"
              stroke={C.accent}
              strokeWidth={2}
            />
          </>
        )}
      </svg>

      {units.map((u) => (
        <UnitMarker
          key={u.id}
          unit={u}
          vp={vp}
          active={u.id === activeGunId || u.id === activeTargetId}
          selected={u.id === selectedId}
          onContextMenu={(unitId, x, y) => setCtx({ x, y, world: toWorld(vp, { x, y }), unitId })}
        />
      ))}

      {activeArc && sol && (
        <div
          style={{
            position: 'absolute',
            left: activeArc.apex.x,
            top: activeArc.apex.y,
            transform: 'translate(-50%, -50%)',
            padding: '2px 8px',
            borderRadius: 6,
            background: C.bg1,
            border: `1px solid ${sol.inRange === false ? C.danger : C.accentLine}`,
            color: sol.inRange === false ? C.danger : C.text1,
            fontFamily: 'monospace',
            fontSize: 12,
            whiteSpace: 'nowrap',
            textShadow: labelShadow,
            pointerEvents: 'none'
          }}
        >
          {sol.distance.toFixed(1)} m · {sol.azimuth.toFixed(1)}°
        </div>
      )}

      {ctx && (
        <Dropdown
          key={`${ctx.x},${ctx.y}`}
          open
          onOpenChange={(open) => !open && setCtx(null)}
          menu={{ items: menuItems, onClick: onMenuClick }}
          trigger={['contextMenu']}
        >
          <div style={{ position: 'absolute', left: ctx.x, top: ctx.y, width: 1, height: 1, pointerEvents: 'none' }} />
        </Dropdown>
      )}
    </div>
  )
}
