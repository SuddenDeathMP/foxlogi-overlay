import { useRef } from 'react'
import { C } from '../../theme/graphite'
import { platformIcon } from './icons'
import { useArtillery, type ArtyUnit } from './store'
import { toScreen, type Viewport } from './lib/viewport'

interface Props {
  unit: ArtyUnit
  vp: Viewport
  active: boolean
  selected: boolean
  onContextMenu: (unitId: string, clientX: number, clientY: number) => void
}

/** Target reticle: outer size, ring radius, and the clear gap around the centre. */
const RETICLE = 30
const RING_R = 9
const GAP_R = 5

// Gun pin: a map-pin teardrop whose tip is the gun's exact position.
const PIN_W = 32
const PIN_H = 42
const PIN_PATH = `M16 ${PIN_H} C10 32 2 25 2 16 A14 14 0 1 1 30 16 C30 25 22 32 16 ${PIN_H} Z`
/** Centre of the pin's round head, relative to the tip. */
const HEAD_Y = 16 - PIN_H

export const labelShadow = '0 0 3px #000, 0 0 2px #000, 0 0 1px #000'

/** A gun pin / target reticle on the map. Left-drag moves it, right-click opens its
 *  menu — in every mode: markers opt back into pointer events even when the layer
 *  is click-through (Locked), so the hover tracker makes just the pin interactive. */
export default function UnitMarker({ unit, vp, active, selected, onContextMenu }: Props): React.ReactElement {
  const moveUnit = useArtillery((s) => s.moveUnit)
  const select = useArtillery((s) => s.select)
  const drag = useRef<{ cx: number; cy: number; x: number; y: number; zoom: number } | null>(null)

  const s = toScreen(vp, unit)
  const isGun = unit.kind === 'gun'
  const color = isGun ? C.accent : C.danger

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    e.stopPropagation()
    select(unit.id)
    drag.current = { cx: e.clientX, cy: e.clientY, x: unit.x, y: unit.y, zoom: vp.zoom }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const d = drag.current
    if (!d) return
    moveUnit(unit.id, { x: d.x + (e.clientX - d.cx) / d.zoom, y: d.y + (e.clientY - d.cy) / d.zoom })
  }
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!drag.current) return
    drag.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const label = (
    <div
      style={{
        position: 'absolute',
        left: 0,
        // Guns: above the pin head. Targets: under the reticle.
        top: isGun ? -PIN_H - 2 : RETICLE / 2,
        transform: isGun ? 'translate(-50%, -100%)' : 'translateX(-50%)',
        whiteSpace: 'nowrap',
        fontSize: 11,
        fontWeight: active ? 600 : 400,
        color: active ? color : C.text1,
        textShadow: labelShadow,
        pointerEvents: 'none'
      }}
    >
      {unit.label}
    </div>
  )

  return (
    // Zero-size anchor at the unit's exact screen position; children hang off it.
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        select(unit.id)
        onContextMenu(unit.id, e.clientX, e.clientY)
      }}
      style={{
        position: 'absolute',
        left: s.x,
        top: s.y,
        width: 0,
        height: 0,
        pointerEvents: 'auto',
        cursor: 'grab',
        opacity: active ? 1 : 0.8,
        zIndex: selected ? 2 : 1
      }}
    >
      {isGun ? (
        <>
          <svg
            width={PIN_W}
            height={PIN_H}
            viewBox={`0 0 ${PIN_W} ${PIN_H}`}
            style={{
              position: 'absolute',
              left: -PIN_W / 2,
              top: -PIN_H,
              overflow: 'visible',
              filter: selected
                ? `drop-shadow(0 0 4px ${C.accentLine}) drop-shadow(0 1px 3px rgba(0,0,0,.6))`
                : 'drop-shadow(0 1px 3px rgba(0,0,0,.6))'
            }}
          >
            <path d={PIN_PATH} fill={C.bg1} stroke={active ? color : C.line2} strokeWidth={active ? 2 : 1.5} />
            {/* Exact position: dot on the pin tip. */}
            <circle cx={PIN_W / 2} cy={PIN_H} r={2.5} fill={color} stroke="#000" strokeWidth={1} />
          </svg>
          <img
            src={platformIcon(unit.platform)}
            alt=""
            draggable={false}
            style={{
              position: 'absolute',
              left: -12,
              top: HEAD_Y - 12,
              width: 24,
              height: 24,
              objectFit: 'contain',
              pointerEvents: 'none'
            }}
          />
        </>
      ) : (
        // See-through reticle: thin ring + ticks with an open centre and a dot
        // on the exact spot, each stroke over a dark halo for contrast.
        <svg
          width={RETICLE}
          height={RETICLE}
          viewBox={`${-RETICLE / 2} ${-RETICLE / 2} ${RETICLE} ${RETICLE}`}
          style={{
            position: 'absolute',
            left: -RETICLE / 2,
            top: -RETICLE / 2,
            overflow: 'visible',
            filter: selected ? `drop-shadow(0 0 3px ${color})` : undefined
          }}
        >
          {/* Invisible hit area so the open reticle is still easy to grab. */}
          <circle r={RETICLE / 2} fill="transparent" pointerEvents="all" />
          {[
            { stroke: '#000', width: (active ? 2 : 1.5) + 2, opacity: 0.55 },
            { stroke: color, width: active ? 2 : 1.5, opacity: 1 }
          ].map((pass, i) => (
            <g key={i} stroke={pass.stroke} strokeWidth={pass.width} strokeOpacity={pass.opacity} fill="none" strokeLinecap="round">
              <circle r={RING_R} />
              <line x1={0} y1={-GAP_R} x2={0} y2={-RETICLE / 2 + 1} />
              <line x1={0} y1={GAP_R} x2={0} y2={RETICLE / 2 - 1} />
              <line x1={-GAP_R} y1={0} x2={-RETICLE / 2 + 1} y2={0} />
              <line x1={GAP_R} y1={0} x2={RETICLE / 2 - 1} y2={0} />
            </g>
          ))}
          {/* Exact position. */}
          <circle r={1.5} fill={color} stroke="#000" strokeWidth={0.75} />
        </svg>
      )}
      {label}
    </div>
  )
}
