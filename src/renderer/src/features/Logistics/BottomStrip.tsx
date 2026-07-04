import { Button, Space, Typography, App as AntdApp } from 'antd'
import { useApp } from '../../stores/appStore'
import type { ParsedStockpile } from '@shared/types'

const { Text } = Typography

interface Props {
  onIngest: (s: ParsedStockpile) => void
}

export default function BottomStrip({ onIngest }: Props): React.ReactElement {
  const { message } = AntdApp.useApp()
  const auth = useApp((s) => s.auth)
  const settings = useApp((s) => s.settings)

  async function ingest(): Promise<void> {
    const res = (await window.api.stockpile.ingestFromClipboard()) as {
      ok: boolean
      error?: string
      stockpile?: ParsedStockpile
    }
    if (res.ok && res.stockpile) onIngest(res.stockpile)
    else message.warning(res.error || 'No stockpile data on clipboard.')
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '100%',
        padding: '0 14px'
      }}
    >
      {/*<Space size={12}>*/}
      {/*  <Button type="primary" disabled={!auth?.authenticated} onClick={ingest}>*/}
      {/*    Update stockpile from clipboard*/}
      {/*  </Button>*/}
      {/*  <Text type="secondary">*/}
      {/*    Copy a stockpile in-game (TSV), then click — or press {settings?.ingestHotkey ?? 'hotkey'}.*/}
      {/*  </Text>*/}
      {/*</Space>*/}
    </div>
  )
}
