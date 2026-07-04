import { useEffect, useMemo, useState } from 'react'
import { Button, Flex, InputNumber, Select, Space, Spin, Tag, Typography, App as AntdApp } from 'antd'
import { CheckOutlined } from '@ant-design/icons'
import { call } from '../../../lib/api'
import { useApp } from '../../../stores/appStore'
import { C } from '../../../theme/graphite'
import { HeaderExtra, ItemChip, wheelToHorizontal } from './common'
import type { LogiItem } from '@shared/types'

const { Text } = Typography

interface TransportGroup {
  items?: Record<string, number>
  crates?: number
  containers?: number
  priority?: string
  title?: string
}
type SourceBlock = Record<string, TransportGroup> // groupId -> group
type Payload = Record<string, SourceBlock> // fromLocationId -> groups

interface TransportTask {
  id: number
  status?: number // 1 LOADING, 2 TRANSPORTING
  containers?: number
  filled_containers?: number
}

interface Props {
  locationId: number // destination
  locationName: string
  payload: Payload
  locations: Record<string, { name?: string; title?: string }>
  onChanged: () => void
}

// Same constants/algorithm as the web app's TransportCrates.
const CONTAINER_CAPACITY = 60
const STATUS_LOADING = 1
const STATUS_TRANSPORTING = 2
const CONTAINER_PRESETS = [1, 5, 12, 13]
const CRATED_CATEGORIES = new Set(['CratedVehicles', 'CratedStructures', 'Vehicles', 'Structures'])

interface PlanItem {
  id: string
  item: LogiItem
  quantity: number
}

// Port of the web app's calculateContainerPlans: crated items occupy a whole
// container; loose crates pack up to CONTAINER_CAPACITY, topped off smallest-first.
function calcContainerPlans(
  manifest: Record<string, number>,
  itemsById: Record<string, LogiItem>,
  containerCount: number
): PlanItem[][] {
  const items = Object.entries(manifest)
    .map(([id, quantity]) => {
      const item = itemsById[id]
      return item ? { id, item, quantity: quantity || 0, isCrated: CRATED_CATEGORIES.has(item.category ?? '') } : null
    })
    .filter(Boolean) as Array<PlanItem & { isCrated: boolean }>
  items.sort((a, b) => b.quantity - a.quantity)

  const plans: PlanItem[][] = []
  let remaining = items.map((i) => ({ ...i }))

  for (let i = 0; i < containerCount; i++) {
    const container: PlanItem[] = []
    let usedCapacity = 0

    for (const item of remaining) {
      if (item.quantity === 0) continue
      if (item.isCrated) {
        if (usedCapacity === 0) {
          container.push({ id: item.id, item: item.item, quantity: 1 })
          item.quantity -= 1
          usedCapacity = CONTAINER_CAPACITY
          break
        }
      } else {
        const spaceLeft = CONTAINER_CAPACITY - usedCapacity
        if (spaceLeft === 0) break
        const toTake = Math.min(item.quantity, CONTAINER_CAPACITY, spaceLeft)
        if (toTake > 0) {
          container.push({ id: item.id, item: item.item, quantity: toTake })
          item.quantity -= toTake
          usedCapacity += toTake
        }
      }
    }

    // Top off with the smallest remaining loose stacks.
    remaining.sort((a, b) => a.quantity - b.quantity)
    for (const item of remaining) {
      if (item.quantity === 0 || item.isCrated) continue
      const spaceLeft = CONTAINER_CAPACITY - usedCapacity
      if (spaceLeft === 0) break
      const toTake = Math.min(item.quantity, spaceLeft)
      if (toTake > 0) {
        const existing = container.find((c) => c.id === item.id)
        if (existing) existing.quantity += toTake
        else container.push({ id: item.id, item: item.item, quantity: toTake })
        item.quantity -= toTake
        usedCapacity += toTake
      }
    }

    if (container.length > 0) plans.push(container)
    remaining = remaining.filter((it) => it.quantity > 0)
    if (remaining.length === 0) break
  }
  return plans
}

const cardStyle: React.CSSProperties = {
  width: 210,
  flexShrink: 0,
  maxHeight: '95%',
  display: 'flex',
  flexDirection: 'column',
  background: C.bg2,
  border: `1px solid ${C.line1}`,
  borderRadius: 8,
  padding: '8px 10px'
}

const cardListStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  overflowX: 'hidden',
  paddingRight: 4
}

const cardLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '.06em',
  textTransform: 'uppercase',
  color: C.text3,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  flexShrink: 0
}

