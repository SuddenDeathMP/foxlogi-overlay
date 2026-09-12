import { memo } from 'react'
import { CELL, SUBCELL, toWorld, type Viewport } from './lib/viewport'

interface Props {
  vp: Viewport
  width: number
  height: number
}

// Same look as fox-fall's Grid.vue: black cell lines, grey keypad lines.
const MAJOR = '#000000'
const MINOR = 'hsla(0, 0%, 50%, 0.8)'

/** Map grid in screen space: cell lines every 125 m, keypad lines every 125/3 m. */
function GridLines({ vp, width, height }: Props): React.ReactElement | null {
  const cellPx = CELL * vp.zoom
  if (cellPx < 4) return null // zoomed out too far to be useful

  // Keypad lines only when they're far enough apart to read.
  const step = SUBCELL * vp.zoom >= 6 ? SUBCELL : CELL
  const perCell = Math.round(CELL / step)
  const tl = toWorld(vp, { x: 0, y: 0 })
  const br = toWorld(vp, { x: width, y: height })

  const lines: React.ReactElement[] = []
  const push = (vertical: boolean, from: number, to: number): void => {
    for (let i = Math.floor(from / step); i <= Math.ceil(to / step); i++) {
      const major = ((i % perCell) + perCell) % perCell === 0
      const pos = vertical ? vp.x + i * step * vp.zoom : vp.y + i * step * vp.zoom
      lines.push(
        vertical ? (
          <line key={`v${i}`} x1={pos} x2={pos} y1={0} y2={height} stroke={major ? MAJOR : MINOR} strokeWidth={major ? 1.5 : 1} />
        ) : (
          <line key={`h${i}`} y1={pos} y2={pos} x1={0} x2={width} stroke={major ? MAJOR : MINOR} strokeWidth={major ? 1.5 : 1} />
        )
      )
    }
  }
  push(true, tl.x, br.x)
  push(false, tl.y, br.y)

  return <g shapeRendering="crispEdges">{lines}</g>
}

export default memo(GridLines)
