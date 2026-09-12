// Platform / shell icons (copied from fox-fall's frontend-libs assets).
import type { ShellType } from './lib/platforms'

import gun from './assets/gun.webp'
import shellMortar from './assets/shell/mortar.webp'
import shellFireRocket from './assets/shell/fire-rocket.webp'
import shellHeRocket from './assets/shell/high-explosive-rocket.webp'
import shell120 from './assets/shell/120mm.webp'
import shell150 from './assets/shell/150mm.webp'
import shell300 from './assets/shell/300mm.webp'

import charon from './assets/platform/mortar/charon.webp'
import cremari from './assets/platform/mortar/cremari.webp'
import peltast from './assets/platform/mortar/peltast.webp'
import devittCaine from './assets/platform/mortar/devitt-caine.webp'
import ronan from './assets/platform/mortar/ronan.webp'
import deioneus from './assets/platform/fire-rocket/deioneus.webp'
import skycaller from './assets/platform/fire-rocket/skycaller.webp'
import waspNest from './assets/platform/fire-rocket/wasp-nest.webp'
import hadesNet from './assets/platform/high-explosive-rocket/hades-net.webp'
import retiarius from './assets/platform/high-explosive-rocket/retiarius.webp'
import squire from './assets/platform/high-explosive-rocket/squire.webp'
import conqueror from './assets/platform/120mm/conqueror.webp'
import koronides from './assets/platform/120mm/koronides.webp'
import trident from './assets/platform/120mm/trident.webp'
import blacksteele from './assets/platform/120mm/blacksteele.webp'
import huberLariat from './assets/platform/120mm/huber-lariat.webp'
import sarissa from './assets/platform/150mm/sarissa.webp'
import thunderbolt from './assets/platform/150mm/thunderbolt.webp'
import huberExalt from './assets/platform/150mm/huber-exalt.webp'
import floodStain from './assets/platform/150mm/flood-stain.webp'
import stormCannon from './assets/platform/300mm/storm-cannon.webp'
import tempest from './assets/platform/300mm/tempest.webp'
import titan from './assets/platform/titan.webp'
import callahan from './assets/platform/callahan.webp'

export const GUN_ICON = gun

export const SHELL_ICON: Record<ShellType, string> = {
  mortar: shellMortar,
  '4c fire rocket': shellFireRocket,
  '3c high explosive rocket': shellHeRocket,
  '120mm': shell120,
  '150mm': shell150,
  '300mm': shell300
}

const PLATFORM_ICON: Record<string, string> = {
  'Mortar Type C charon': charon,
  'Mortar Cremari': cremari,
  'Mortar HH-d peltast': peltast,
  'Mortar Devitt-Caine Mk. IV MMR': devittCaine,
  'Mortar 74b-1 Ronan gunship': ronan,
  '4c T13 deionius': deioneus,
  '4c Niska-Rycker Mk. IX skycaller': skycaller,
  '4c Rycker 4/3-F wasp nest': waspNest,
  '3c DAE 3b-2 hades net': hadesNet,
  '3c R-17 retiarius skirmisher': retiarius,
  "3c O'Brien V.200 squire": squire,
  '120mm Conqueror': conqueror,
  '120mm 120-68 koronides field gun': koronides,
  '120mm Titan': titan,
  '120mm AC-b trident': trident,
  '120mm Callahan': callahan,
  '120mm Blacksteele': blacksteele,
  '120mm Huber lariat': huberLariat,
  '150mm Lance-46 sarissa': sarissa,
  '150mm 50-500 thunderbolt': thunderbolt,
  '150mm Titan': titan,
  '150mm Callahan': callahan,
  '150mm Huber exalt': huberExalt,
  '150mm Flood Mk. IX stain': floodStain,
  '300mm Storm cannon': stormCannon,
  '300mm Tempest cannon RA-2': tempest
}

export function platformIcon(platformId: string | undefined): string {
  return (platformId && PLATFORM_ICON[platformId]) || GUN_ICON
}
