import { useRef } from 'react'
import { C } from '../../theme/graphite'

interface Props {
  /** Wind tier 0–5. */
  value: number
  onChange: (tier: number) => void
}

const CELL_W = 14
const GAP = 4
const MAX_H = 26

function tierColor(tier: number): string {
  if (tier <= 2) return C.positive
  if (tier === 3) return C.warning
  return C.danger
}

/** Signal-strength style tier picker: a "0" cell plus five rising bars. Click or
 *  drag across to set, wheel to step. */
export default function WindPowerBar({ value, onChange }: Props): React.ReactElement {
  const dragging = useRef(false)

  const pick = (e: React.PointerEvent<HTMLDivElement>): void => {
    const box = e.currentTarget.getBoundingClientRect()
    const tier = Math.min(5, Math.max(0, Math.floor((e.clientX - box.left) / (CELL_W + GAP))))
    if (tier !== value) onChange(tier)
  }

  const lit = tierColor(value)

  return (
    <div
      role="slider"
      aria-label="Wind tier"
      aria-valuemin={0}
      aria-valuemax={5}
      aria-valuenow={value}
      style={{ display: 'flex', alignItems: 'flex-end', gap: GAP, height: MAX_H, cursor: 'pointer', touchAction: 'none' }}
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
      onWheel={(e) => onChange(Math.min(5, Math.max(0, value + (e.deltaY > 0 ? -1 : 1))))}
    >
      <div
        style={{
          width: CELL_W,
          height: CELL_W,
          borderRadius: '50%',
          border: `1.5px solid ${value === 0 ? C.text2 : C.line2}`,
          boxSizing: 'border-box',
          fontSize: 9,
          lineHeight: `${CELL_W - 3}px`,
          textAlign: 'center',
          color: value === 0 ? C.text1 : C.text4
        }}
      >
        0
      </div>
      {[1, 2, 3, 4, 5].map((tier) => (
        <div
          key={tier}
          style={{
            width: CELL_W,
            height: 6 + (tier * (MAX_H - 6)) / 5,
            borderRadius: 3,
            background: tier <= value ? lit : C.line2,
            boxShadow: tier <= value ? `0 0 6px ${lit}55` : 'none',
            transition: 'background 0.12s, box-shadow 0.12s'
          }}
        />
      ))}
    </div>
  )
}
