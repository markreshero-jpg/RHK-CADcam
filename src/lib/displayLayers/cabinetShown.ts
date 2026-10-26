// Does a layer set draw anything of a cabinet? Used by dimension chains (they
// measure only cabinets the set shows — user decision 2026-09-17) and by the
// print reports. Mirrors the canvas hit-extent rules in CanvasSVG (plan) and
// ElevationSVG (elevation); keep them in step when either changes.

import type { CabinetInstance } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import type { LayerView } from './resolve'
import { casePartItem, drawerBoxPartItem, faceZoneItem, internalPartItem, kickPartItem } from './registry'
import { customPartItem } from './customPartKinds'

type Layers = Pick<LayerView, 'show' | 'any'>

const shownCustom = (layers: Layers, rp: ResolvedCabinet | undefined) =>
  (rp?.custom_parts ?? []).some(p => p.show_in_room && layers.show(customPartItem(p)))

export function planShowsCabinet(cab: CabinetInstance, layers: Layers, rp: ResolvedCabinet | undefined): boolean {
  if (!cab.is_kick_assembly && layers.show('carcass_outline')) return true
  if (rp?.case_parts.some(p => layers.show(casePartItem(p.part_key)))) return true
  if (rp?.toekick_parts.some(p => layers.show(kickPartItem(p.part_key)))) return true
  if (rp?.drawer_stacks.some(ds => ds.box_parts.some(p => layers.show(drawerBoxPartItem(p.part_type))))) return true
  if (layers.show('drawer_runners') && rp?.drawer_stacks.some(ds => ds.slides.length)) return true
  if (shownCustom(layers, rp)) return true
  if (cab.has_face && layers.any('doors', 'drawer_fronts')) return true
  return !!cab.has_internal && layers.show('internal_outline')
}

export function elevationShowsCabinet(cab: CabinetInstance, layers: Layers, rp: ResolvedCabinet | undefined): boolean {
  if (layers.show('carcass_outline')) return true
  const floor = ['base', 'base_corner', 'tall', 'tall_corner'].includes(cab.assembly_class)
  if (!rp) {
    return (!!cab.has_face && layers.any('doors', 'drawer_fronts', 'false_panels'))
      || (floor && !!cab.has_toekick && layers.any('kick_faces', 'kick_spreaders'))
  }
  if (rp.case_parts.some(p => p.part_key !== 'back' && layers.show(casePartItem(p.part_key)))) return true
  if (rp.toekick_parts.some(p => layers.show(kickPartItem(p.part_key)))) return true
  if (rp.internal_parts.some(p => layers.show(internalPartItem(p.part_type)))) return true
  if (layers.show('inner_drawer_runners') && (rp.internal_slides ?? []).length) return true
  if (rp.drawer_stacks.some(ds => ds.box_parts.some(p => layers.show(drawerBoxPartItem(p.part_type))))) return true
  if (layers.show('drawer_runners') && rp.drawer_stacks.some(ds => ds.slides.length)) return true
  if (rp.face_zones.some(fz => { const it = faceZoneItem(fz.face_type); return !!it && layers.show(it) })) return true
  return shownCustom(layers, rp)
}
