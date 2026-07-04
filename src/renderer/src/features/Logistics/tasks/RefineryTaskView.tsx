import { useEffect, useState } from 'react'
import {
  Button,
  Flex,
  InputNumber,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Tag,
  Typography,
  App as AntdApp
} from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { call } from '../../../lib/api'
import { iconUrl } from '../../../stores/appStore'
import { C } from '../../../theme/graphite'
import { HeaderExtra, wheelToHorizontal } from './common'

const { Text } = Typography

// Same constants as the web app's CraftBasicResources.
const RESOURCE_KEYS = ['bmat', 'emat', 'rmat', 'hemat'] as const
const RAW_AMOUNTS = [10000, 5000, 2500, 2000, 1500]
const PICKUP_PRESETS = [60, 15] // crates

type ResourceKey = (typeof RESOURCE_KEYS)[number]

interface ResStock {
  input: { amount: number; label: string; icon: string; id: number; total?: number }
  output: { amount: number; label: string; icon: string; id: number; max_capacity?: number }
  ratio: number
  per_crate: number
  tick: number
  limit?: number
}
type Stock = Partial<Record<ResourceKey, ResStock>>

interface RefineryTask {
  id: number
  stock?: Stock
  calculated_at?: string
}

interface Props {
  locationId: number
  payload: Record<string, { crates?: number; output?: number; input?: number }>
  onChanged: () => void
}

// Port of the web app's calculateLocalStock: project refining progress since
// the server last calculated (input converts to output every `tick` seconds).
function calculateLocalStock(stock: Stock, calculatedAt: string): Stock {
  const elapsed = (Date.now() - new Date(calculatedAt).getTime()) / 1000
  if (elapsed <= 0) return stock
  const newStock: Stock = JSON.parse(JSON.stringify(stock))
  for (const key of RESOURCE_KEYS) {
    const resource = newStock[key]
    if (!resource) continue
    const tick = parseFloat(String(resource.tick))
    const ratio = parseInt(String(resource.ratio))
    if (!tick || !ratio) continue
    const steps = Math.floor(elapsed / tick)
    if (steps <= 0) continue
    const stepsDone = Math.min(steps, Math.floor(resource.input.amount / ratio))
    if (stepsDone > 0) {
      resource.output.amount += stepsDone
      resource.input.amount -= stepsDone * ratio
    }
  }
  return newStock
}

const formatNum = (n: number): string => Math.round(n ?? 0).toLocaleString('en-US')
const formatK = (n: number): string => (n >= 1000 ? `${n / 1000}k` : `${n}`)
// "Basic Materials" -> "Basic", "Heavy Explosive Powder" -> "Heavy Explosive"
const shortLabel = (label: string): string =>
  label.replace(/\s*\b(Powder|Materials)\b\s*/gi, ' ').trim()

const cardStyle: React.CSSProperties = {
  flex: '1 1 0',
  minWidth: 0,
  maxHeight: '95%',
  display: 'flex',
  flexDirection: 'column',
  background: C.bg2,
  border: `1px solid ${C.line1}`,
  borderRadius: 8,
  padding: '7px 9px'
}

const groupLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '.06em',
  textTransform: 'uppercase',
  color: C.text3
}

