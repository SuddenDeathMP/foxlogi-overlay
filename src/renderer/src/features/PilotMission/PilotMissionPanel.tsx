import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Select,
  Space,
  Typography,
  Tag,
  InputNumber,
  List,
  Popconfirm,
  Spin,
  Modal,
  Segmented,
  App as AntdApp
} from 'antd'
import { call } from '../../lib/api'
import { useApp } from '../../stores/appStore'

const { Text } = Typography

const AIRCRAFT_TYPE = { SCOUT: 1, FIGHTER: 2, DIVE_BOMBER: 3, TORPEDO_BOMBER: 4, BOMBER: 5 }

interface Aircraft {
  id: number
  label?: string
  short_name?: string
  icon?: string
  type?: number
}
interface Kill {
  id: number
  aircraft?: Aircraft
  kill_type?: number
  points?: number
}
interface Mission {
  id: number
  aircraft?: Aircraft
  created_at: string
  bombing_raids?: number
  torpedo_shots?: number
  tanks_killed?: number
  kills?: Kill[]
}
interface Journal {
  active_mission: Mission | null
  aircrafts: Aircraft[]
  enemy_aircrafts: Aircraft[]
  kill_types: Array<{ value: number; label: string }>
}

function fmt(seconds: number): string {
  const s = Math.max(0, seconds | 0)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  return [h, m, r].map((n) => String(n).padStart(2, '0')).join(':')
}

