import { useEffect, useRef, useState } from 'react'
import { App as AntdApp } from 'antd'
import { C } from '../../theme/graphite'
import { useArtillery, type CalibrationKind } from './store'
import { ARTY_SURFACE, HIT_FILL } from './ui'
import { HEX_HEIGHT, MIN_HEX_DRAG_PX, calibrateFromHexHeight, calibrateFromRect, type Viewport } from './lib/viewport'
import type { Vec } from './lib/vector'

interface Props {
  vp: Viewport
  kind: CalibrationKind
}

/** Half-length of the horizontal guides drawn at both ends of a hex drag, px. */
const GUIDE_HALF = 140

const HINT: Record<CalibrationKind, string> = {
  cell: 'Calibrating grid — drag from one corner of a map grid cell to the opposite corner.',
  hex: "Calibrating by hex height — drag from the region's top edge straight down to its bottom edge."
}

/**
 * Full-screen pane for manual calibration.
 * - cell: drag from one corner of an in-game grid cell to the opposite corner to
 *   set scale + alignment (fox-fall lib/grid-calibration.ts).
 * - hex: drag between a region hex's flat top and bottom edges to set the scale
 *   when the map is zoomed out too far for the game to draw its grid.
 */
export default function CalibrationPane({ vp, kind }: Props): React.ReactElement {
  const { message } = AntdApp.useApp()
  const setViewport = useArtillery((s) => s.setViewport)
  const setCalibrating = useArtillery((s) => s.setCalibrating)
  const [rect, setRect] = useState<{ a: Vec; b: Vec } | null>(null)
  const dragging = useRef(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setCalibrating(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setCalibrating])

  const finish = (a: Vec, b: Vec): void => {
    if (kind === 'hex') {
      const next = calibrateFromHexHeight(vp, a, b)
      if (!next) {
        message.warning("Too short — drag from the hex's top edge all the way to its bottom edge.")
        return
      }
      setViewport(next)
      setCalibrating(false)
      message.success(`Scale calibrated from hex height: ${Math.abs(b.y - a.y).toFixed(0)} px = ${HEX_HEIGHT.toFixed(0)} m.`)
      return
    }
    const next = calibrateFromRect(vp, a, b)
    if (!next) {
      message.warning('Too small — drag across a whole grid cell.')
      return
    }
    setViewport(next)
    setCalibrating(false)
    message.success('Grid calibrated.')
  }

  const x = rect ? Math.min(rect.a.x, rect.b.x) : 0
  const y = rect ? Math.min(rect.a.y, rect.b.y) : 0
  const span = rect ? Math.abs(rect.b.y - rect.a.y) : 0

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 10, pointerEvents: 'auto', background: HIT_FILL, cursor: 'crosshair' }}
      onContextMenu={(e) => {
        e.preventDefault()
        setCalibrating(false)
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        dragging.current = true
        const p = { x: e.clientX, y: e.clientY }
        setRect({ a: p, b: p })
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return
        setRect((r) => (r ? { a: r.a, b: { x: e.clientX, y: e.clientY } } : r))
      }}
      onPointerUp={(e) => {
        if (!dragging.current || !rect) return
        dragging.current = false
        e.currentTarget.releasePointerCapture(e.pointerId)
        setRect(null)
        finish(rect.a, { x: e.clientX, y: e.clientY })
      }}
    >
      <div className="interactive-tint" />
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '8px 14px',
          borderRadius: 8,
          background: ARTY_SURFACE,
          border: `1px solid ${C.accentLine}`,
          color: C.text1,
          fontSize: 13,
          whiteSpace: 'nowrap',
          pointerEvents: 'none'
        }}
      >
        {HINT[kind]}
        <span style={{ color: C.text3 }}> Esc / right-click to cancel</span>
      </div>
      {rect && kind === 'cell' && (
        <div
          style={{
            position: 'absolute',
            left: x,
            top: y,
            width: Math.abs(rect.b.x - rect.a.x),
            height: Math.abs(rect.b.y - rect.a.y),
            border: `1px solid ${C.accent}`,
            background: C.accentWeak,
            boxShadow: '0 0 0 1px rgba(0,0,0,.6)',
            pointerEvents: 'none'
          }}
        />
      )}
      {rect && kind === 'hex' && (
        // Vertical span from the start point, with horizontal guides at both ends
        // to line up with the hex's flat edges; only the height is measured.
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          {[
            { stroke: '#000', width: 3, opacity: 0.6 },
            { stroke: span >= MIN_HEX_DRAG_PX ? C.accent : C.danger, width: 1, opacity: 1 }
          ].map((pass, i) => (
            <g key={i} stroke={pass.stroke} strokeWidth={pass.width} strokeOpacity={pass.opacity}>
              <line x1={rect.a.x - GUIDE_HALF} y1={rect.a.y} x2={rect.a.x + GUIDE_HALF} y2={rect.a.y} />
              <line x1={rect.a.x - GUIDE_HALF} y1={rect.b.y} x2={rect.a.x + GUIDE_HALF} y2={rect.b.y} />
              <line x1={rect.a.x} y1={rect.a.y} x2={rect.a.x} y2={rect.b.y} strokeDasharray="6 4" />
            </g>
          ))}
          <text
            x={rect.a.x + 8}
            y={(rect.a.y + rect.b.y) / 2}
            dominantBaseline="middle"
            fill={C.text1}
            stroke="#000"
            strokeWidth={3}
            paintOrder="stroke"
            fontSize={12}
            fontFamily="monospace"
          >
            {span.toFixed(0)} px = {HEX_HEIGHT.toFixed(0)} m
          </text>
        </svg>
      )}
    </div>
  )
}
