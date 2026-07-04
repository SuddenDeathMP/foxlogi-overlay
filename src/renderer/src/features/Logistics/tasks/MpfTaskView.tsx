import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Checkbox,
  Flex,
  Input,
  Segmented,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
  App as AntdApp
} from 'antd'
import { PlayCircleOutlined, StepForwardOutlined, TruckOutlined, WarningOutlined } from '@ant-design/icons'
import { call } from '../../../lib/api'
import { iconUrl } from '../../../stores/appStore'
import { HeaderExtra } from './common'
import { C } from '../../../theme/graphite'

const { Text } = Typography

interface MpfItem {
  id?: number // set once prepared (order id)
  type_id: number
  name: string
  icon: string
  category: string
  bmat?: number
  rmat?: number
  emat?: number
  hemat?: number
  per_crate?: number
  quantity: number
  price: number
  order: number
}
interface CalcResponse {
  total_request?: Record<string, number>
  items?: Record<string, Omit<MpfItem, 'quantity' | 'price' | 'order'>>
  resources?: Record<string, number>
  occupied_categories?: string[]
  squad?: string
}
interface MpfOrder {
  id: number
  type_id?: number
  type?: { id: number; name?: string; icon?: string; category?: string } | number
  quantity?: number
  status?: number
}

interface Props {
  locationId: number
  onChanged: () => void
}

// ---- Constants ported from the web app's MPFModal ----
const CATEGORY_ORDER: Record<string, number> = {
  smallarms: 1,
  heavyarms: 2,
  heavyammo: 3,
  supplies: 6,
  uniforms: 7,
  cratedvehicles: 10,
  cratedstructures: 11
}
const CRATE_SIZE: Record<string, number> = { bmat: 100, rmat: 20, emat: 40, hemat: 30 }
const RESOURCE_ICONS: Record<string, string> = {
  bmat: 'BasicMaterials.png',
  rmat: 'RefinedMaterials.png',
  emat: 'ExplosivePowder.png',
  hemat: 'HeavyExplosivePowder.png'
}
const IGNORE_PRIORITY_CATEGORIES = ['uniforms', 'supplies', 'parts']
const ORDER_STATUS: Record<number, string> = {
  1: 'preparing',
  2: 'in progress',
  3: 'completed',
  4: 'picked up',
  5: 'deleted'
}

const isCrated = (cat?: string): boolean => /crated/i.test(cat ?? '')

// MPF batch discount: each consecutive crate in an order is cheaper (down to 50%).
function calculateResourcePrice(basePrice: number, orders = 9): number {
  const discounts = [0.9, 0.8, 0.7, 0.6, 0.5, 0.5, 0.5, 0.5, 0.5]
  let totalPrice = 0
  discounts.slice(0, Math.max(orders, 3)).forEach((discount) => {
    totalPrice += Math.floor(basePrice * discount)
  })
  return totalPrice
}

// Port of frontend/src/utils/craftPacks.js::packOrders (FFD bin packing).
interface PackContainer {
  used: number
  remaining: number
  allocations: Array<{ orderId: number; crates: number }>
  containers?: number
}
function packOrders(orders: Array<{ id: number; crates: number }>, capacity: number): PackContainer[] {
  const containers: PackContainer[] = []
  const items: Array<{ orderId: number; crates: number }> = []

  for (const o of orders) {
    const n = o.crates | 0
    if (n <= 0) continue
    const full = Math.floor(n / capacity)
    const rem = n % capacity
    if (full > 0) {
      containers.push({
        used: capacity,
        remaining: 0,
        allocations: [{ orderId: o.id, crates: n }],
        containers: Math.ceil(n / capacity)
      })
    } else if (rem > 0) {
      items.push({ orderId: o.id, crates: rem })
    }
  }

  items.sort((a, b) => b.crates - a.crates)
  for (const it of items) {
    let placed = false
    for (const bin of containers) {
      if (bin.remaining >= it.crates) {
        bin.allocations.push(it)
        bin.used += it.crates
        bin.remaining -= it.crates
        placed = true
        break
      }
    }
    if (!placed) {
      containers.push({ used: it.crates, remaining: capacity - it.crates, allocations: [it] })
    }
  }
  return containers
}

