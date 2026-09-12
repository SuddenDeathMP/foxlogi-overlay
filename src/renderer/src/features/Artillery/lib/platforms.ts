// Artillery platform specs. Data ported from fox-fall
// (github.com/SuddenDeathMP/fox-fall, packages/data/src/artillery/unit/constants.ts).
// Platform ids keep fox-fall's strings so the table stays easy to diff.

export type ShellType =
  | 'mortar'
  | '4c fire rocket'
  | '3c high explosive rocket'
  | '120mm'
  | '150mm'
  | '300mm'

export interface ArtillerySpecs {
  MIN_RANGE: number
  MAX_RANGE: number
  /** Distance step the gun can actually be set to (0 = continuous). */
  RANGE_INCREMENT: number
  MIN_SPREAD: number
  MAX_SPREAD: number
  /** Meters of drift per wind tier. */
  WIND_OFFSET: number
}

export interface Platform extends ArtillerySpecs {
  id: string
  shell: ShellType
  name: string
}

export const SHELLS: Array<{ id: ShellType; label: string }> = [
  { id: 'mortar', label: 'Mortar' },
  { id: '4c fire rocket', label: '4C Fire Rocket' },
  { id: '3c high explosive rocket', label: '3C HE Rocket' },
  { id: '120mm', label: '120mm' },
  { id: '150mm', label: '150mm' },
  { id: '300mm', label: '300mm' }
]

