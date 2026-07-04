import { useCallback, useEffect, useState } from 'react'
import { Button, Collapse, Empty, Space, Spin, Tag, Typography, App as AntdApp } from 'antd'
import { call } from '../../lib/api'
import ItemIcon from '../../components/ItemIcon'
import TaskSheet, { type TaskContext } from './TaskSheet'

const { Text } = Typography

// The planner payload (foxhole/logistic.py::LogisticPlanner.process) is a nested
// structure keyed by location. We render it defensively and let TaskSheet drive
// the concrete task-action endpoints.
interface PlannerData {
  transport?: Record<string, unknown>
  resource?: Record<string, unknown>
  craft?: Record<string, unknown>
  mpf?: Record<string, unknown>
  locations?: Record<string, { id?: number; name?: string; title?: string }>
  items?: Record<string, { code_name?: string; name?: string; icon?: string }>
}

function locName(planner: PlannerData, id: string): string {
  const loc = planner.locations?.[id]
  return loc?.name || loc?.title || `Location ${id}`
}

export default function LogisticsPanel(): React.ReactElement {
  const { message } = AntdApp.useApp()
  const [loading, setLoading] = useState(false)
  const [planner, setPlanner] = useState<PlannerData | null>(null)
  const [task, setTask] = useState<TaskContext | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await call<PlannerData>('logisticPlanner')
      if (res.ok) setPlanner(res.data ?? {})
      else message.error(res.error || 'Failed to load planner')
    } finally {
      setLoading(false)
    }
  }, [message])

  useEffect(() => {
    load()
  }, [load])

  if (loading && !planner) return <Spin style={{ display: 'block', margin: '24px auto' }} />

  const categories: Array<{ key: keyof PlannerData; label: string }> = [
    { key: 'transport', label: 'Transport' },
    { key: 'craft', label: 'Craft' },
    { key: 'resource', label: 'Refine' },
    { key: 'mpf', label: 'MPF' }
  ]

  const buildItems = categories
    .map((cat) => {
      const group = (planner?.[cat.key] as Record<string, unknown>) || {}
      const locIds = Object.keys(group)
      if (locIds.length === 0) return null
      return {
        key: cat.key,
        label: (
          <Space>
            <Text strong>{cat.label}</Text>
            <Tag>{locIds.length}</Tag>
          </Space>
        ),
        children: (
          <Space direction="vertical" style={{ width: '100%' }} size={6}>
            {locIds.map((id) => (
              <div
                key={id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8
                }}
              >
                <Text ellipsis style={{ maxWidth: 150 }}>
                  {locName(planner!, id)}
                </Text>
                <Button
                  size="small"
                  type="primary"
                  onClick={() =>
                    setTask({
                      category: cat.key as TaskContext['category'],
                      locationId: Number(id),
                      locationName: locName(planner!, id),
                      payload: group[id],
                      locations: (planner?.locations ?? {}) as Record<
                        string,
                        { name?: string; title?: string }
                      >
                    })
                  }
                >
                  Begin
                </Button>
              </div>
            ))}
          </Space>
        )
      }
    })
    .filter(Boolean) as NonNullable<unknown>[]

  return (
    <>
      {/* The task drawer is transparent — hide the list behind it while open. */}
      <Space
        direction="vertical"
        style={{ width: '100%', display: task ? 'none' : undefined }}
        size={8}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text type="secondary">Logistics</Text>
          <Button size="small" onClick={load} loading={loading}>
            Refresh
          </Button>
        </div>
        {buildItems.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No logistics tasks" />
        ) : (
          <Collapse size="small" accordion items={buildItems as never} />
        )}
        <div style={{ display: 'none' }}>
          {/* preload an icon so the catalog resolves visually */}
          <ItemIcon code="Bmat" size={1} />
        </div>
      </Space>
      <TaskSheet task={task} onClose={() => setTask(null)} onChanged={load} />
    </>
  )
}