// Refinery: submit raw materials (add_raw) per resource; the facility converts
// them into refined output over time (projected locally between refreshes).
export default function RefineryTaskView({ locationId, payload, onChanged }: Props): React.ReactElement {
  const { message } = AntdApp.useApp()
  const [task, setTask] = useState<RefineryTask | null>(null)
  const [, setTick] = useState(0) // re-render trigger for the 5s projection
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [customRaw, setCustomRaw] = useState<Record<string, number | null>>({})
  const [customPickup, setCustomPickup] = useState<Record<string, number | null>>({})
  const [correctOpen, setCorrectOpen] = useState(false)
  const [correction, setCorrection] = useState<Record<string, { input?: number; output?: number }>>({})

  async function load(): Promise<void> {
    setLoading(true)
    try {
      const res = await call<RefineryTask>('getRefineryTask', locationId)
      if (res.ok && res.data) setTask(res.data)
      else message.error(res.error || 'Failed to load refinery task')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId])

  // Client-side only: re-render every 5s so the projected stock advances live.
  useEffect(() => {
    const interval = setInterval(() => setTick((n) => n + 1), 5000)
    return () => clearInterval(interval)
  }, [])

  // Projected view of the server snapshot — recomputed on every render/tick.
  const displayStock: Stock =
    task?.stock && task.calculated_at
      ? calculateLocalStock(task.stock, task.calculated_at)
      : (task?.stock ?? {})

  async function act(action: string, data: Record<string, unknown>, label: string): Promise<void> {
    setBusy(true)
    try {
      const res = await call<RefineryTask>('refineryTaskAction', locationId, action, data)
      if (res.ok) {
        if (res.data && typeof res.data === 'object' && 'stock' in res.data) setTask(res.data)
        else load()
        if (label) message.success(label)
      } else message.error(res.error || `${label || action} failed`)
    } finally {
      setBusy(false)
    }
  }

  // Same capacity guard as the web before submitting raw.
  async function addRaw(key: ResourceKey, amount: number): Promise<void> {
    const r = displayStock[key]
    if (r?.limit) {
      const total = r.output.amount + r.input.amount / r.ratio + amount / r.ratio
      if (total > r.limit) {
        message.warning('Adding this amount would exceed output capacity. Retrieve crates first.')
        return
      }
    }
    await act('add_raw', { resource: key, amount }, `Added ${formatK(amount)} ${r?.input.label ?? ''}`)
  }

  async function finish(): Promise<void> {
    setBusy(true)
    try {
      const res = await call<{ points?: number }>('refineryTaskAction', locationId, 'finish')
      if (res.ok) {
        message.success(`Refinery finished${res.data?.points ? ` (+${res.data.points} pts)` : ''}`)
        onChanged()
      } else message.error(res.error || 'Could not finish')
    } finally {
      setBusy(false)
    }
  }

  function openCorrect(): void {
    const initial: Record<string, { input?: number; output?: number }> = {}
    RESOURCE_KEYS.forEach((key) => {
      const r = displayStock[key]
      if (r) initial[key] = { input: Math.floor(r.input.amount), output: Math.floor(r.output.amount) }
    })
    setCorrection(initial)
    setCorrectOpen(true)
  }

  async function saveCorrection(): Promise<void> {
    await act('correct_amounts', { amounts: correction }, 'Amounts corrected')
    setCorrectOpen(false)
  }

  if (loading && !task) return <Spin />

  const keys = RESOURCE_KEYS.filter((k) => displayStock[k])

  const crateAmount = (r: ResStock): number =>
    r.per_crate ? Math.floor(r.output.amount / r.per_crate) : 0
  const goalCrates = (r: ResStock): number | undefined => payload?.[String(r.output.id)]?.crates

  return (
    <>
      <HeaderExtra>
        <Space size={6}>
          <Button size="small" loading={busy} onClick={load}>
            Refresh
          </Button>
          <Button size="small" loading={busy} onClick={openCorrect}>
            Correct
          </Button>
          <Popconfirm
            title="Clear all"
            description="Reset all raw and refined amounts?"
            onConfirm={() => act('clear_all', {}, 'All cleared')}
            okText="Yes"
            cancelText="No"
          >
            <Button size="small" danger loading={busy}>
              Clear all
            </Button>
          </Popconfirm>
          <Button size="small" type="primary" loading={busy} onClick={finish}>
            Finish task
          </Button>
        </Space>
      </HeaderExtra>

      <div
        onWheel={wheelToHorizontal}
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          overflowX: 'auto',
          overflowY: 'hidden'
        }}
      >
        {keys.length === 0 && <Text type="secondary">No active refinery cycle for this location.</Text>}
        {keys.map((k) => {
          const r = displayStock[k] as ResStock
          const crates = crateAmount(r)
          const goal = goalCrates(r)
          return (
            <div key={k} style={cardStyle}>
              {/* header: refined resource + crate progress */}
              <Flex justify="space-between" align="center" gap={8} style={{ flexShrink: 0 }}>
                <Flex align="center" gap={6} style={{ minWidth: 0 }}>
                  {iconUrl(r.output.icon) && (
                    <img src={iconUrl(r.output.icon)} width={22} height={22} alt={r.output.label} />
                  )}
                  <Text strong style={{ fontSize: 12 }} ellipsis>
                    {shortLabel(r.output.label)}
                  </Text>
                </Flex>
                <Tag
                  color={goal && crates >= goal ? 'success' : 'processing'}
                  style={{ marginInlineEnd: 0, flexShrink: 0 }}
                >
                  {crates}
                  {goal ? `/${goal}` : ''} cr
                </Tag>
              </Flex>

              <div style={{ height: 1, background: C.line1, margin: '6px 0', flexShrink: 0 }} />

              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 4 }}>
                {/* live raw -> refined flow */}
                <Flex justify="space-between" align="center" gap={8} style={{ marginBottom: 6 }}>
                  <Flex align="center" gap={5} style={{ minWidth: 0 }}>
                    {iconUrl(r.input.icon) && (
                      <img src={iconUrl(r.input.icon)} width={18} height={18} alt={r.input.label} />
                    )}
                    <Text style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                      {formatNum(r.input.amount)}
                    </Text>
                  </Flex>
                  <Text type="secondary" style={{ fontSize: 10, flexShrink: 0 }}>
                    {r.ratio}:1 →
                  </Text>
                  <Flex align="center" gap={5} style={{ minWidth: 0 }}>
                    {iconUrl(r.output.icon) && (
                      <img src={iconUrl(r.output.icon)} width={18} height={18} alt={r.output.label} />
                    )}
                    <Text style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                      {formatNum(r.output.amount)}
                    </Text>
                  </Flex>
                </Flex>

                {/* drop raw */}
                <div style={{ ...groupLabelStyle, margin: '4px 0' }}>Drop raw</div>
                <Space wrap size={4}>
                  {RAW_AMOUNTS.map((amount) => {
                    const total =
                      r.output.amount + r.input.amount / r.ratio + amount / r.ratio
                    const wouldExceed = !!r.output.max_capacity && total > r.output.max_capacity
                    return (
                      <Button
                        key={amount}
                        size="small"
                        disabled={wouldExceed || busy}
                        onClick={() => addRaw(k, amount)}
                      >
                        +{formatK(amount)}
                      </Button>
                    )
                  })}
                </Space>
                <Space size={4} style={{ marginTop: 4 }}>
                  <InputNumber
                    size="small"
                    min={1}
                    max={5000}
                    value={customRaw[k]}
                    onChange={(v) => setCustomRaw((p) => ({ ...p, [k]: (v as number) || null }))}
                    placeholder="Custom"
                    style={{ width: 90 }}
                  />
                  <Button
                    size="small"
                    icon={<PlusOutlined />}
                    loading={busy}
                    disabled={!customRaw[k] || (customRaw[k] as number) <= 0}
                    onClick={async () => {
                      await addRaw(k, customRaw[k] as number)
                      setCustomRaw((p) => ({ ...p, [k]: null }))
                    }}
                  />
                </Space>

                {/* pickup crates */}
                <Flex justify="space-between" align="baseline" gap={8} style={{ margin: '8px 0 4px' }}>
                  <span style={groupLabelStyle}>Pickup crates</span>
                  <Text type="secondary" style={{ fontSize: 10, flexShrink: 0 }}>
                    {crates} available
                  </Text>
                </Flex>
                <Space wrap size={4}>
                  {PICKUP_PRESETS.map((n) => (
                    <Button
                      key={n}
                      size="small"
                      disabled={crates < n || busy}
                      onClick={() =>
                        act(
                          'retrieve',
                          { resource: k, amount: n * r.per_crate },
                          `Retrieved ${n} crates`
                        )
                      }
                    >
                      −{n} cr
                    </Button>
                  ))}
                </Space>
                <Space size={4} style={{ marginTop: 4 }}>
                  <InputNumber
                    size="small"
                    min={1}
                    max={Math.floor(r.output.amount)}
                    value={customPickup[k]}
                    onChange={(v) => setCustomPickup((p) => ({ ...p, [k]: (v as number) || null }))}
                    placeholder="Custom"
                    style={{ width: 90 }}
                  />
                  <Button
                    size="small"
                    icon={<PlusOutlined />}
                    loading={busy}
                    disabled={
                      !customPickup[k] ||
                      (customPickup[k] as number) <= 0 ||
                      (customPickup[k] as number) > r.output.amount
                    }
                    onClick={async () => {
                      await act(
                        'retrieve',
                        { resource: k, amount: customPickup[k] },
                        'Retrieved output'
                      )
                      setCustomPickup((p) => ({ ...p, [k]: null }))
                    }}
                  />
                </Space>

                {/* total submitted */}
                <Flex justify="space-between" align="center" style={{ marginTop: 8 }}>
                  <span style={groupLabelStyle}>Submitted</span>
                  <Text style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
                    {formatNum(r.input.total ?? 0)}
                  </Text>
                </Flex>
              </div>
            </div>
          )
        })}
      </div>

      {/* correct amounts */}
      <Modal
        title="Correct amounts"
        open={correctOpen}
        onOk={saveCorrection}
        onCancel={() => setCorrectOpen(false)}
        confirmLoading={busy}
        okText="Save"
        width={420}
      >
        <Flex vertical gap={10}>
          {keys.map((k) => {
            const r = displayStock[k] as ResStock
            return (
              <div
                key={k}
                style={{
                  background: C.bg3,
                  border: `1px solid ${C.line2}`,
                  borderRadius: 8,
                  padding: 10
                }}
              >
                <Flex align="center" gap={6} style={{ marginBottom: 8 }}>
                  {iconUrl(r.output.icon) && (
                    <img src={iconUrl(r.output.icon)} width={16} height={16} alt={r.output.label} />
                  )}
                  <Text strong style={{ fontSize: 12 }}>
                    {r.output.label}
                  </Text>
                </Flex>
                <Flex gap={10}>
                  <Flex vertical gap={2} style={{ flex: 1 }}>
                    <span style={groupLabelStyle}>{r.input.label} (input)</span>
                    <InputNumber
                      size="small"
                      min={0}
                      value={correction[k]?.input}
                      onChange={(v) =>
                        setCorrection((p) => ({ ...p, [k]: { ...p[k], input: (v as number) ?? 0 } }))
                      }
                      style={{ width: '100%' }}
                    />
                  </Flex>
                  <Flex vertical gap={2} style={{ flex: 1 }}>
                    <span style={groupLabelStyle}>{r.output.label} (output)</span>
                    <InputNumber
                      size="small"
                      min={0}
                      value={correction[k]?.output}
                      onChange={(v) =>
                        setCorrection((p) => ({ ...p, [k]: { ...p[k], output: (v as number) ?? 0 } }))
                      }
                      style={{ width: '100%' }}
                    />
                  </Flex>
                </Flex>
              </div>
            )
          })}
        </Flex>
      </Modal>
    </>
  )
}
