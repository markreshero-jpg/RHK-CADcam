// ============================================================
// Drawer Stack Resolver
// For each drawer_face zone, resolves:
//   1. The 5-piece drawer box (positioned in cabinet space)
//   2. Two slide rails (left + right, mounted to gable inner faces)
//
// Drawer box local convention (resolveDrawerBox output):
//   Z=0 = front face of the box; Z increases toward the back.
//   DX = depth extent, DY = width/height, DZ = thickness.
//
// Cabinet-space mapping applied here:
//   cabinet_Z = zone.Z - local_Z
//   (local front Z=0 → cabinet zone.Z; local back Z=D → cabinet zone.Z - D)
//
// Slide rails remain in cabinet-space back-origin coords (Z = boxZ).
// ============================================================

import {
  CabinetInput, ConstructionRules, ResolvedFaceZone,
  ResolvedDrawerStack, ResolvedDrawerSlide,
  DrawerType, SlideProduct, SlideScheduleEntry,
  DEFAULT_DB_RULES,
} from './types'
import { resolveDrawerBox } from './resolveDrawerBox'


function findSlide(
  depth: number,
  products: SlideProduct[],
  schedule: SlideScheduleEntry[],
  productId?: string,
): SlideProduct | null {
  if (productId) {
    return products.find(p => p.id === productId) ?? null
  }
  const entry = schedule.find(e => depth >= e.min_depth && depth <= e.max_depth)
  if (entry) {
    return products.find(p => p.id === entry.slide_id) ?? null
  }
  // Fallback: product whose depth range includes this depth
  return (
    products.find(p =>
      (p.min_runner_depth == null || depth >= p.min_runner_depth) &&
      (p.max_runner_depth == null || depth <= p.max_runner_depth)
    ) ?? products[0] ?? null
  )
}

export function resolveDrawerStacks(
  cab: CabinetInput,
  r: ConstructionRules,
  resolvedZones: ResolvedFaceZone[],
): ResolvedDrawerStack[] {
  const drawerZones = resolvedZones.filter(z => z.face_type === 'drawer_face')
  if (drawerZones.length === 0) return []

  const T            = cab.material.DZ
  const IDRUN        = r.IDRUN
  const slideProducts = cab.slide_products ?? []
  const slideSchedule = cab.slide_schedule ?? []
  const drawerMat    = cab.drawer_material ?? cab.material
  const dbRules      = cab.drawer_box_rules ?? DEFAULT_DB_RULES

  const stacks: ResolvedDrawerStack[] = []

  for (const zone of drawerZones) {
    const zoneInput = cab.face_grid.zones.find(
      z => z.row_index === zone.row_index && z.col_index === zone.col_index
    )
    const config = zoneInput?.drawer_type_config
    const drawerType: DrawerType = config?.type ?? cab.default_drawer_type ?? 'system'

    const slide = findSlide(IDRUN, slideProducts, slideSchedule, config?.slide_product_id)

    const sideDeduction  = slide?.side_deduction   ?? cab.slide_side_deduction
    const runnerThick    = slide?.runner_thickness  ?? 0
    const nominalLength  = slide?.nominal_length    ?? IDRUN

    // Box height: system drawer uses slide.box_height; five_piece uses opening minus adjustment
    const openingHeight = zone.DX
    let boxHeight: number
    if (drawerType === 'system') {
      boxHeight = slide?.box_height ?? 128
    } else {
      boxHeight = openingHeight - (config?.height_adjustment ?? 25)
    }

    // Box width: inner opening (between gables) minus clearances minus runner thickness on each side
    const boxWidth = Math.max(1, cab.DX - 2 * T - r.IDCL - r.IDCR - runnerThick * 2)
    const boxDepth = IDRUN

    // Cabinet-space origin of the box
    const boxX = T + r.IDCL           // inside left gable + clearance
    const boxY = zone.Y               // bottom aligns with bottom of face zone
    const boxZ = zone.Z - boxDepth    // cabinet Z of the back face of the box

    // Slide Z: back of slide rail, referenced from the back face of the drawer box front panel.
    // Front of slide sits at zone.Z - drawerMat.DZ (back face of db_front panel).
    const slideZ = zone.Z - drawerMat.DZ - nominalLength

    // Resolve box parts in local coords, filter by drawer type, then offset to cabinet space.
    // Local convention: Z=0 = front of box (against back face of drawer front), Z increases toward back.
    // Cabinet mapping: cabinet_Z = zone.Z - local_Z
    // System drawers: sides are metal runners — only back and bottom are manufactured timber.
    // Five-piece drawers: all 5 parts are manufactured timber.
    const SYSTEM_PARTS = new Set(['db_back', 'db_bottom'])
    const rulesForResolve = drawerType === 'system'
      ? { ...dbRules, DB_SIDE_T: 0 }
      : { ...dbRules, DB_SIDE_T: drawerMat.DZ }
    const localParts = resolveDrawerBox({
      box_width:        boxWidth,
      box_height:       boxHeight,
      box_depth:        boxDepth,
      material:         drawerMat,
      rules:            rulesForResolve,
      slide_box_height: slide?.box_height ?? undefined,
    }).filter(p => drawerType === 'five_piece' || SYSTEM_PARTS.has(p.part_type))

    const boxParts = localParts.map(p => ({
      ...p,
      X: p.X + boxX,
      Y: p.Y + boxY,
      Z: zone.Z - p.Z,   // local Z=0 (front) → cabinet Z = zone.Z
    }))

    // Slide rails — one on each gable inner face
    const slideBase: Omit<ResolvedDrawerSlide, 'side' | 'X'> = {
      Y: boxY,
      Z: slideZ,
      DX: nominalLength,
      DY: slide?.box_height ?? boxHeight,
      DZ: runnerThick,
      slide_id:         slide?.id ?? '',
      nominal_length:   nominalLength,
      box_height:       slide?.box_height ?? boxHeight,
      runner_thickness: runnerThick,
      colour:           slide?.colour ?? null,
    }

    const slides: ResolvedDrawerSlide[] = [
      { ...slideBase, side: 'left',  X: T + r.IDCL },
      { ...slideBase, side: 'right', X: cab.DX - T - r.IDCR - runnerThick },
    ]

    stacks.push({
      face_zone_row: zone.row_index,
      face_zone_col: zone.col_index,
      drawer_type:   drawerType,
      box_parts:     boxParts,
      slides,
      box_width:  boxWidth,
      box_height: boxHeight,
      box_depth:  boxDepth,
      box_X: boxX,
      box_Y: boxY,
      box_Z: boxZ,
    })
  }

  return stacks
}
