import { useState } from 'react'
import { Button, Input, Space, Typography, App as AntdApp } from 'antd'
import { useApp } from '../../stores/appStore'

const { Paragraph, Text, Link } = Typography

export default function AuthPanel(): React.ReactElement {
  const { message } = AntdApp.useApp()
  const setAuth = useApp((s) => s.setAuth)
  const settings = useApp((s) => s.settings)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(): Promise<void> {
    if (!key.trim()) return
    setBusy(true)
    try {
      const status = await window.api.auth.setKey(key.trim())
      setAuth(status)
      if (status.authenticated) {
        setKey('')
        message.success('Connected.')
      } else {
        message.error('Key was not accepted by the server.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={10}>
      <Text strong>Connect with an API key</Text>
      <Paragraph type="secondary" style={{ marginBottom: 4 }}>
        Generate a personal key (<Text code>fxl_…</Text>) in the web app under{' '}
        <Link href={`${settings?.host ?? ''}/settings`} target="_blank">
          Settings → API keys
        </Link>
        , then paste it here.
      </Paragraph>
      <Input.Password
        placeholder="fxl_..."
        value={key}
        onChange={(e) => setKey(e.target.value)}
        onPressEnter={submit}
        autoComplete="off"
      />
      <Button type="primary" block loading={busy} onClick={submit}>
        Connect
      </Button>
    </Space>
  )
}
