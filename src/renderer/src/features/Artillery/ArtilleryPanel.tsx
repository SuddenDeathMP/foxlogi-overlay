import { useEffect, useState } from 'react'
import { App as AntdApp, Button, Dropdown, Flex, InputNumber, Popconfirm, Space, Switch, Tag, Tooltip, Typography } from 'antd'
import { BorderOuterOutlined, CloseOutlined, ColumnHeightOutlined, DeleteOutlined, ScanOutlined } from '@ant-design/icons'
import { C } from '../../theme/graphite'
import { useApp } from '../../stores/appStore'
import { useArtillery, type ArtyUnit, type CalibrationKind } from './store'
import { runAutoDetect } from './autoDetect'
import PlatformSelect from './PlatformSelect'
import WindCompass from './WindCompass'
import WindPowerBar from './WindPowerBar'
import { platformIcon } from './icons'
import { solve, type FiringSolution } from './lib/solution'

const { Text } = Typography

const cardStyle: React.CSSProperties = {
  background: C.bg2,
  border: `1px solid ${C.line1}`,
  borderRadius: 8,
  padding: '8px 10px'
}

const mono: React.CSSProperties = { fontFamily: 'monospace' }

function SolutionStat({ label, value, danger }: { label: string; value: string; danger?: boolean }): React.ReactElement {
  return (
    <div>
      <div style={{ fontSize: 10, lineHeight: 1.4, color: C.text3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ ...mono, fontSize: 18, lineHeight: 1.2, fontWeight: 600, color: danger ? C.danger : C.text1 }}>
        {value}
      </div>
    </div>
  )
}

function CalibrateOption({ title, hint }: { title: string; hint: string }): React.ReactElement {
  return (
    <div style={{ maxWidth: 240, whiteSpace: 'normal' }}>
      <div>{title}</div>
      <div style={{ fontSize: 11, lineHeight: 1.4, color: C.text3 }}>{hint}</div>
    </div>
  )
}

function ActiveSolution({ gun, target, sol }: { gun: ArtyUnit; target: ArtyUnit; sol: FiringSolution }): React.ReactElement {
  const specs = sol.specs
  const outOfRange = sol.inRange === false
  // Two fixed rows, so the card keeps its height whichever status is shown.
  return (
    <div style={{ ...cardStyle, padding: '6px 10px', borderColor: outOfRange ? C.danger : C.accentLine }}>
      <Flex justify="space-between" align="baseline" gap={8} style={{ fontSize: 11, lineHeight: 1.5, whiteSpace: 'nowrap' }}>
        <span style={{ color: C.text2 }}>
          {gun.label} → {target.label}
        </span>
        {/* Top-right status: the range warning replaces the setting when it can't be fired. */}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {outOfRange && specs ? (
            <span style={{ color: C.danger }}>
              Out of range ({specs.MIN_RANGE}–{specs.MAX_RANGE} m)
            </span>
          ) : sol.rounded != null ? (
            <span style={{ color: C.text3 }}>
              Set <span style={{ ...mono, color: C.text1 }}>{sol.rounded.toFixed(1)} m</span> · step{' '}
              {+specs!.RANGE_INCREMENT.toFixed(2)}
            </span>
          ) : null}
        </span>
      </Flex>
      <Flex justify="space-between" align="flex-end" gap={8}>
        <SolutionStat label="Distance" value={`${sol.distance.toFixed(1)} m`} danger={outOfRange} />
        <SolutionStat label="Azimuth" value={`${sol.azimuth.toFixed(1)}°`} />
      </Flex>
    </div>
  )
}

