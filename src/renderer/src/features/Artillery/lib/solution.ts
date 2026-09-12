// Firing solution math (fox-fall mixins/artillery.ts getWindOffset/getFiringVector).
import { add, sub, toAngular, toCartesian, ZERO, type Vec } from './vector'
import { inRange, roundDistance, specsOf, spreadAt, type Platform } from './platforms'

export interface Wind {
  /** Direction the wind blows TOWARD (shells drift this way), degrees, multiple of 5. */
  azimuth: number
  /** In-game wind tier, 0–5. */
  tier: number
}

export interface FiringSolution {
  distance: number
  azimuth: number
  specs?: Platform
  /** Distance snapped to the gun's range increment (null if continuous / no specs). */
  rounded: number | null
  /** null when the platform is unknown. */
  inRange: boolean | null
  /** Spread radius at this distance in meters (null without specs). */
  spread: number | null
  /** Where the gun must actually aim (target shifted upwind). */
  aim: Vec
}

/** World-space drift applied to a shell fired from this platform. */
export function windOffset(platformId: string | undefined, wind: Wind): Vec {
  const specs = specsOf(platformId)
  if (!specs || wind.tier <= 0) return ZERO
  return toCartesian({ distance: wind.tier * specs.WIND_OFFSET, azimuth: wind.azimuth })
}

export function solve(gun: Vec, platformId: string | undefined, target: Vec, wind: Wind): FiringSolution {
  const specs = specsOf(platformId)
  const offset = windOffset(platformId, wind)
  // Aim upwind of the target so the drift carries the shell onto it.
  const firing = sub(sub(target, gun), offset)
  const { distance, azimuth } = toAngular(firing)
  return {
    distance,
    azimuth,
    specs,
    rounded: specs ? roundDistance(specs, distance) : null,
    inRange: specs ? inRange(specs, distance) : null,
    spread: specs ? spreadAt(specs, distance) : null,
    aim: add(gun, firing)
  }
}