export const PLATFORMS: Platform[] = [
  // ---- mortar ----
  {
    id: 'Mortar Type C charon',
    shell: 'mortar',
    name: 'Charon (Type C)',
    MIN_RANGE: 75,
    MAX_RANGE: 100,
    RANGE_INCREMENT: 5 / 3,
    MIN_SPREAD: 2.5,
    MAX_SPREAD: 9.45,
    WIND_OFFSET: 10 // NOT VERIFIED
  },
  {
    id: 'Mortar Cremari',
    shell: 'mortar',
    name: 'Cremari',
    MIN_RANGE: 45,
    MAX_RANGE: 80,
    RANGE_INCREMENT: 0.5,
    MIN_SPREAD: 5.5,
    MAX_SPREAD: 12,
    WIND_OFFSET: 10 // NOT VERIFIED
  },
  {
    id: 'Mortar HH-d peltast',
    shell: 'mortar',
    name: 'Peltast (HH-d)',
    MIN_RANGE: 45,
    MAX_RANGE: 80,
    RANGE_INCREMENT: (80 - 45) / 20,
    MIN_SPREAD: 2.5,
    MAX_SPREAD: 9.45,
    WIND_OFFSET: 10 // NOT VERIFIED
  },
  {
    id: 'Mortar Devitt-Caine Mk. IV MMR',
    shell: 'mortar',
    name: 'Devitt-Caine Mk. IV MMR',
    MIN_RANGE: 45,
    MAX_RANGE: 80,
    RANGE_INCREMENT: 0,
    MIN_SPREAD: 2.5,
    MAX_SPREAD: 9.45,
    WIND_OFFSET: 10 // NOT VERIFIED
  },
  {
    id: 'Mortar 74b-1 Ronan gunship',
    shell: 'mortar',
    name: 'Ronan Gunship (74b-1)',
    MIN_RANGE: 75,
    MAX_RANGE: 100,
    RANGE_INCREMENT: 0,
    MIN_SPREAD: 2.5,
    MAX_SPREAD: 14.5,
    WIND_OFFSET: 10 // NOT VERIFIED
  },

  // ---- 4c fire rocket ----
  {
    id: '4c T13 deionius',
    shell: '4c fire rocket',
    name: 'Deioneus (T13)',
    MIN_RANGE: 350,
    MAX_RANGE: 400,
    RANGE_INCREMENT: 5,
    MIN_SPREAD: 41.5,
    MAX_SPREAD: 57.5,
    WIND_OFFSET: 25
  },
  {
    id: '4c Niska-Rycker Mk. IX skycaller',
    shell: '4c fire rocket',
    name: 'Skycaller (Niska-Rycker Mk. IX)',
    MIN_RANGE: 275,
    MAX_RANGE: 350,
    RANGE_INCREMENT: 0,
    MIN_SPREAD: 37.5,
    MAX_SPREAD: 60,
    WIND_OFFSET: 25
  },
  {
    id: '4c Rycker 4/3-F wasp nest',
    shell: '4c fire rocket',
    name: 'Wasp Nest (Rycker 4/3-F)',
    MIN_RANGE: 375,
    MAX_RANGE: 450,
    RANGE_INCREMENT: 0,
    MIN_SPREAD: 37.5,
    MAX_SPREAD: 60,
    WIND_OFFSET: 25
  },

  // ---- 3c high explosive rocket ----
  {
    id: '3c DAE 3b-2 hades net',
    shell: '3c high explosive rocket',
    name: "Hades' Net (DAE 3b-2)",
    MIN_RANGE: 300,
    MAX_RANGE: 575,
    RANGE_INCREMENT: 55 / 2,
    MIN_SPREAD: 35,
    MAX_SPREAD: 52,
    WIND_OFFSET: 25
  },
  {
    id: '3c R-17 retiarius skirmisher',
    shell: '3c high explosive rocket',
    name: 'Retiarius Skirmisher (R-17)',
    MIN_RANGE: 375,
    MAX_RANGE: 500,
    RANGE_INCREMENT: 25 / 3,
    MIN_SPREAD: 37.5,
    MAX_SPREAD: 51,
    WIND_OFFSET: 25
  },
  {
    id: "3c O'Brien V.200 squire",
    shell: '3c high explosive rocket',
    name: "Squire (O'Brien V.200)",
    MIN_RANGE: 375,
    MAX_RANGE: 500,
    RANGE_INCREMENT: 0,
    MIN_SPREAD: 39,
    MAX_SPREAD: 51,
    WIND_OFFSET: 25
  },

  // ---- 120mm ----
  {
    id: '120mm Conqueror',
    shell: '120mm',
    name: 'Conqueror',
    MIN_RANGE: 100,
    MAX_RANGE: 200,
    // fox-fall: "I seriously doubt this number is accurate. MAX_RANGE - MIN_RANGE
    // is not even divisible by 4.5"
    RANGE_INCREMENT: 4.5,
    MIN_SPREAD: 2.5,
    MAX_SPREAD: 8.5,
    WIND_OFFSET: 10
  },
  {
    id: '120mm 120-68 koronides field gun',
    shell: '120mm',
    name: 'Koronides Field Gun (120-68)',
    MIN_RANGE: 100,
    MAX_RANGE: 250,
    RANGE_INCREMENT: 10,
    MIN_SPREAD: 22.5,
    MAX_SPREAD: 30,
    WIND_OFFSET: 10
  },
  {
    id: '120mm Titan',
    shell: '120mm',
    name: 'Titan',
    MIN_RANGE: 100,
    MAX_RANGE: 200,
    RANGE_INCREMENT: 0,
    MIN_SPREAD: 2.5,
    MAX_SPREAD: 8.5,
    WIND_OFFSET: 10
  },
  {
    id: '120mm AC-b trident',
    shell: '120mm',
    name: 'Trident (AC-b)',
    MIN_RANGE: 100,
    MAX_RANGE: 225,
    RANGE_INCREMENT: 0,
    MIN_SPREAD: 2.5,
    MAX_SPREAD: 8.5,
    WIND_OFFSET: 10
  },
  {
    id: '120mm Callahan',
    shell: '120mm',
    name: 'Callahan',
    MIN_RANGE: 100,
    MAX_RANGE: 200,
    RANGE_INCREMENT: 0,
    MIN_SPREAD: 2.5,
    MAX_SPREAD: 8.5,
    WIND_OFFSET: 10
  },
  {
    id: '120mm Blacksteele',
    shell: '120mm',
    name: 'Blacksteele',
    MIN_RANGE: 100,
    MAX_RANGE: 200,
    RANGE_INCREMENT: 0,
    MIN_SPREAD: 2.5,
    MAX_SPREAD: 8.5,
    WIND_OFFSET: 10
  },
  {
    id: '120mm Huber lariat',
    shell: '120mm',
    name: 'Huber Lariat',
    MIN_RANGE: 100,
    MAX_RANGE: 300,
    RANGE_INCREMENT: 0,
    MIN_SPREAD: 25,
    MAX_SPREAD: 35,
    WIND_OFFSET: 10
  },

  // ---- 150mm ----
  {
    id: '150mm Lance-46 sarissa',
    shell: '150mm',
    name: 'Sarissa (Lance-46)',
    MIN_RANGE: 120,
    MAX_RANGE: 250,
    RANGE_INCREMENT: 0,
    MIN_SPREAD: 25,
    MAX_SPREAD: 35,
    WIND_OFFSET: 25
  },
  {
    id: '150mm 50-500 thunderbolt',
    shell: '150mm',
    name: 'Thunderbolt (50-500)',
    MIN_RANGE: 200,
    MAX_RANGE: 350,
    RANGE_INCREMENT: 6,
    MIN_SPREAD: 32.5,
    MAX_SPREAD: 40,
    WIND_OFFSET: 25
  },
  {
    id: '150mm Titan',
    shell: '150mm',
    name: 'Titan',
    MIN_RANGE: 100,
    MAX_RANGE: 225,
    RANGE_INCREMENT: 0,
    MIN_SPREAD: 2.5,
    MAX_SPREAD: 8.5,
    WIND_OFFSET: 25
  },
  {
    id: '150mm Callahan',
    shell: '150mm',
    name: 'Callahan',
    MIN_RANGE: 100,
    MAX_RANGE: 225,
    RANGE_INCREMENT: 0,
    MIN_SPREAD: 2.5,
    MAX_SPREAD: 8.5,
    WIND_OFFSET: 25
  },
  {
    id: '150mm Huber exalt',
    shell: '150mm',
    name: 'Huber Exalt',
    MIN_RANGE: 100,
    MAX_RANGE: 300,
    RANGE_INCREMENT: 0,
    MIN_SPREAD: 25,
    MAX_SPREAD: 35,
    WIND_OFFSET: 25
  },
  {
    id: '150mm Flood Mk. IX stain',
    shell: '150mm',
    name: 'Flood Mk. IX Stain',
    MIN_RANGE: 120,
    MAX_RANGE: 250,
    RANGE_INCREMENT: 0,
    MIN_SPREAD: 25,
    MAX_SPREAD: 35,
    WIND_OFFSET: 25
  },

  // ---- 300mm ----
  {
    id: '300mm Storm cannon',
    shell: '300mm',
    name: 'Storm Cannon',
    MIN_RANGE: 400,
    MAX_RANGE: 1000,
    RANGE_INCREMENT: 0,
    MIN_SPREAD: 50,
    MAX_SPREAD: 50,
    WIND_OFFSET: 50
  },
  {
    id: '300mm Tempest cannon RA-2',
    shell: '300mm',
    name: 'Tempest Cannon (RA-2)',
    MIN_RANGE: 350,
    MAX_RANGE: 500,
    RANGE_INCREMENT: 0,
    MIN_SPREAD: 50,
    MAX_SPREAD: 50,
    WIND_OFFSET: 50
  }
]

