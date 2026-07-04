import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Tag, Typography } from 'antd'
import { useApp, iconUrl } from '../../../stores/appStore'
import type { LogiItem } from '@shared/types'

const { Text } = Typography

/** Portals children into the drawer title row (TaskSheet renders #task-sheet-extra). */
export function HeaderExtra({ children }: { children: ReactNode }): React.ReactElement | null {
  const [el, setEl] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setEl(document.getElementById('task-sheet-extra'))
  }, [])
  return el ? createPortal(children, el) : null
}

export function useItem(typeId: string | number | undefined): LogiItem | undefined {
  const byId = useApp((s) => s.itemsById)
  if (typeId == null) return undefined
  return byId[String(typeId)]
}

/** A compact icon + name row resolved from a planner type_id. */
export function ItemChip({
  typeId,
  qty,
  suffix = '',
  size = 22
}: {
  typeId: string | number
  qty?: number
  suffix?: string
  size?: number
}): React.ReactElement {
  const item = useItem(typeId)
  const url = iconUrl(item?.icon)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
        {url && (
          <img
            src={url}
            width={size}
            height={size}
            alt={item?.name ?? String(typeId)}
            style={{ objectFit: 'contain', flexShrink: 0 }}
            onError={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = 'hidden')}
          />
        )}
        <Text style={{ fontSize: 12 }} ellipsis>
          {item?.name ?? `#${typeId}`}
        </Text>
      </div>
      {qty != null && (
        <Tag style={{ marginInlineEnd: 0, flexShrink: 0 }}>
          {qty}
          {suffix}
        </Tag>
      )}
    </div>
  )
}

/** Scroll a horizontal card row with the mouse wheel (vertical delta → scrollLeft). */
export function wheelToHorizontal(e: React.WheelEvent<HTMLDivElement>): void {
  const el = e.currentTarget
  if (el.scrollWidth <= el.clientWidth) return
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
    el.scrollLeft += e.deltaY
  }
}

export const jsonBoxStyle: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 11,
  maxHeight: 200,
  overflow: 'auto',
  background: '#0c0e11',
  padding: 8,
  borderRadius: 6,
  whiteSpace: 'pre-wrap'
}
