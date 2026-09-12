// World-space vector math for the artillery calculator. Ported from fox-fall
// (packages/data/src/artillery/{angle,vector}.ts) as plain functions.
//
// Coordinate system matches the screen: x → right, y → down, units in meters.
// Azimuth 0° is north (up) and increases clockwise.

export interface Vec {
  x: number
  y: number
}

export interface Angular {
  distance: number
  azimuth: number
}

export const ZERO: Vec = { x: 0, y: 0 }

export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

export function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI
}

export function wrapDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

export function toCartesian({ distance, azimuth }: Angular): Vec {
  return {
    x: distance * Math.cos(toRadians(azimuth - 90)),
    y: distance * Math.sin(toRadians(azimuth - 90))
  }
}

export function toAngular({ x, y }: Vec): Angular {
  return {
    distance: Math.hypot(x, y),
    azimuth: wrapDegrees(toDegrees(Math.atan2(y, x)) + 90)
  }
}

export function add(a: Vec, b: Vec): Vec {
  return { x: a.x + b.x, y: a.y + b.y }
}

export function sub(a: Vec, b: Vec): Vec {
  return { x: a.x - b.x, y: a.y - b.y }
}

export function scale(v: Vec, k: number): Vec {
  return { x: v.x * k, y: v.y * k }
}