// Transport a manifest from a source stockpile to this destination. Aggregates
// the planner groups per source, creates a TransportationTask, then drives its
// status (LOADING -> fill containers -> depart -> TRANSPORTING -> delivered).
export default function TransportTaskView({
  locationId,
  locationName,
  payload,
  locations,
  onChanged
}: Props): React.ReactElement {
  const { message } = AntdApp.useApp()
  const itemsById = useApp((s) => s.itemsById)
  const sources = Object.keys(payload)
  const [source, setSource] = useState<string | undefined>(sources[0])
  const [task, setTask] = useState<TransportTask | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [containers, setContainers] = useState(5)
  const [customContainers, setCustomContainers] = useState<number | null>(null)
  const [filledIdx, setFilledIdx] = useState<Set<number>>(new Set())

  // aggregate items across this source's groups -> {type_id: crates}
  const manifest = useMemo<Record<string, number>>(() => {
    if (!source) return {}
    const out: Record<string, number> = {}
    for (const group of Object.values(payload[source] || {})) {
      for (const [typeId, qty] of Object.entries(group.items || {})) {
        out[typeId] = (out[typeId] || 0) + (qty || 0)
      }
    }
    return out
  }, [payload, source])

  const plans = useMemo(
    () => (containers > 0 ? calcContainerPlans(manifest, itemsById, containers) : []),
    [manifest, itemsById, containers]
  )

  async function loadExisting(from: string): Promise<void> {
    setLoading(true)
    try {
      const res = await call<TransportTask | null>('getTransportationTask', Number(from), locationId)
      const t = res.ok ? (res.data ?? null) : null
      setTask(t)
      if (t?.containers && t.containers > 0) {
        setContainers(t.containers)
        setFilledIdx(new Set(Array.from({ length: t.filled_containers ?? 0 }, (_, i) => i)))
      } else {
        setFilledIdx(new Set())
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (source) loadExisting(source)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, locationId])

  async function startHaul(): Promise<void> {
    if (!source) return
    setBusy(true)
    try {
      const stockList = Object.fromEntries(
        Object.entries(manifest).map(([typeId, qty]) => [
          typeId,
          { type: itemsById[typeId] ?? { id: Number(typeId) }, quantity: qty }
        ])
      )
      const res = await call<TransportTask>(
        'createTransportationTask',
        Number(source),
        locationId,
        stockList
      )
      if (res.ok && res.data) {
        setTask(res.data)
        setFilledIdx(new Set())
        message.success('Haul created.')
      } else message.error(res.error || 'Could not create haul')
    } finally {
      setBusy(false)
    }
  }

  async function act(
    action: string,
    label: string,
    ends = false,
    data: Record<string, unknown> = {}
  ): Promise<void> {
    if (!task) return
    setBusy(true)
    try {
      const res = await call<TransportTask>('transportationTaskAction', task.id, action, data)
      if (res.ok) {
        if (label) message.success(label)
        if (ends) {
          setTask(null)
          onChanged()
        } else if (res.data && 'status' in res.data) {
          setTask(res.data)
        } else if (source) {
          loadExisting(source)
        }
      } else message.error(res.error || `${label || action} failed`)
    } finally {
      setBusy(false)
    }
  }

  async function selectContainers(count: number): Promise<void> {
    if (!count || count <= 0) return
    setContainers(count)
    setCustomContainers(null)
    setFilledIdx(new Set())
    await act('update_containers', '', false, { containers: count })
  }

  async function fillContainer(idx: number): Promise<void> {
    const items: Record<string, number> = {}
    plans[idx]?.forEach(({ id, quantity }) => {
      items[id] = quantity
    })
    await act('fill_container', 'Container filled', false, { items })
    setFilledIdx((p) => new Set([...p, idx]))
  }

  const skipContainer = (idx: number): void => setFilledIdx((p) => new Set([...p, idx]))

  const srcName = (id: string): string => locations[id]?.name || locations[id]?.title || `#${id}`

  const status = task?.status
  const allFilled = plans.length > 0 && plans.every((_, i) => filledIdx.has(i))
  const queue = plans.map((container, index) => ({ container, index })).filter(({ index }) => !filledIdx.has(index))

  return (
    <Flex gap={16} align="start" style={{ height: '100%', overflow: 'hidden' }}>
      <HeaderExtra>
        {loading ? null : !task ? (
          <Space size={6}>
            <Button size="small" type="primary" loading={busy} onClick={startHaul}>
              Start haul
            </Button>
            <Button size="small" onClick={onChanged}>
              Close
            </Button>
          </Space>
        ) : (
          <Space size={6}>
            {status !== STATUS_TRANSPORTING && (
              <Button
                size="small"
                type="primary"
                loading={busy}
                disabled={!allFilled}
                onClick={() => act('depart', 'Departed')}
              >
                Depart
              </Button>
            )}
            <Button
              size="small"
              type="primary"
              loading={busy}
              onClick={() => act('finish', 'Delivered', true)}
            >
              Delivered (finish)
            </Button>
            <Button size="small" danger loading={busy} onClick={() => act('report_lost', 'Reported lost', true)}>
              Lost
            </Button>
            <Button size="small" loading={busy} onClick={() => act('cancel', 'Cancelled', true)}>
              Cancel
            </Button>
          </Space>
        )}
      </HeaderExtra>

      {/* Left rail: route, source, status, container count. */}
      <Flex vertical gap={10} style={{ width: 240, flexShrink: 0 }}>
        <Text>
          To <Text strong>{locationName}</Text>
        </Text>
        <Select
          size="small"
          style={{ width: '100%' }}
          value={source}
          onChange={setSource}
          options={sources.map((s) => ({ value: s, label: `From ${srcName(s)}` }))}
        />

        {loading ? (
          <Spin />
        ) : task ? (
          <>
            <Space>
              <Tag color={status === STATUS_TRANSPORTING ? 'processing' : 'gold'}>
                {status === STATUS_TRANSPORTING ? 'TRANSPORTING' : 'LOADING'}
              </Tag>
              <Text type="secondary" style={{ fontSize: 11 }}>
                containers {filledIdx.size}/{plans.length || containers}
              </Text>
            </Space>

            {status === STATUS_LOADING && !allFilled && (
              <>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Containers
                </Text>
                <Space wrap size={4}>
                  {CONTAINER_PRESETS.map((n) => (
                    <Button
                      key={n}
                      size="small"
                      type={containers === n ? 'primary' : 'default'}
                      loading={busy && containers === n}
                      onClick={() => selectContainers(n)}
                    >
                      {n}
                    </Button>
                  ))}
                </Space>
                <Space size={6}>
                  <InputNumber
                    size="small"
                    min={1}
                    max={100}
                    value={customContainers}
                    onChange={(v) => setCustomContainers((v as number) || null)}
                    placeholder="Custom"
                    style={{ width: 80 }}
                  />
                  <Button
                    size="small"
                    disabled={!customContainers}
                    onClick={() => customContainers && selectContainers(customContainers)}
                  >
                    Set
                  </Button>
                </Space>
              </>
            )}

            {status === STATUS_LOADING && allFilled && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                All containers loaded — press Depart above.
              </Text>
            )}
          </>
        ) : (
          <Text type="secondary" style={{ fontSize: 11 }}>
            No active haul — press Start haul above.
          </Text>
        )}
      </Flex>

      {/* Content: manifest card, then the container loading queue left→right. */}
      <div
        onWheel={wheelToHorizontal}
        style={{
          flex: 1,
          minWidth: 0,
          height: '100%',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          overflowX: 'auto',
          overflowY: 'hidden'
        }}
      >
        {(!task || status === STATUS_TRANSPORTING) && (
          <div style={cardStyle}>
            <span style={cardLabelStyle}>Manifest</span>
            <div style={{ height: 1, background: C.line1, margin: '8px 0', flexShrink: 0 }} />
            <div style={cardListStyle}>
              <Flex vertical gap={4}>
                {Object.entries(manifest).map(([typeId, qty]) => (
                  <ItemChip key={typeId} typeId={typeId} qty={qty} suffix=" cr" />
                ))}
              </Flex>
            </div>
          </div>
        )}

        {task &&
          status === STATUS_LOADING &&
          queue.map(({ container, index }, queuePos) => (
            <div
              key={index}
              style={{
                ...cardStyle,
                borderColor: queuePos === 0 ? C.accentLine : C.line1
              }}
            >
              <Flex justify="space-between" align="center" gap={8} style={{ flexShrink: 0 }}>
                <span style={cardLabelStyle}>Container {index + 1}</span>
                {queuePos === 0 && (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: '.08em',
                      color: C.accent,
                      padding: '1px 7px',
                      border: `1px solid ${C.accentLine}`,
                      borderRadius: 999,
                      textTransform: 'uppercase'
                    }}
                  >
                    now
                  </span>
                )}
              </Flex>
              <div style={{ height: 1, background: C.line1, margin: '8px 0', flexShrink: 0 }} />
              <div style={cardListStyle}>
                <Flex vertical gap={4}>
                  {container.map(({ id, quantity }) => (
                    <ItemChip key={id} typeId={id} qty={quantity} />
                  ))}
                </Flex>
              </div>
              <div style={{ height: 1, background: C.line1, margin: '8px 0', flexShrink: 0 }} />
              <Flex justify="flex-end" gap={6} style={{ flexShrink: 0 }}>
                <Button size="small" onClick={() => skipContainer(index)}>
                  Skip
                </Button>
                <Button
                  size="small"
                  type="primary"
                  icon={<CheckOutlined />}
                  loading={busy}
                  onClick={() => fillContainer(index)}
                >
                  Filled
                </Button>
              </Flex>
            </div>
          ))}
      </div>
    </Flex>
  )
}