export const PLATFORM_BY_ID: Record<string, Platform> = Object.fromEntries(
  PLATFORMS.map((p) => [p.id, p])
)

export const DEFAULT_PLATFORM = '120mm 120-68 koronides field gun'

export function specsOf(platformId: string | undefined): Platform | undefined {
  return platformId ? PLATFORM_BY_ID[platformId] : undefined
}

export function platformsOf(shell: ShellType): Platform[] {
  return PLATFORMS.filter((p) => p.shell === shell)
}

export function inRange(specs: ArtillerySpecs, distance: number): boolean {
  return distance >= specs.MIN_RANGE && distance <= specs.MAX_RANGE
}

/** Snap to the gun's settable distance steps; null when it's continuous. */
export function roundDistance(specs: ArtillerySpecs, distance: number): number | null {
  if (!specs.RANGE_INCREMENT) return null
  const inc = specs.RANGE_INCREMENT
  return Math.round((distance - specs.MIN_RANGE) / inc) * inc + specs.MIN_RANGE
}

/** Shell spread radius at a given firing distance (linear between min/max range). */
export function spreadAt(specs: ArtillerySpecs, distance: number): number {
  const span = specs.MAX_RANGE - specs.MIN_RANGE
  if (span <= 0) return specs.MIN_SPREAD
  const clamped = Math.min(specs.MAX_RANGE, Math.max(specs.MIN_RANGE, distance))
  return specs.MIN_SPREAD + ((specs.MAX_SPREAD - specs.MIN_SPREAD) * (clamped - specs.MIN_RANGE)) / span
}
