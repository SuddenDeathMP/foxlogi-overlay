import { Button, Popconfirm, Segmented, Space, Tag, Tooltip, Typography } from 'antd'
import { PoweroffOutlined, SettingOutlined, WifiOutlined } from '@ant-design/icons'
import { useApp } from '../../stores/appStore'
import logo from '../../assets/foxlogi_logo_small.png';
const { Text } = Typography

/** One gap between every item in the bar, including after the overlay toggle. */
const GAP = 6

/** Tab value that turns the artillery calculator on (the others turn it off). */
export const ARTILLERY_TAB = 'artillery'

interface Props {
  onOpenSettings: () => void
  /** Selected tab: a bottom-panel tab, or ARTILLERY_TAB while artillery is on. */
  tab: string
  onTabChange: (tab: string) => void
  /** Width reserved on the left for the overlay toggle, which App renders
   *  outside the zone so it stays in place while the overlay is collapsed. */
  toggleSpace: number
}

export default function TopBanner({ onOpenSettings, tab, onTabChange, toggleSpace }: Props): React.ReactElement {
  const auth = useApp((s) => s.auth)
  const interactive = useApp((s) => s.interactive)
  const updateVersion = useApp((s) => s.updateVersion)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '100%',
        // Clear the toggle plus the bar's uniform gap (minus the zone surface's
        // 1px border, which already offsets content).
        padding: `0 12px 0 ${toggleSpace + GAP - 1}px`,
        gap: GAP
      }}
    >
      {/*{interactive && <div className="interactive-tint" />}*/}
      <Space size={GAP}>
        <img width="28" src={logo} alt="foxlogi" style={{marginTop: 5, opacity: 0.75}}/>
        <Popconfirm
          title="Turn off the overlay?"
          okText="Turn off"
          cancelText="Cancel"
          onConfirm={() => window.api.overlay.quit()}
        >
          <Tooltip title="Turn off overlay">
            <Button size="small" icon={<PoweroffOutlined />} aria-label="Turn off overlay" />
          </Tooltip>
        </Popconfirm>
        {/*<Text strong style={{ letterSpacing: 0.5 }}>*/}
        {/*  FOXLOGI OVERLAY*/}
        {/*</Text>*/}
        {/* authenticated: <Tag color="success">{auth.displayName || auth.username || <WifiOutlined />}</Tag> */}
        {!auth?.authenticated && <Tag color="error">not connected</Tag>}
        {/*{interactive ? (*/}
        {/*  <Tag color="gold">INTERACTIVE</Tag>*/}
        {/*) : (*/}
        {/*  <Text type="secondary">click-through — hover a panel to interact</Text>*/}
        {/*)}*/}
      </Space>
      {/* Always shown: Artillery works without an API key (the other tabs then show the sign-in panel). */}
      <Segmented
        size="small"
        value={tab}
        onChange={(v) => onTabChange(v as string)}
        options={[
          { label: 'Logistics', value: 'logi' },
          { label: 'Bunker', value: 'bunker' },
          { label: 'Pilot', value: 'pilot' },
          { label: 'Artillery', value: ARTILLERY_TAB }
        ]}
      />
      <Space size={GAP}>
        {updateVersion && <Tag color="processing">update {updateVersion} ready — restart</Tag>}
        {auth?.weakEncryption && <Tag color="warning">no keyring — key in memory only</Tag>}
        <Tooltip title="Settings">
          <Button size="small" icon={<SettingOutlined />} onClick={onOpenSettings} aria-label="Settings" />
        </Tooltip>
      </Space>
    </div>
  )
}
