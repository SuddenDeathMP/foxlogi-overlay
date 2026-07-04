import type { CSSProperties, ReactNode } from 'react'
import type { PixelRect } from '@shared/zones'

interface Props {
  rect: PixelRect | undefined
  children: ReactNode
  surface?: boolean
  /** Collapsed mode: animate the zone out (scale+fade) and drop pointer events. */
  hidden?: boolean
  /** Screen point the zone should collapse toward (the mini-launcher). */
  collapseTo?: { x: number; y: number }
}

/** Absolutely-positioned overlay region. The window is click-through globally;
 *  hovering any zone flips it interactive (see the hover tracker in App). */
export function Zone({
  rect,
  children,
  surface = true,
  hidden = false,
  collapseTo
}: Props): React.ReactElement | null {
  if (!rect) return null
  // Offset from this zone's top-left to the collapse target; consumed by the
  // .zone-hidden transform so the zone flies into the launcher as it shrinks.
  const vars = collapseTo
    ? ({
        '--collapse-x': `${collapseTo.x - rect.x}px`,
        '--collapse-y': `${collapseTo.y - rect.y}px`
      } as CSSProperties)
    : undefined
  return (
    <div
      className={`overlay-zone${hidden ? ' zone-hidden' : ''}`}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, ...vars }}
    >
      {surface ? <div className="zone-surface">{children}</div> : children}
    </div>
  )
}

export default Zone
