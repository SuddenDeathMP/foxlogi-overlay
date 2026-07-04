import { Button, Popconfirm, Segmented, Space, Tag, Tooltip, Typography } from 'antd'
import { PoweroffOutlined, SettingOutlined, ShrinkOutlined, WifiOutlined } from '@ant-design/icons'
import { useApp } from '../../stores/appStore'
import logo from '../../assets/foxlogi_logo_small.png';
const { Text } = Typography

interface Props {
  onOpenSettings: () => void
  tab: string
  onTabChange: (tab: string) => void
  onCollapse: () => void
}

export default function TopBanner({
  onOpenSettings,
  tab,
  onTabChange,
  onCollapse
}: Props): React.ReactElement {
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
        padding: '0 12px',
        gap: 12
      }}
    >
      {/*{interactive && <div className="interactive-tint" />}*/}
      <Space size={10}>
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
        {auth?.authenticated ? (
          // <Tag color="success">{auth.displayName || auth.username || <WifiOutlined />}</Tag>
            <span></span>
        ) : (
          <Tag color="error">not connected</Tag>
        )}
        {/*{interactive ? (*/}
        {/*  <Tag color="gold">INTERACTIVE</Tag>*/}
        {/*) : (*/}
        {/*  <Text type="secondary">click-through — hover a panel to interact</Text>*/}
        {/*)}*/}
      </Space>
      {auth?.authenticated && (
        <Segmented
          size="small"
          value={tab}
          onChange={(v) => onTabChange(v as string)}
          options={[
            { label: 'Logistics', value: 'logi' },
            { label: 'Bunker', value: 'bunker' },
            { label: 'Pilot', value: 'pilot' }
          ]}
        />
      )}
      <Space size={8}>
        {updateVersion && <Tag color="processing">update {updateVersion} ready — restart</Tag>}
        {auth?.weakEncryption && <Tag color="warning">no keyring — key in memory only</Tag>}
        <Tooltip title="Settings">
          <Button size="small" icon={<SettingOutlined />} onClick={onOpenSettings} aria-label="Settings" />
        </Tooltip>
        <Tooltip title="Collapse overlay">
          <Button size="small" icon={<ShrinkOutlined />} onClick={onCollapse} aria-label="Collapse overlay" />
        </Tooltip>
      </Space>
    </div>
  )
}