/** Artillery HUD shown in the left safe zone while artillery mode is on. */
export default function ArtilleryPanel(): React.ReactElement {
  const mode = useArtillery((s) => s.mode)
  const units = useArtillery((s) => s.units)
  const activeGunId = useArtillery((s) => s.activeGunId)
  const activeTargetId = useArtillery((s) => s.activeTargetId)
  const wind = useArtillery((s) => s.wind)
  const setMode = useArtillery((s) => s.setMode)
  const setCalibrating = useArtillery((s) => s.setCalibrating)
  const select = useArtillery((s) => s.select)
  const removeUnit = useArtillery((s) => s.removeUnit)
  const setPlatform = useArtillery((s) => s.setPlatform)
  const setWind = useArtillery((s) => s.setWind)
  const clearAll = useArtillery((s) => s.clearAll)
  const detecting = useArtillery((s) => s.detecting)
  const gridDetectHotkey = useApp((s) => s.settings?.gridDetectHotkey)
  const { message } = AntdApp.useApp()

  // Azimuth input keeps a draft while typing and snaps to 5° on commit.
  const [azDraft, setAzDraft] = useState<number | null>(wind.azimuth)
  useEffect(() => setAzDraft(wind.azimuth), [wind.azimuth])
  const commitAz = (): void => {
    if (azDraft == null) setAzDraft(wind.azimuth)
    else setWind({ azimuth: azDraft })
  }

  const guns = units.filter((u) => u.kind === 'gun')
  const targets = units.filter((u) => u.kind === 'target')
  const activeGun = guns.find((g) => g.id === activeGunId)
  const activeTarget = targets.find((t) => t.id === activeTargetId)
  const solFor = (g: ArtyUnit): FiringSolution | null =>
    activeTarget ? solve(g, g.platform, activeTarget, wind) : null
  const activeSol = activeGun ? solFor(activeGun) : null

  return (
    <div className="scroll-y" style={{ padding: 12, boxSizing: 'border-box' }}>
      <Space orientation="vertical" style={{ width: '100%' }} size={10}>
        <Flex justify="space-between" align="center" gap={8}>
          <Text strong style={{ letterSpacing: 0.5 }}>
            Artillery
          </Text>
          <Popconfirm
            title="Remove all guns and targets?"
            okText="Clear"
            cancelText="Cancel"
            onConfirm={clearAll}
            disabled={units.length === 0}
          >
            <Tooltip title="Clear all">
              <Button size="small" icon={<DeleteOutlined />} disabled={units.length === 0} aria-label="Clear all" />
            </Tooltip>
          </Popconfirm>
        </Flex>

        <Flex gap={6}>
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                {
                  key: 'cell',
                  icon: <BorderOuterOutlined />,
                  label: <CalibrateOption title="By grid cell" hint="Drag across one map grid square" />
                },
                {
                  key: 'hex',
                  icon: <ColumnHeightOutlined />,
                  label: (
                    <CalibrateOption
                      title="By hex height"
                      hint="Drag the region's top edge to its bottom edge — works zoomed out, without the grid"
                    />
                  )
                }
              ],
              onClick: ({ key }) => setCalibrating(key as CalibrationKind)
            }}
          >
            <Button size="small" block icon={<BorderOuterOutlined />}>
              Calibrate
            </Button>
          </Dropdown>
          <Tooltip
            title={`Find the grid automatically: zoom the map in until its grid lines show${gridDetectHotkey ? ` (${gridDetectHotkey})` : ''}`}
          >
            <Button size="small" block icon={<ScanOutlined />} loading={detecting} onClick={() => runAutoDetect(message)}>
              Auto-detect
            </Button>
          </Tooltip>
        </Flex>

        <Tooltip title="Show the grid and right-click the map to place guns and targets">
          <Flex justify="space-between" align="center" gap={8}>
            <Text>Edit mode</Text>
            <Switch
              size="small"
              checked={mode === 'edit'}
              onChange={(on) => {
                setMode(on ? 'edit' : 'locked')
                // Entering Edit mode re-syncs to the game's grid first.
                if (on) void runAutoDetect(message)
              }}
            />
          </Flex>
        </Tooltip>

        {activeGun && activeTarget && activeSol ? (
          <ActiveSolution gun={activeGun} target={activeTarget} sol={activeSol} />
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {mode === 'edit'
              ? 'Open the map, calibrate the grid, then right-click the map to place a gun and a target.'
              : 'Turn on Edit mode to place guns and targets.'}
          </Text>
        )}

        <Text type="secondary">Wind — blowing toward</Text>
        <Flex gap={12} align="center">
          <WindCompass value={wind.azimuth} onChange={(azimuth) => setWind({ azimuth })} />
          <Space orientation="vertical" size={8}>
            <InputNumber
              size="small"
              // -5 / 360 let the stepper wrap; the store normalizes to 0–355.
              min={-5}
              max={360}
              step={5}
              value={azDraft}
              onChange={(v) => setAzDraft(typeof v === 'number' ? v : null)}
              onStep={(v) => setWind({ azimuth: v })}
              onBlur={commitAz}
              onPressEnter={commitAz}
              suffix="°"
              style={{ width: 84 }}
            />
            <WindPowerBar value={wind.tier} onChange={(tier) => setWind({ tier })} />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Tier <span style={{ ...mono, color: C.text1 }}>{wind.tier}</span>
            </Text>
          </Space>
        </Flex>

        {guns.length > 0 && (
          <>
            <Text type="secondary">Guns</Text>
            {guns.map((g) => {
              const active = g.id === activeGunId
              const sol = guns.length > 1 ? solFor(g) : null
              return (
                <div
                  key={g.id}
                  onClick={() => select(g.id)}
                  style={{ ...cardStyle, cursor: 'pointer', borderColor: active ? C.accentLine : C.line1 }}
                >
                  <Flex align="center" gap={8} style={{ marginBottom: 6 }}>
                    <img src={platformIcon(g.platform)} alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} />
                    <Text strong style={{ color: active ? C.accent : undefined, flex: 1 }}>
                      {g.label}
                    </Text>
                    {sol && (
                      <span style={{ ...mono, fontSize: 12, color: sol.inRange === false ? C.danger : C.text2 }}>
                        {sol.distance.toFixed(1)} m · {sol.azimuth.toFixed(1)}°
                      </span>
                    )}
                    <Button
                      type="text"
                      size="small"
                      icon={<CloseOutlined />}
                      aria-label={`Remove ${g.label}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        removeUnit(g.id)
                      }}
                    />
                  </Flex>
                  <PlatformSelect value={g.platform} onChange={(p) => setPlatform(g.id, p)} />
                </div>
              )
            })}
          </>
        )}

        {targets.length > 0 && (
          <>
            <Text type="secondary">Targets</Text>
            <Flex wrap gap={6}>
              {targets.map((t) => {
                const active = t.id === activeTargetId
                return (
                  <Tag
                    key={t.id}
                    closable
                    onClose={(e) => {
                      e.preventDefault()
                      removeUnit(t.id)
                    }}
                    onClick={() => select(t.id)}
                    style={{
                      cursor: 'pointer',
                      marginInlineEnd: 0,
                      color: active ? C.danger : undefined,
                      borderColor: active ? C.danger : undefined
                    }}
                  >
                    {t.label}
                  </Tag>
                )
              })}
            </Flex>
          </>
        )}
      </Space>
    </div>
  )
}
