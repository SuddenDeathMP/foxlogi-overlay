import { Select } from 'antd'
import { SHELLS, platformsOf } from './lib/platforms'
import { SHELL_ICON, platformIcon } from './icons'

interface Props {
  value: string | undefined
  onChange: (platformId: string) => void
}

const iconStyle: React.CSSProperties = { width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }

const OPTIONS = SHELLS.map((shell) => ({
  label: (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <img src={SHELL_ICON[shell.id]} alt="" style={{ ...iconStyle, width: 14, height: 14 }} />
      {shell.label}
    </span>
  ),
  title: shell.label,
  options: platformsOf(shell.id).map((p) => ({
    value: p.id,
    label: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <img src={platformIcon(p.id)} alt="" style={iconStyle} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
      </span>
    )
  }))
}))

/** Gun platform picker grouped by shell type. */
export default function PlatformSelect({ value, onChange }: Props): React.ReactElement {
  return (
    <Select
      size="small"
      value={value}
      onChange={onChange}
      options={OPTIONS}
      popupMatchSelectWidth={false}
      listHeight={320}
      style={{ width: '100%' }}
    />
  )
}
