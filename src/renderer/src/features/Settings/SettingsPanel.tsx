import { useEffect, useState } from 'react'
import { Drawer, Form, Input, Select, Switch, Button, Space, App as AntdApp, Divider } from 'antd'
import { useApp } from '../../stores/appStore'
import { useArtillery } from '../Artillery/store'
import type { AppSettings } from '@shared/types'

interface Props {
  open: boolean
  onClose: () => void
}

/** Main-process settings plus renderer-only artillery options, saved together. */
type SettingsForm = AppSettings & { hideWithMap: boolean }

export default function SettingsPanel({ open, onClose }: Props): React.ReactElement {
  const { message } = AntdApp.useApp()
  const settings = useApp((s) => s.settings)
  const auth = useApp((s) => s.auth)
  const setSettings = useApp((s) => s.setSettings)
  const setAuth = useApp((s) => s.setAuth)
  const hideWithMap = useArtillery((s) => s.hideWithMap)
  const setHideWithMap = useArtillery((s) => s.setHideWithMap)
  const [displays, setDisplays] = useState<Array<{ id: number; label: string }>>([])
  const [form] = Form.useForm<SettingsForm>()

  useEffect(() => {
    if (!open) return
    window.api.settings.listDisplays().then(setDisplays)
    if (settings) form.setFieldsValue({ ...settings, hideWithMap })
  }, [open, settings, hideWithMap, form])

  async function save(): Promise<void> {
    const { hideWithMap: nextHideWithMap, ...values } = await form.validateFields()
    const next = await window.api.settings.update(values)
    setSettings(next)
    setHideWithMap(nextHideWithMap)
    message.success('Settings saved.')
  }

  async function clearKey(): Promise<void> {
    const status = await window.api.auth.clear()
    setAuth(status)
    message.info('Disconnected.')
  }

  return (
    <Drawer
      title="Overlay settings"
      open={open}
      onClose={onClose}
      width={380}
      getContainer={false}
      destroyOnHidden
      extra={
        <Button type="primary" onClick={save}>
          Save
        </Button>
      }
    >
      <Form form={form} layout="vertical" size="small">
        <Form.Item name="displayId" label="Display">
          <Select
            allowClear
            placeholder="Primary display"
            options={displays.map((d) => ({ value: d.id, label: d.label }))}
          />
        </Form.Item>
        <Form.Item name="toggleHotkey" label="Toggle hotkey" extra="Show/hide the overlay UI.">
          <Input placeholder="Alt+X" />
        </Form.Item>
        <Form.Item name="ingestHotkey" label="Stockpile ingest hotkey">
          <Input placeholder="Alt+Shift+S" />
        </Form.Item>
        <Form.Item
          name="gridDetectHotkey"
          label="Grid auto-detect hotkey"
          extra="Finds the map grid on screen and calibrates artillery (zoom the map in first)."
        >
          <Input placeholder="Alt+G" />
        </Form.Item>
        <Form.Item
          name="hideWithMap"
          label="Track the in-game map"
          valuePropName="checked"
          extra="In artillery mode, hide the overlay while the map is closed. Watches the map's search icon in the top-right corner of the screen (needs screen-capture permission)."
        >
          <Switch />
        </Form.Item>
        <Form.Item
          name="disableHardwareAcceleration"
          label="Disable hardware acceleration"
          valuePropName="checked"
          extra="Try this if the overlay renders as a black box (restart required)."
        >
          <Switch />
        </Form.Item>
      </Form>
      <Divider />
      <Space direction="vertical" style={{ width: '100%' }}>
        {auth?.authenticated && (
          <Button danger block onClick={clearKey}>
            Disconnect / clear API key
          </Button>
        )}
      </Space>
    </Drawer>
  )
}