// Pilot aircraft icons are served at host-relative `/static-assets/aircraft/...`.
function aircraftIcon(host: string | undefined, icon?: string): string | undefined {
  if (!icon) return undefined
  if (/^https?:\/\//.test(icon)) return icon
  return `${(host ?? '').replace(/\/+$/, '')}${icon}`
}

export default function PilotMissionPanel(): React.ReactElement {
  const { message } = AntdApp.useApp()
  const host = useApp((s) => s.auth?.host)
  const [journal, setJournal] = useState<Journal | null>(null)
  const [loading, setLoading] = useState(false)
  const [mission, setMission] = useState<Mission | null>(null)
  const [pick, setPick] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [killOpen, setKillOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const updateTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function load(): Promise<void> {
    setLoading(true)
    try {
      const res = await call<Journal>('pilotJournalGet')
      if (res.ok && res.data) {
        setJournal(res.data)
        setMission(res.data.active_mission)
        if (!pick && res.data.aircrafts[0]) setPick(res.data.aircrafts[0].id)
      } else message.error(res.error || 'Failed to load pilot journal')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startedAt = useMemo(
    () => (mission ? new Date(mission.created_at).getTime() : 0),
    [mission?.created_at]
  )
  useEffect(() => {
    if (!mission) return
    const tick = (): void => setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startedAt, mission])

  const type = mission?.aircraft?.type
  const canLogKills = type === AIRCRAFT_TYPE.SCOUT || type === AIRCRAFT_TYPE.FIGHTER
  const counter = useMemo(() => {
    if (type === AIRCRAFT_TYPE.BOMBER) return { key: 'bombing_raids' as const, label: 'Bombing raids' }
    if (type === AIRCRAFT_TYPE.TORPEDO_BOMBER)
      return { key: 'torpedo_shots' as const, label: 'Torpedo shots' }
    if (type === AIRCRAFT_TYPE.SCOUT) return { key: 'tanks_killed' as const, label: 'Vehicles killed' }
    if (type === AIRCRAFT_TYPE.DIVE_BOMBER) return { key: 'tanks_killed' as const, label: 'Tanks killed' }
    return null
  }, [type])

  async function start(): Promise<void> {
    if (!pick) return
    setBusy(true)
    try {
      const res = await call<Mission>('pilotMissionStart', pick)
      if (res.ok && res.data) {
        setMission(res.data)
        message.success('Mission started.')
      } else message.error(res.error || 'Could not start mission')
    } finally {
      setBusy(false)
    }
  }

  function bumpCounter(value: number): void {
    if (!mission || !counter) return
    setMission({ ...mission, [counter.key]: value })
    if (updateTimer.current) clearTimeout(updateTimer.current)
    updateTimer.current = setTimeout(async () => {
      const res = await call<Mission>('pilotMissionUpdate', mission.id, { [counter.key]: value })
      if (res.ok && res.data) setMission(res.data)
    }, 400)
  }

  async function addKill(aircraftId: number, killType: number): Promise<void> {
    if (!mission) return
    setBusy(true)
    try {
      const res = await call<Kill>('pilotKillCreate', mission.id, aircraftId, killType)
      if (res.ok && res.data) {
        setMission({ ...mission, kills: [res.data, ...(mission.kills || [])] })
        setKillOpen(false)
      } else message.error(res.error || 'Failed to log kill')
    } finally {
      setBusy(false)
    }
  }

  async function delKill(killId: number): Promise<void> {
    if (!mission) return
    const res = await call('pilotKillDelete', mission.id, killId)
    if (res.ok) setMission({ ...mission, kills: (mission.kills || []).filter((k) => k.id !== killId) })
  }

  async function end(isLost: boolean): Promise<void> {
    if (!mission) return
    setBusy(true)
    try {
      const res = await call('pilotMissionFinish', mission.id, isLost)
      if (res.ok) {
        message.success(isLost ? 'Mission ended — aircraft lost' : 'Mission ended — returned')
        setMission(null)
        load()
      } else message.error(res.error || 'Failed to end mission')
    } finally {
      setBusy(false)
    }
  }

  if (loading && !journal) return <Spin style={{ display: 'block', margin: '24px auto' }} />

  if (!mission) {
    return (
      <Space direction="vertical" style={{ width: '100%' }} size={10}>
        <Text type="secondary">Start a mission</Text>
        <Select
          style={{ width: '100%' }}
          value={pick ?? undefined}
          onChange={setPick}
          options={(journal?.aircrafts || []).map((a) => ({
            value: a.id,
            label: a.label || a.short_name
          }))}
        />
        <Button type="primary" block loading={busy} onClick={start}>
          Start mission
        </Button>
      </Space>
    )
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={10}>
      <Space>
        <img
          src={aircraftIcon(host, mission.aircraft?.icon)}
          width={40}
          height={40}
          alt={mission.aircraft?.short_name}
          style={{ objectFit: 'contain' }}
          onError={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = 'hidden')}
        />
        <div>
          <Text strong>{mission.aircraft?.label || mission.aircraft?.short_name}</Text>
          <br />
          <Text type="secondary" style={{ fontFamily: 'monospace' }}>
            {fmt(elapsed)}
          </Text>
        </div>
      </Space>

      {canLogKills && (
        <Space direction="vertical" style={{ width: '100%' }} size={6}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary">Kills ({(mission.kills || []).length})</Text>
            <Button size="small" type="primary" onClick={() => setKillOpen(true)}>
              Log kill
            </Button>
          </div>
          {(mission.kills || []).length > 0 && (
            <List
              size="small"
              dataSource={mission.kills}
              renderItem={(k) => (
                <List.Item
                  actions={[
                    <Popconfirm
                      key="d"
                      title="Remove this kill?"
                      onConfirm={() => delKill(k.id)}
                    >
                      <Button type="text" danger size="small">
                        ✕
                      </Button>
                    </Popconfirm>
                  ]}
                >
                  <Space>
                    <Text strong>{k.aircraft?.short_name}</Text>
                    <Tag>
                      {journal?.kill_types.find((t) => t.value === k.kill_type)?.label ?? k.kill_type}
                    </Tag>
                  </Space>
                </List.Item>
              )}
            />
          )}
        </Space>
      )}

      {counter && (
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <Text type="secondary">{counter.label}</Text>
          <Space>
            <Button
              size="small"
              onClick={() => bumpCounter(Math.max(0, (mission[counter.key] || 0) - 1))}
            >
              −
            </Button>
            <InputNumber
              size="small"
              min={0}
              value={mission[counter.key] || 0}
              onChange={(v) => bumpCounter(Math.max(0, (v as number) | 0))}
              style={{ width: 70 }}
            />
            <Button
              size="small"
              type="primary"
              onClick={() => bumpCounter((mission[counter.key] || 0) + 1)}
            >
              +
            </Button>
          </Space>
        </Space>
      )}

      <Space style={{ width: '100%' }}>
        <Popconfirm title="Returned safely?" onConfirm={() => end(false)}>
          <Button type="primary" loading={busy}>
            Returned
          </Button>
        </Popconfirm>
        <Popconfirm title="Aircraft lost?" onConfirm={() => end(true)}>
          <Button danger loading={busy}>
            Lost
          </Button>
        </Popconfirm>
      </Space>

      <KillModal
        open={killOpen}
        host={host}
        enemyAircrafts={journal?.enemy_aircrafts || []}
        killTypes={journal?.kill_types || []}
        busy={busy}
        onCancel={() => setKillOpen(false)}
        onConfirm={addKill}
      />
    </Space>
  )
}

function KillModal({
  open,
  host,
  enemyAircrafts,
  killTypes,
  busy,
  onCancel,
  onConfirm
}: {
  open: boolean
  host?: string
  enemyAircrafts: Aircraft[]
  killTypes: Array<{ value: number; label: string }>
  busy: boolean
  onCancel: () => void
  onConfirm: (aircraftId: number, killType: number) => void
}): React.ReactElement {
  const [aircraftId, setAircraftId] = useState<number>(enemyAircrafts[0]?.id ?? 1)
  const [killType, setKillType] = useState<number>(3)

  useEffect(() => {
    if (open && enemyAircrafts[0]) setAircraftId(enemyAircrafts[0].id)
  }, [open, enemyAircrafts])

  return (
    <Modal
      open={open}
      title="Log a kill"
      onCancel={onCancel}
      onOk={() => onConfirm(aircraftId, killType)}
      okButtonProps={{ loading: busy }}
      okText="Log kill"
      getContainer={false}
      destroyOnHidden
      width={420}
    >
      <Space direction="vertical" size={16} style={{ width: '100%', margin: '12px 0' }}>
        <div>
          <Text type="secondary">Target aircraft</Text>
          <Segmented
            block
            value={aircraftId}
            onChange={(v) => setAircraftId(v as number)}
            options={enemyAircrafts.map((a) => ({
              value: a.id,
              label: (
                <div style={{ padding: '2px 0', textAlign: 'center' }}>
                  <img
                    src={aircraftIcon(host, a.icon)}
                    alt={a.short_name}
                    style={{ width: 40, height: 40, objectFit: 'contain', display: 'block', margin: '0 auto' }}
                    onError={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = 'hidden')}
                  />
                  <div style={{ fontSize: 11 }}>{a.short_name}</div>
                </div>
              )
            }))}
          />
        </div>
        <div>
          <Text type="secondary">Kill type</Text>
          <Segmented
            block
            value={killType}
            onChange={(v) => setKillType(v as number)}
            options={killTypes.map((kt) => ({ value: kt.value, label: kt.label }))}
          />
        </div>
      </Space>
    </Modal>
  )
}
