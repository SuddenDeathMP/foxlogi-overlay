import { useEffect, useMemo, useState } from 'react'
import { Button, Flex, Popconfirm, Space, Spin, Typography, App as AntdApp } from 'antd'
import { CheckOutlined } from '@ant-design/icons'
import { call } from '../../../lib/api'
import { HeaderExtra, wheelToHorizontal } from './common'
import { useApp, iconUrl } from '../../../stores/appStore'
import { C } from '../../../theme/graphite'
import type { LogiItem } from '@shared/types'

const { Text } = Typography

interface CraftTask {
  id: number
  request_stock?: Record<string, number>
  stock?: Record<string, number>
}

interface Props {
  locationId: number
  payload: { items?: Record<string, number>; crates?: number }
  onChanged: () => void
}

// Mirrors the web app's CraftCrates: craft in proportional batches per category.
const BATCH_SIZE = 4
const EXCLUDED_CATEGORIES = new Set([
  'Vehicles',
  'Structures',
  'CratedVehicles',
  'CratedStructures'
])

// Fixed display order for category cards; anything else goes last.
const CATEGORY_DISPLAY_ORDER = [
  'smallarms',
  'heavyarms',
  'heavyammo',
  'utility',
  'supplies',
  'medical',
  'uniforms'
]
const categoryRank = (category: string): number => {
  const idx = CATEGORY_DISPLAY_ORDER.indexOf(category.toLowerCase())
  return idx === -1 ? CATEGORY_DISPLAY_ORDER.length : idx
}

const RESOURCE_ICONS: Record<string, string> = {
  bmat: 'BasicMaterials.png',
  rmat: 'RefinedMaterials.png',
  emat: 'ExplosivePowder.png',
  hemat: 'HeavyExplosivePowder.png'
}

interface BatchEntry {
  id: string
  item: LogiItem
  quantity: number
}

const fmt = (n: number): string => (n ?? 0).toLocaleString('en-US')

// Top progress block with thin bar, ported from the web app's ProgressBlock.
function ProgressBlock({ crafted, total }: { crafted: number; total: number }): React.ReactElement {
  const percent = total > 0 ? Math.round((crafted / total) * 100) : 0
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 8
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: C.text3,
            fontWeight: 600,
            letterSpacing: '.08em',
            textTransform: 'uppercase'
          }}
        >
          Crates crafted
        </span>
        <span
          style={{
            fontSize: 14,
            color: C.text1,
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums'
          }}
        >
          {fmt(crafted)} <span style={{ color: C.text3, fontSize: 12 }}>/ {fmt(total)}</span>
          <span style={{ marginLeft: 8, fontSize: 11, color: C.text3 }}>{percent}%</span>
        </span>
      </div>
      <div style={{ height: 5, borderRadius: 999, background: C.line1, overflow: 'hidden' }}>
        <div
          style={{
            width: `${Math.min(100, percent)}%`,
            height: '100%',
            background: percent >= 100 ? C.positive : C.accent,
            transition: 'width .3s ease'
          }}
        />
      </div>
    </div>
  )
}

