import { useEffect, useMemo, useState } from 'react'
import {
  AutoComplete,
  Button,
  Flex,
  Space,
  Typography,
  Tag,
  Spin,
  Radio,
  App as AntdApp
} from 'antd'
import { call } from '../../lib/api'
import { ItemChip, wheelToHorizontal } from '../Logistics/tasks/common'
import { C } from '../../theme/graphite'

const { Text } = Typography

interface Bunker {
  id: number
  name: string
  tier?: number
  description?: string
}
interface SupplyTask {
  id: number
  cargo_size?: number
  status?: number
  stock?: Record<string, number> | StockRow[]
  pickup_location?: { id: number; name: string } | null
}
interface StockRow {
  type: { id: number; name?: string; icon?: string }
  quantity: number
}
interface Recommendation {
  location: string
  location_id: number
  stock: Record<string, number> | StockRow[]
  total_value?: number
}

// foxhole/models.py::BunkerSupplyStatus
const STATUS = { PREPARING: 1, PICKING_UP: 2, DELIVERING: 3, LOST_CARGO: 4, DELIVERED: 6, FINISHED: 7 }
const CARGO_SIZES = [14, 15, 16, 30, 31]

// foxhole/models.py::BunkerTier — the "tier" field encodes the base type.
const TIER_LABELS: Record<number, string> = {
  1: 'Tier 1',
  2: 'Tier 2',
  3: 'Tier 3',
  4: 'Town Base',
  5: 'Relic Base',
  6: 'Border Base',
  7: 'Underground Fort',
  8: 'Safe House',
  9: 'Encampment',
  10: 'Keep'
}

// Normalize either {type_id: qty} or [{type:{id}, quantity}] to [typeId, qty][].
function stockRows(stock: SupplyTask['stock'] | Recommendation['stock']): Array<[number, number]> {
  if (!stock) return []
  if (Array.isArray(stock)) return stock.map((r) => [r.type.id, r.quantity])
  return Object.entries(stock).map(([k, v]) => [Number(k), Number(v)])
}