const cardStyle: React.CSSProperties = {
  width: 280,
  flexShrink: 0,
  background: C.bg2,
  border: `1px solid ${C.line1}`,
  borderRadius: 8,
  padding: '8px 10px'
}

const cardLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '.06em',
  textTransform: 'uppercase',
  color: C.text3,
  whiteSpace: 'nowrap'
}

function ResourceCrates({ totals }: { totals: Record<string, number> }): React.ReactElement {
  return (
    <Flex gap={10} align="center" wrap>
      {Object.entries(totals).map(([key, value]) => {
        if (!value) return null
        const url = iconUrl(RESOURCE_ICONS[key])
        return (
          <Flex key={key} align="center" gap={3}>
            {url && <img src={url} width={16} height={16} alt={key} style={{ objectFit: 'contain' }} />}
            <Text type="secondary" style={{ fontSize: 11 }}>
              {Math.ceil(value / CRATE_SIZE[key])}
            </Text>
          </Flex>
        )
      })}
    </Flex>
  )
}

function ItemRow({ item }: { item: MpfItem }): React.ReactElement {
  const url = iconUrl(item.icon)
  return (
    <Flex align="center" gap={6} style={{ minWidth: 0, flex: 1 }}>
      {url && (
        <img src={url} width={22} height={22} alt={item.name} style={{ objectFit: 'contain', flexShrink: 0 }} />
      )}
      <Text style={{ fontSize: 12, color: C.warning, flexShrink: 0 }} strong>
        x{item.quantity}
      </Text>
      <Text style={{ fontSize: 12, minWidth: 0 }} ellipsis>
        {item.name}
      </Text>
    </Flex>
  )
}