export default function CraftTaskView({ locationId, payload, onChanged }: Props): React.ReactElement {
  const { message } = AntdApp.useApp()
  const itemsById = useApp((s) => s.itemsById)
  const [task, setTask] = useState<CraftTask | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [categoryBatchIndex, setCategoryBatchIndex] = useState<Record<string, number>>({})

  async function load(): Promise<void> {
    setLoading(true)
    try {
      const res = await call<CraftTask>('getCraftTask', locationId, payload.items ?? {})
      if (res.ok && res.data) setTask(res.data)
      else message.error(res.error || 'Failed to load craft task')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId])

  // Render from the live plan items (same as the web app's CraftCrates); the
  // stored task only contributes crafted counts. An unfinished task at this
  // location may carry a stale request_stock snapshot — never render from it.
  const request = payload.items ?? {}
  const stock = task?.stock ?? {}

  // Group requested items by category, then split each category into
  // proportional batches of BATCH_SIZE crates (same algorithm as the web app).
  const categoryBatches = useMemo(() => {
    const categories: Record<string, { id: string; item: LogiItem; needed: number; crafted: number }[]> = {}

    Object.entries(request).forEach(([itemId, quantity]) => {
      const item = itemsById[itemId]
      if (!item) return
      if (item.category && EXCLUDED_CATEGORIES.has(item.category)) return

      const category = item.category || 'Other'
      ;(categories[category] ??= []).push({
        id: itemId,
        item,
        needed: quantity || 0,
        crafted: Number(stock[itemId] || 0)
      })
    })

    const result: Record<string, BatchEntry[][]> = {}
    Object.entries(categories).forEach(([category, items]) => {
      const batches: BatchEntry[][] = []
      const totalNeeded = items.reduce((sum, i) => sum + Math.max(i.needed - i.crafted, 0), 0)
      if (totalNeeded <= 0) {
        result[category] = batches
        return
      }

      const remaining = items.map((i) => ({ ...i, remaining: Math.max(i.needed - i.crafted, 0) }))

      while (remaining.some((i) => i.remaining > 0)) {
        const batch: BatchEntry[] = []
        let batchSize = 0

        // Prioritize items with the largest remaining share for proportional distribution.
        remaining.sort((a, b) => {
          const ratioA = a.remaining / Math.max(a.needed, 1)
          const ratioB = b.remaining / Math.max(b.needed, 1)
          return ratioB - ratioA
        })

        for (const entry of remaining) {
          if (entry.remaining <= 0) continue
          if (batchSize >= BATCH_SIZE) break
          const toAdd = Math.min(entry.remaining, BATCH_SIZE - batchSize)
          if (toAdd > 0) {
            batch.push({ id: entry.id, item: entry.item, quantity: toAdd })
            entry.remaining -= toAdd
            batchSize += toAdd
          }
        }

        // Pad short final batches up to BATCH_SIZE with the first item.
        if (batch.length > 0 && batchSize < BATCH_SIZE) {
          batch[0].quantity += BATCH_SIZE - batchSize
        }

        if (batch.length > 0) batches.push(batch)
        if (batches.length > 100) break
      }

      result[category] = batches
    })

    return result
  }, [request, stock, itemsById])

  const progress = useMemo(() => {
    let crafted = 0
    let total = 0
    Object.entries(request).forEach(([itemId, quantity]) => {
      const item = itemsById[itemId]
      if (!item) return
      if (item.category && EXCLUDED_CATEGORIES.has(item.category)) return
      total += quantity || 0
      crafted += Number(stock[itemId] || 0)
    })
    return { crafted, total }
  }, [request, stock, itemsById])

  const calculateBatchCost = (batch: BatchEntry[]): Record<string, number> => {
    const cost: Record<string, number> = { bmat: 0, rmat: 0, emat: 0, hemat: 0 }
    batch.forEach(({ item, quantity }) => {
      if (item.bmat) cost.bmat += item.bmat * quantity
      if (item.rmat) cost.rmat += item.rmat * quantity
      if (item.emat) cost.emat += item.emat * quantity
      if (item.hemat) cost.hemat += item.hemat * quantity
    })
    return cost
  }

  async function craftBatch(batch: BatchEntry[], category: string): Promise<void> {
    const items: Record<string, number> = {}
    batch.forEach(({ id, quantity }) => {
      items[id] = quantity
    })
    setBusy(true)
    try {
      const res = await call<CraftTask>('craftTaskAction', locationId, 'craft_batch', { items })
      if (res.ok && res.data) {
        setTask(res.data)
        setCategoryBatchIndex((prev) => ({ ...prev, [category]: (prev[category] || 0) + 1 }))
      } else message.error(res.error || 'Craft failed')
    } finally {
      setBusy(false)
    }
  }

  const skipBatch = (category: string): void => {
    setCategoryBatchIndex((prev) => ({ ...prev, [category]: (prev[category] || 0) + 1 }))
  }

  async function finish(): Promise<void> {
    setBusy(true)
    try {
      const res = await call<{ status?: string; points?: number }>(
        'craftTaskAction',
        locationId,
        'finish'
      )
      if (res.ok) {
        message.success(`Craft task finished${res.data?.points ? ` (+${res.data.points} pts)` : ''}`)
        onChanged()
      } else message.error(res.error || 'Could not finish')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Spin />

  const activeCards = Object.entries(categoryBatches)
    .sort(([a], [b]) => categoryRank(a) - categoryRank(b))
    .map(([category, batches]) => {
      const currentIndex = categoryBatchIndex[category] || 0
      const currentBatch = batches[currentIndex]
      return currentBatch ? { category, batches, currentIndex, currentBatch } : null
    })
    .filter(Boolean) as {
    category: string
    batches: BatchEntry[][]
    currentIndex: number
    currentBatch: BatchEntry[]
  }[]

  return (
    <div
      onWheel={wheelToHorizontal}
      style={{
        // Height-driven column flow: cards stack top→bottom and wrap into the
        // next column when the strip height is exhausted — never clipped, and
        // short cards (avg 2 items × up to 9 categories) pack densely.
        display: 'flex',
        flexDirection: 'column',
        flexWrap: 'wrap',
        alignContent: 'flex-start',
        gap: 10,
        height: '100%',
        overflowX: 'auto',
        overflowY: 'hidden'
      }}
    >
      <HeaderExtra>
        <Flex gap={14} align="center">
          <div style={{ width: 200 }}>
            <ProgressBlock crafted={progress.crafted} total={progress.total} />
          </div>
          <Popconfirm title="Finish this craft task?" onConfirm={finish} okText="Yes" cancelText="No">
            <Button type="primary" size="small" icon={<CheckOutlined />} loading={busy}>
              Finish task
            </Button>
          </Popconfirm>
        </Flex>
      </HeaderExtra>

      {activeCards.map(({ category, batches, currentIndex, currentBatch }) => {
        const cost = calculateBatchCost(currentBatch)

        return (
          <div
            key={category}
            style={{
              width: 185,
              flexShrink: 0,
              background: C.bg2,
              borderRadius: 8,
              padding: '5px 10px',
              // minHeight: 135
            }}
          >
            <Flex justify="space-between" align="baseline" gap={8}>

              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                  color: C.text3,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {category}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: C.text3,
                  whiteSpace: 'nowrap',
                  fontVariantNumeric: 'tabular-nums'
                }}
              >
                {currentIndex + 1} / {batches.length}
              </span>
            </Flex>

            <div style={{ height: 1, background: C.line1, margin: '5px 0' }} />

            <Flex vertical gap={3}>
              {currentBatch.map(({ id, item, quantity }) => {
                const url = iconUrl(item.icon)
                return (
                  <Flex key={id} align="center" gap={6}>
                    {url && (
                      <img
                        src={url}
                        width={20}
                        height={20}
                        alt={item.name}
                        style={{ objectFit: 'contain', flexShrink: 0 }}
                        onError={(e) =>
                          ((e.currentTarget as HTMLImageElement).style.visibility = 'hidden')
                        }
                      />
                    )}
                    <Text style={{ fontSize: 12, flex: 1, minWidth: 0 }} ellipsis>
                      {item.name}
                    </Text>
                    <Text strong style={{ fontSize: 12, color: C.warning }}>
                      x{quantity}
                    </Text>
                  </Flex>
                )
              })}
            </Flex>

            <div style={{ height: 1, background: C.line1, margin: '5px 0' }} />

            <Flex justify="space-between" align="center" gap={8} wrap>
              <Flex gap={10} align="center" wrap style={{ minWidth: 0 }}>
                {Object.entries(RESOURCE_ICONS).map(([key, icon]) => {
                  if (!cost[key]) return null
                  const url = iconUrl(icon)
                  return (
                    <Flex key={key} align="center" gap={3}>
                      {url && (
                        <img
                          src={url}
                          width={16}
                          height={16}
                          alt={key}
                          style={{ objectFit: 'contain' }}
                        />
                      )}
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {cost[key]}
                      </Text>
                    </Flex>
                  )
                })}
              </Flex>
              <Space size={6} style={{ marginLeft: 'auto' }}>
                <Button size="small" onClick={() => skipBatch(category)}>
                  Skip
                </Button>
                <Button
                  type="primary"
                  size="small"
                  icon={<CheckOutlined />}
                  loading={busy}
                  onClick={() => craftBatch(currentBatch, category)}
                >
                  Crafted
                </Button>
              </Space>
            </Flex>
          </div>
        )
      })}
    </div>
  )
}
