import { useApp, iconUrl } from '../stores/appStore'

interface Props {
  /** an item icon filename (e.g. "Oil.png") or a code_name to resolve via catalog */
  icon?: string
  code?: string
  size?: number
  title?: string
}

// Icons are loaded by URL straight from the backend host (cacheable, updatable
// server-side without shipping a new overlay build). No secret travels with an
// image GET, so this is safe to do in the renderer.
export function ItemIcon({ icon, code, size = 28, title }: Props): React.ReactElement {
  const itemsByCode = useApp((s) => s.itemsByCode)
  const resolved = icon ?? (code ? itemsByCode[code]?.icon : undefined)
  const url = iconUrl(resolved)
  return (
    <img
      src={url}
      width={size}
      height={size}
      title={title ?? code ?? resolved}
      alt={title ?? code ?? resolved ?? 'item'}
      style={{ objectFit: 'contain', verticalAlign: 'middle' }}
      onError={(e) => {
        ;(e.currentTarget as HTMLImageElement).style.visibility = 'hidden'
      }}
    />
  )
}

export default ItemIcon