const cardStyle: React.CSSProperties = {
  flex: '1 1 190px',
  minWidth: 165,
  maxWidth: 260,
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

export default function BunkerSupplyPanel(): React.ReactElement {
  const { message } = AntdApp.useApp()
  const [bunkers, setBunkers] = useState<Bunker[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Bunker | null>(null)
  const [task, setTask] = useState<SupplyTask | null>(null)
  const [recs, setRecs] = useState<Recommendation[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setLoadingList(true)
    call<Bunker[]>('bunkerBaseList')
      .then((res) => {
        if (res.ok && Array.isArray(res.data)) setBunkers(res.data)
      })
      .finally(() => setLoadingList(false))
  }, [])

  const options = useMemo(
    () =>
      bunkers
        .filter((b) => b.name?.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 20)
        .map((b) => ({
          value: b.name,
          label: (
            <div>
              <div>
                {b.tier && TIER_LABELS[b.tier] ? `${b.name} · ${TIER_LABELS[b.tier]}` : b.name}
              </div>
              {b.description && (
                <Text type="secondary" style={{ fontSize: 11, display: 'block' }} ellipsis>
                  {b.description}
                </Text>
              )}
            </div>
          ),
          bunker: b
        })),
    [bunkers, query]
  )

  async function selectBunker(b: Bunker): Promise<void> {
    setSelected(b)
    setRecs([])
    setBusy(true)
    try {
      const res = await call<SupplyTask>('bunkerSupplyTaskGet', b.id)
      const t = res.ok ? (res.data ?? null) : null
      setTask(t)
      if (t && (t.status ?? STATUS.PREPARING) === STATUS.PREPARING) {
        loadRecs(b.id, t.cargo_size ?? 15)
      }
    } finally {
      setBusy(false)
    }
  }

  async function loadRecs(bunkerId: number, cargoSize: number): Promise<void> {
    const res = await call<Recommendation[]>('bunkerSupplyPlannerGet', bunkerId, {
      cargo_size: cargoSize
    })
    if (res.ok && Array.isArray(res.data)) setRecs(res.data)
  }

  async function update(data: Record<string, unknown>, label?: string): Promise<void> {
    if (!selected) return
    setBusy(true)
    try {
      const res = await call<SupplyTask>('bunkerSupplyTaskUpdate', selected.id, data)
      if (res.ok && res.data) {
        setTask(res.data)
        if (label) message.success(label)
        if ((res.data.status ?? STATUS.PREPARING) === STATUS.PREPARING) {
          loadRecs(selected.id, res.data.cargo_size ?? 15)
        }
      } else message.error(res.error || 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  async function changeCargo(size: number): Promise<void> {
    if (!selected) return
    await update({ cargo_size: size })
    loadRecs(selected.id, size)
  }

  async function pickHere(rec: Recommendation): Promise<void> {
    await update(
      { status: STATUS.PICKING_UP, pickup_location_id: rec.location_id, stock: rec.stock },
      `Heading to ${rec.location}`
    )
  }

  async function cancel(): Promise<void> {
    if (!selected) return
    setBusy(true)
    try {
      const res = await call('bunkerSupplyTaskDelete', selected.id)
      if (res.ok) {
        message.info('Task cancelled.')
        selectBunker(selected)
      }
    } finally {
      setBusy(false)
    }
  }

  if (loadingList) return <Spin style={{ display: 'block', margin: '24px auto' }} />

  const status = task?.status ?? STATUS.PREPARING
  const statusName =
    Object.keys(STATUS).find((k) => STATUS[k as keyof typeof STATUS] === status) ?? String(status)

  return (
    <Flex gap={12} align="start" style={{ height: '100%', overflow: 'hidden' }}>
      {/* Left rail: search, selected bunker, cargo size, stage actions. */}
      <Flex vertical gap={10} style={{ width: 210, flexShrink: 0 }}>
        <AutoComplete
          style={{ width: '100%' }}
          options={options}
          value={query}
          onSearch={setQuery}
          onChange={setQuery}
          placeholder="Find a bunker…"
          onSelect={(_v, opt) => selectBunker((opt as { bunker: Bunker }).bunker)}
        />

        {selected && (
          <>
            <Flex align="center" gap={6} wrap>
              <Text strong style={{ fontSize: 13 }} ellipsis>
                {selected.name}
              </Text>
              <Tag color={status === STATUS.PREPARING ? 'default' : 'processing'}>{statusName}</Tag>
              {busy && <Spin size="small" />}
            </Flex>

            {status === STATUS.PREPARING && (
              <>
                <Text style={{ fontSize: 11 }}>
                  Cargo size (crates)
                </Text>
                <Radio.Group
                  size="small"
                  value={task?.cargo_size ?? 15}
                  onChange={(e) => changeCargo(e.target.value)}
                >
                  {CARGO_SIZES.map((c) => (
                    <Radio.Button key={c} value={c}>
                      {c}
                    </Radio.Button>
                  ))}
                </Radio.Group>
              </>
            )}

            {status === STATUS.PICKING_UP && (
              <Button
                type="primary"
                block
                loading={busy}
                onClick={() => update({ status: STATUS.DELIVERING }, 'En route')}
              >
                Cargo collected — deliver
              </Button>
            )}

            {status === STATUS.DELIVERING && (
              <>
                <Button
                  type="primary"
                  block
                  loading={busy}
                  onClick={() => update({ status: STATUS.DELIVERED }, 'Delivered')}
                >
                  Delivered
                </Button>
                <Button
                  danger
                  block
                  loading={busy}
                  onClick={() => update({ status: STATUS.LOST_CARGO }, 'Cargo lost')}
                >
                  Lost cargo
                </Button>
              </>
            )}

            {status === STATUS.DELIVERED && (
              <Button
                type="primary"
                block
                loading={busy}
                onClick={() => update({ status: STATUS.FINISHED }, 'Run complete')}
              >
                Finish — next round
              </Button>
            )}

            {status !== STATUS.PREPARING && (
              <Button danger block loading={busy} onClick={cancel}>
                Cancel task
              </Button>
            )}
          </>
        )}
      </Flex>

      {/* Content area: cards flow left→right, horizontal scroll on overflow. */}
      <div
        onWheel={wheelToHorizontal}
        style={{
          flex: 1,
          minWidth: 0,
          height: '100%',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          overflowX: 'auto',
          overflowY: 'hidden'
        }}
      >
        {selected && status === STATUS.PREPARING && (
          <>
            {recs.length === 0 ? (
              <Text type="secondary">No nearby stockpiles found.</Text>
            ) : (
              recs.map((rec) => (
                <div key={rec.location_id} style={cardStyle}>
                  <Flex justify="space-between" align="center" gap={8} style={{ flexShrink: 0 }}>
                    <span style={cardLabelStyle}>{rec.location}</span>
                    <Button size="small" type="primary" loading={busy} onClick={() => pickHere(rec)}>
                      Pick up
                    </Button>
                  </Flex>
                  <div style={{ height: 1, background: C.line1, margin: '8px 0', flexShrink: 0 }} />
                  <div style={cardListStyle}>
                    <Flex vertical gap={4}>
                      {stockRows(rec.stock).map(([tid, qty]) => (
                        <ItemChip key={tid} typeId={tid} qty={qty} />
                      ))}
                    </Flex>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {selected && (status === STATUS.PICKING_UP || status === STATUS.DELIVERING) && (
          <div style={cardStyle}>
            <span style={cardLabelStyle}>
              {status === STATUS.PICKING_UP
                ? `Pick up — ${task?.pickup_location?.name ?? ''}`
                : `Deliver to ${selected.name}`}
            </span>
            <div style={{ height: 1, background: C.line1, margin: '8px 0', flexShrink: 0 }} />
            <div style={cardListStyle}>
              <CargoList task={task} />
            </div>
          </div>
        )}
      </div>
    </Flex>
  )
}

function CargoList({ task }: { task: SupplyTask | null }): React.ReactElement | null {
  const rows = stockRows(task?.stock)
  if (rows.length === 0) return null
  return (
    <Flex vertical gap={4}>
      {rows.map(([tid, qty]) => (
        <ItemChip key={tid} typeId={tid} qty={qty} />
      ))}
    </Flex>
  )
}
