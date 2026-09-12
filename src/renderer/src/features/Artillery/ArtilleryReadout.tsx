import { C } from '../../theme/graphite'
import { useArtillery } from './store'
import { solve } from './lib/solution'

/** Compact active solution (gun → target, distance · azimuth) shown next to the
 *  overlay toggle while the overlay is collapsed. Renders nothing without one. */
export default function ArtilleryReadout(): React.ReactElement | null {
  const on = useArtillery((s) => s.mode !== 'off')
  const units = useArtillery((s) => s.units)
  const activeGunId = useArtillery((s) => s.activeGunId)
  const activeTargetId = useArtillery((s) => s.activeTargetId)
  const wind = useArtillery((s) => s.wind)

  const gun = units.find((u) => u.kind === 'gun' && u.id === activeGunId)
  const target = units.find((u) => u.kind === 'target' && u.id === activeTargetId)
  if (!on || !gun || !target) return null
  const sol = solve(gun, gun.platform, target, wind)
  const out = sol.inRange === false

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 24,
        padding: '0 8px',
        boxSizing: 'border-box',
        borderRadius: 6,
        background: 'rgba(18, 21, 25, 0.98)',
        border: `1px solid ${out ? C.danger : C.accentLine}`,
        fontSize: 12,
        whiteSpace: 'nowrap'
      }}
    >
      <span style={{ color: C.text3 }}>
        {gun.label} → {target.label}
      </span>
      <span style={{ fontFamily: 'monospace', fontWeight: 600, color: out ? C.danger : C.text1 }}>
        {sol.distance.toFixed(1)} m · {sol.azimuth.toFixed(1)}°
      </span>
    </div>
  )
}
