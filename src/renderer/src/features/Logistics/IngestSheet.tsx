import { useEffect, useState } from 'react'
import { Modal, Space, Typography, Tag, Button, List, Spin, App as AntdApp } from 'antd'
import { call } from '../../lib/api'
import type { ParsedStockpile } from '@shared/types'

const { Text } = Typography

interface Props {
  stockpile: ParsedStockpile | null
  onClose: () => void
}

interface Candidate {
  id: number
  name: string
  location_id?: number
  hex?: string
  city?: string
}

interface CheckResponse {
  status: 'exact' | 'candidates'
  stockpiles?: Candidate[]
}

// Transient confirmation sheet for a clipboard-parsed stockpile. Resolves the
// target stockpile by name (exact or candidate list), then POSTs the contents
// with the detected `source` so the backend bypasses per-item quantity caps.
export default function IngestSheet({ stockpile, onClose }: Props): React.ReactElement {
  const { message } = AntdApp.useApp()
  const [checking, setChecking] = useState(false)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [exact, setExact] = useState<Candidate | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setCandidates([])
    setExact(null)
    if (!stockpile) return
    ;(async () => {
      setChecking(true)
      try {
        const res = await call<CheckResponse>('checkStockpileName', stockpile.name ?? '', null)
        if (res.ok && res.data) {
          if (res.data.status === 'exact' && res.data.stockpiles?.[0]) {
            setExact(res.data.stockpiles[0])
          } else {
            setCandidates(res.data.stockpiles ?? [])
          }
        }
      } finally {
        setChecking(false)
      }
    })()
  }, [stockpile])

  async function commit(target: Candidate | null): Promise<void> {
    if (!stockpile) return
    setSubmitting(true)
    try {
      const res = await call(
        'updateStockpileContent',
        target?.name ?? stockpile.name ?? '',
        stockpile.items,
        stockpile.type ?? null,
        target?.location_id ?? null,
        stockpile.source
      )
      if (res.ok) {
        message.success('Stockpile updated.')
        onClose()
      } else {
        message.error(res.error || 'Update failed.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Update stockpile from clipboard"
      open={!!stockpile}
      onCancel={onClose}
      footer={null}
      getContainer={false}
      destroyOnHidden
      width={460}
    >
      {!stockpile ? null : (
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Space wrap>
            {stockpile.hex && <Tag>{stockpile.hex}</Tag>}
            {stockpile.city && <Tag>{stockpile.city}</Tag>}
            {stockpile.type && <Tag color="gold">{stockpile.type}</Tag>}
            <Tag color="processing">{stockpile.items.length} items</Tag>
            <Tag>{stockpile.source}</Tag>
          </Space>
          <Text strong>{stockpile.name || '(unnamed stockpile)'}</Text>

          {checking ? (
            <Spin />
          ) : exact ? (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text type="success">Matched existing stockpile.</Text>
              <Button type="primary" loading={submitting} onClick={() => commit(exact)}>
                Update “{exact.name}”
              </Button>
            </Space>
          ) : candidates.length > 0 ? (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text type="secondary">Pick the stockpile to update:</Text>
              <List
                size="small"
                bordered
                dataSource={candidates}
                renderItem={(c) => (
                  <List.Item
                    actions={[
                      <Button key="u" size="small" loading={submitting} onClick={() => commit(c)}>
                        Update
                      </Button>
                    ]}
                  >
                    <Text>
                      {c.name} {c.hex ? <Text type="secondary">· {c.hex}</Text> : null}
                    </Text>
                  </List.Item>
                )}
              />
            </Space>
          ) : (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text type="warning">No matching stockpile found by name.</Text>
              <Button loading={submitting} onClick={() => commit(null)}>
                Submit anyway (by name)
              </Button>
            </Space>
          )}
        </Space>
      )}
    </Modal>
  )
}
