import { useRef } from 'react'
import { C } from '../../theme/graphite'
import { toDegrees, wrapDegrees } from './lib/vector'

interface Props {
  /** Degrees the wind blows toward (multiple of 5). */
  value: number
  onChange: (azimuth: number) => void
  size?: number
}

const TICKS = Array.from({ length: 72 }, (_, i) => i * 5)
const CARDINALS: Array<[string, number]> = [['N', 0], ['E', 90], ['S', 180], ['W', 270]]

/** Click/drag compass that snaps to 5° steps (fox-fall DirectionAlternateInput). */
export default function WindCompass({ value, onChange, size = 104 }: Props): React.ReactElement {
  const dragging = useRef(false)
  const c = size / 2
  const r = c - 3

  const pick = (e: React.PointerEvent<SVGSVGElement>): void => {
    const box = e.currentTarget.getBoundingClientRect()
    const dx = e.clientX - (box.left + box.width / 2)
    const dy = e.clientY - (box.top + box.height / 2)
    if (Math.hypot(dx, dy) < 4) return
    const az = wrapDegrees(Math.round((toDegrees(Math.atan2(dy, dx)) + 90) / 5) * 5)
    if (az !== value) onChange(az)
  }

  const polar = (az: number, radius: number): { x: number; y: number } => {
    const a = ((az - 90) * Math.PI) / 180
    return { x: c + radius * Math.cos(a), y: c + radius * Math.sin(a) }
  }

  return (
    <svg
      width={size}
      height={size}
      style={{ cursor: 'pointer', flexShrink: 0, touchAction: 'none' }}
      onPointerDown={(e) => {
        dragging.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        pick(e)
      }}
      onPointerMove={(e) => dragging.current && pick(e)}
      onPointerUp={(e) => {
        dragging.current = false
        e.currentTarget.releasePointerCapture(e.pointerId)
      }}
      onWheel={(e) => onChange(wrapDegrees(value + (e.deltaY > 0 ? 5 : -5)))}
    >
      <circle cx={c} cy={c} r={r} fill={C.bg1} stroke={C.line2} />
      {TICKS.map((az) => {
        const len = az % 45 === 0 ? 7 : az % 15 === 0 ? 4.5 : 2.5
        const a = polar(az, r - 1)
        const b = polar(az, r - 1 - len)
        return (
          <line
            key={az}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={az % 45 === 0 ? C.text2 : C.text4}
            strokeWidth={az % 45 === 0 ? 1.5 : 1}
          />
        )
      })}
      {CARDINALS.map(([label, az]) => {
        const p = polar(az, r - 17)
        return (
          <text
            key={label}
            x={p.x}
            y={p.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={11}
            fontWeight={label === 'N' ? 700 : 500}
            fill={label === 'N' ? C.accent : C.text3}
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {label}
          </text>
        )
      })}
      {/* Arrow points the way the wind blows. */}
      <g transform={`rotate(${value} ${c} ${c})`} style={{ pointerEvents: 'none' }}>
        <line x1={c} y1={c + r * 0.45} x2={c} y2={c - r + 12} stroke={C.accent} strokeWidth={2.5} strokeLinecap="round" />
        <polygon points={`${c},${c - r + 6} ${c - 6},${c - r + 17} ${c + 6},${c - r + 17}`} fill={C.accent} />
        <circle cx={c} cy={c} r={3} fill={C.accent} />
      </g>
    </svg>
  )
}