// Same ordering workflow as the web app's MPFModal: suggest the most valuable
// item per category, prepare via checkbox, skip to the next in category, then
// pack prepared orders into transport rounds with discounted resource costs.
export default function MpfTaskView({ locationId, onChanged }: Props): React.ReactElement {
  const { message } = AntdApp.useApp()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [categoryItems, setCategoryItems] = useState<Record<string, MpfItem[]>>({})
  const [orders, setOrders] = useState<MpfItem[]>([]) // current suggestions
  const [prepared, setPrepared] = useState<MpfItem[]>([]) // orders with server ids
  const [startedIds, setStartedIds] = useState<Set<number>>(new Set())
  const [resources, setResources] = useState<Record<string, number>>({ bmat: 0, rmat: 0, emat: 0, hemat: 0 })
  const [occupied, setOccupied] = useState<Set<string>>(new Set())
  const [squad, setSquad] = useState('')
  const [transport, setTransport] = useState<'flatbed' | 'dunne'>('flatbed')
  const [activeOrders, setActiveOrders] = useState<MpfOrder[]>([])

  async function load(): Promise<void> {
    setLoading(true)
    try {
      const [c, l] = await Promise.all([
        call<CalcResponse>('mpfCalculateOrders', locationId),
        call<MpfOrder[]>('mpfOrderList', locationId)
      ])
      if (c.ok && c.data) {
        setOccupied(new Set((c.data.occupied_categories ?? []).map((x) => x.toLowerCase())))
        setResources(c.data.resources ?? {})
        if (c.data.squad) setSquad(c.data.squad)

        // Build the priced order list exactly like the web app.
        const orderList: MpfItem[] = Object.keys(c.data.total_request ?? {})
          .map((typeId) => {
            const base = c.data!.items?.[typeId]
            if (!base) return null
            const category = (base.category ?? '').toLowerCase()
            const quantity = isCrated(category) ? 5 : 9
            const price =
              (base.bmat ?? 0) + (base.emat ?? 0) * 5 * 2 + (base.rmat ?? 0) * 5 * 5 * 3 + (base.hemat ?? 0) * 5 * 9
            const categoryMultiplier = price > 1500 || IGNORE_PRIORITY_CATEGORIES.includes(category) ? 1 : 20
            return {
              ...base,
              quantity,
              price,
              order: (CATEGORY_ORDER[category] ?? 12) * categoryMultiplier
            } as MpfItem
          })
          .filter(Boolean) as MpfItem[]

        // Group by category, most valuable first; suggest the top of each group.
        const byCategory: Record<string, MpfItem[]> = {}
        orderList.forEach((item) => {
          ;(byCategory[item.category] ??= []).push({ ...item })
        })
        Object.values(byCategory).forEach((items) => items.sort((a, b) => b.price - a.price))
        setCategoryItems(byCategory)
        setOrders(Object.values(byCategory).map((items) => items[0]))
        setPrepared([])
        setStartedIds(new Set())
      } else message.error(c.error || 'Failed to load MPF orders')
      if (l.ok && Array.isArray(l.data)) setActiveOrders(l.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId])

  async function prepare(item: MpfItem): Promise<void> {
    setBusy(true)
    try {
      const res = await call<{ id: number }>('mpfOrderPrepare', locationId, item.type_id, item.quantity, squad)
      if (res.ok && res.data) {
        setOrders((prev) => prev.filter((o) => o.type_id !== item.type_id))
        setPrepared((prev) => [...prev, { ...item, id: res.data!.id }])
      } else message.error(res.error || 'Could not queue order')
    } finally {
      setBusy(false)
    }
  }

  // Replace the suggestion with the next most valuable item in its category.
  const skip = (item: MpfItem): void => {
    const items = categoryItems[item.category] || []
    const currentIndex = items.findIndex((i) => i.type_id === item.type_id)
    const nextItem = items[currentIndex + 1]
    setOrders((prev) =>
      nextItem ? prev.map((o) => (o.type_id === item.type_id ? nextItem : o)) : prev.filter((o) => o.type_id !== item.type_id)
    )
  }

  async function cancelPrepared(item: MpfItem): Promise<void> {
    if (!item.id) return
    setBusy(true)
    try {
      const res = await call('mpfOrderCancel', locationId, item.type_id, item.id)
      if (res.ok) {
        setPrepared((prev) => prev.filter((o) => o.id !== item.id))
        const { id: _id, ...back } = item
        setOrders((prev) => [...prev, back as MpfItem])
      } else message.error(res.error || 'Could not cancel')
    } finally {
      setBusy(false)
    }
  }

  async function startOrder(item: MpfItem): Promise<void> {
    if (!item.id) return
    setBusy(true)
    try {
      const res = await call('mpfOrderUpdate', locationId, item.type_id, item.id, 'start', squad)
      if (res.ok) setStartedIds((prev) => new Set([...prev, item.id!]))
      else message.error(res.error || 'Could not start')
    } finally {
      setBusy(false)
    }
  }

  async function pickup(o: MpfOrder): Promise<void> {
    const typeId = typeof o.type === 'object' ? o.type?.id : (o.type_id ?? o.type)
    setBusy(true)
    try {
      const res = await call('mpfOrderUpdate', locationId, typeId, o.id, 'pickup', squad)
      if (res.ok) {
        message.success('Picked up')
        load()
      } else message.error(res.error || 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  // Prepared orders packed into transport rounds, with discounted totals.
  const scheduledGroups = useMemo(() => {
    const capacity = transport === 'flatbed' ? 60 : 15
    const crated = prepared.map((item) => {
      const totals = {
        bmat: calculateResourcePrice(item.bmat ?? 0, item.quantity),
        rmat: calculateResourcePrice(item.rmat ?? 0, item.quantity),
        emat: calculateResourcePrice(item.emat ?? 0, item.quantity),
        hemat: calculateResourcePrice(item.hemat ?? 0, item.quantity)
      }
      const crates =
        transport === 'flatbed'
          ? Math.ceil(totals.bmat / 100) + Math.ceil(totals.rmat / 20) + Math.ceil(totals.emat / 40) + Math.ceil(totals.hemat / 30)
          : Math.ceil(totals.bmat / 100) + Math.ceil(totals.rmat / 100) + Math.ceil(totals.emat / 100) + Math.ceil(totals.hemat / 100)
      return { item, totals, crates }
    })

    const containers = packOrders(
      crated.map((c) => ({ id: c.item.type_id, crates: c.crates })),
      capacity
    )
    return containers.map((container) => {
      const totals: Record<string, number> = { bmat: 0, rmat: 0, emat: 0, hemat: 0 }
      const groupOrders = container.allocations
        .map(({ orderId }) => crated.find((c) => c.item.type_id === orderId))
        .filter(Boolean) as typeof crated
      groupOrders.forEach(({ totals: t }) => {
        totals.bmat += t.bmat
        totals.rmat += t.rmat
        totals.emat += t.emat
        totals.hemat += t.hemat
      })
      return { orders: groupOrders.map((g) => g.item), totals, fit: !(container.containers && container.containers > 1) }
    })
  }, [prepared, transport])

  const totalResources = useMemo(() => {
    const total: Record<string, number> = { bmat: 0, rmat: 0, emat: 0, hemat: 0 }
    scheduledGroups.forEach((g) =>
      Object.entries(g.totals).forEach(([k, v]) => {
        total[k] += v
      })
    )
    return total
  }, [scheduledGroups])

  const missingResources = useMemo(() => {
    const missing: Record<string, number> = {}
    Object.entries(totalResources).forEach(([key, value]) => {
      const m = Math.ceil(value / CRATE_SIZE[key]) - (resources[key] ?? 0)
      if (m > 0) missing[key] = m
    })
    return missing
  }, [totalResources, resources])

  if (loading) return <Spin />

  const sortedOrders = [...orders].sort((a, b) => a.order - b.order)
  const visibleActive = activeOrders.filter((o) => o.status !== 4 && o.status !== 5)

  return (
    <Flex gap={16} align="start" style={{ height: '100%', overflow: 'hidden' }}>
      <HeaderExtra>
        <Button size="small" type="primary" onClick={onChanged}>
          Done
        </Button>
      </HeaderExtra>

      {/* Left rail: squad, transport method, storage + costs. */}
      <Flex vertical gap={10} style={{ width: 230, flexShrink: 0 }}>
        <Input
          size="small"
          addonBefore="Squad"
          value={squad}
          maxLength={10}
          onChange={(e) => setSquad(e.target.value)}
          placeholder="(recommended)"
        />
        <Text type="secondary" style={{ fontSize: 11 }}>
          Transport
        </Text>
        <Segmented
          size="small"
          value={transport}
          onChange={(v) => setTransport(v as 'flatbed' | 'dunne')}
          options={[
            { label: 'Flatbed', value: 'flatbed' },
            { label: 'Dunne', value: 'dunne' }
          ]}
        />

        <Text type="secondary" style={{ fontSize: 11 }}>
          In storage (crates)
        </Text>
        <Flex gap={10} align="center" wrap>
          {Object.entries(RESOURCE_ICONS).map(([key, icon]) => {
            const url = iconUrl(icon)
            return (
              <Flex key={key} align="center" gap={3}>
                {url && <img src={url} width={16} height={16} alt={key} style={{ objectFit: 'contain' }} />}
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {Math.floor(resources[key] ?? 0)}
                </Text>
              </Flex>
            )
          })}
        </Flex>

        {Object.values(totalResources).some(Boolean) && (
          <>
            <Text type="secondary" style={{ fontSize: 11 }}>
              Cost to produce (crates)
            </Text>
            <ResourceCrates totals={totalResources} />
          </>
        )}

        {Object.keys(missingResources).length > 0 && (
          <>
            <Text type="warning" style={{ fontSize: 11 }}>
              Missing in storage (crates)
            </Text>
            <Flex gap={10} align="center" wrap>
              {Object.entries(missingResources).map(([key, value]) => {
                const url = iconUrl(RESOURCE_ICONS[key])
                return (
                  <Flex key={key} align="center" gap={3}>
                    {url && <img src={url} width={16} height={16} alt={key} style={{ objectFit: 'contain' }} />}
                    <Text type="warning" style={{ fontSize: 11 }}>
                      {value}
                    </Text>
                  </Flex>
                )
              })}
            </Flex>
          </>
        )}
      </Flex>

      {/* Content: suggested orders, scheduled rounds, active orders. */}
      <div
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
        {sortedOrders.length > 0 && (
          <div style={cardStyle}>
            <span style={cardLabelStyle}>Suggested orders</span>
            <div style={{ height: 1, background: C.line1, margin: '8px 0' }} />
            <Flex vertical gap={6}>
              {sortedOrders.map((item) => {
                const categoryGroup = categoryItems[item.category] || []
                const currentIndex = categoryGroup.findIndex((i) => i.type_id === item.type_id)
                const canSkip = currentIndex >= 0 && currentIndex < categoryGroup.length - 1
                const occ = occupied.has((item.category ?? '').toLowerCase())
                return (
                  <Tooltip key={item.type_id} title={occ ? 'Category is occupied by another order' : null}>
                    <Flex align="center" gap={8}>
                      <Checkbox disabled={busy} onChange={() => prepare(item)} />
                      <ItemRow item={item} />
                      {item.order >= 15 && <Tag style={{ marginInlineEnd: 0 }}>low prio</Tag>}
                      {occ && <WarningOutlined style={{ color: C.warning }} />}
                      {canSkip && (
                        <Tooltip title="Suggest the next most valuable item in this category">
                          <Button size="small" icon={<StepForwardOutlined />} onClick={() => skip(item)} />
                        </Tooltip>
                      )}
                    </Flex>
                  </Tooltip>
                )
              })}
            </Flex>
          </div>
        )}

        {scheduledGroups.map((group, index) => (
          <div key={`group-${index}`} style={{ ...cardStyle, borderColor: C.accentLine }}>
            <Flex justify="space-between" align="center" gap={8}>
              <span style={cardLabelStyle}>Round {index + 1}</span>
              {!group.fit && (
                <Tag color="warning" style={{ marginInlineEnd: 0 }}>
                  won&apos;t fit transport
                </Tag>
              )}
            </Flex>
            <div style={{ height: 1, background: C.line1, margin: '8px 0' }} />
            <Flex vertical gap={6}>
              {group.orders.map((item) => {
                const started = !!item.id && startedIds.has(item.id)
                return (
                  <Flex key={item.type_id} align="center" gap={8} style={{ opacity: started ? 0.5 : 1 }}>
                    <Checkbox checked disabled={busy || started} onChange={() => cancelPrepared(item)} />
                    <ItemRow item={item} />
                    <Button
                      size="small"
                      icon={<PlayCircleOutlined />}
                      disabled={started}
                      loading={busy}
                      onClick={() => startOrder(item)}
                    >
                      Started
                    </Button>
                  </Flex>
                )
              })}
            </Flex>
            <div style={{ height: 1, background: C.line1, margin: '8px 0' }} />
            <ResourceCrates totals={group.totals} />
          </div>
        ))}

        {visibleActive.length > 0 && (
          <div style={cardStyle}>
            <span style={cardLabelStyle}>Active orders</span>
            <div style={{ height: 1, background: C.line1, margin: '8px 0' }} />
            <Flex vertical gap={6}>
              {visibleActive.map((o) => {
                const type = typeof o.type === 'object' ? o.type : undefined
                const url = iconUrl(type?.icon)
                return (
                  <Flex key={o.id} align="center" gap={8}>
                    {url && <img src={url} width={22} height={22} alt="" style={{ objectFit: 'contain' }} />}
                    <Text style={{ fontSize: 12, flex: 1, minWidth: 0 }} ellipsis>
                      {o.quantity ? `x${o.quantity} ` : ''}
                      {type?.name ?? `#${o.id}`}
                    </Text>
                    <Tag style={{ marginInlineEnd: 0 }}>{ORDER_STATUS[o.status ?? 0] ?? String(o.status)}</Tag>
                    {(o.status === 2 || o.status === 3) && (
                      <Button size="small" icon={<TruckOutlined />} loading={busy} onClick={() => pickup(o)}>
                        Pick up
                      </Button>
                    )}
                  </Flex>
                )
              })}
            </Flex>
          </div>
        )}

        {sortedOrders.length === 0 && scheduledGroups.length === 0 && visibleActive.length === 0 && (
          <Text type="secondary">Nothing to order here.</Text>
        )}
      </div>
    </Flex>
  )
}
