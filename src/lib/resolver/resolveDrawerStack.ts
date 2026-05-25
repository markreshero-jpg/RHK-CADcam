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
  availableDepth: number,
  openingHeight: number,
  products: SlideProduct[],
  schedule: SlideScheduleEntry[],
  productId?: string,
): SlideProduct | null {
  if (productId) {
    return products.find(p => p.id === productId) ?? null
  }
  if (schedule.length > 0) {
    // Step 1: largest depth_threshold <= available depth (longest NL that fits)
    const eligible = schedule.filter(e => e.depth_threshold <= availableDepth)
    if (eligible.length > 0) {
      const maxDepth = Math.max(...eligible.map(e => e.depth_threshold))
      const atDepth  = eligible.filter(e => e.depth_threshold === maxDepth)
      // Step 2: tallest height_threshold that still fits in the opening
      const fitting  = atDepth.filter(e => e.height_threshold <= openingHeight)
      const pool     = fitting.length > 0 ? fitting : atDepth  // best-effort if nothing fits
      const maxH     = Math.max(...pool.map(e => e.height_threshold))
      const entry    = pool.find(e => e.height_threshold === maxH)!
      return products.find(p => p.id === entry.slide_id) ?? null
    }
  }
  // Fallback: longest NL product that fits within available depth
  return (
    products
      .filter(p => p.nominal_length != null && p.nominal_length <= availableDepth)
      .sort((a, b) => (b.nominal_length ?? 0) - (a.nominal_length ?? 0))[0]
    ?? products[0]
    ?? null
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
  // Internal depth: from back panel inner face to front edge of case
  const internalDepth  = cab.DZ - T - r.SCRBK
  const availableDepth = internalDepth - r.SLIDE_SETBACK
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

    const openingHeight = zone.DX
    const slide = findSlide(availableDepth, openingHeight, slideProducts, slideSchedule, config?.slide_product_id)

    const sideDeduction  = slide?.side_deduction   ?? cab.slide_side_deduction
    const runnerThick    = slide?.runner_thickness  ?? 0
    const nominalLength  = slide?.nominal_length    ?? availableDepth

    // Box height: system drawer uses slide.box_height; five_piece uses opening minus adjustment
    let boxHeight: number
    if (drawerType === 'system') {
      boxHeight = slide?.box_height ?? 128
    } else {
      boxHeight = openingHeight - (config?.height_adjustment ?? 25)
    }

    // Box width: inner opening (between gables, narrowed by scribes) minus clearances
    // minus runner thickness on each side. Scribes (SCRL/SCRR) shrink the opening just
    // like they do in resolveInternal/resolveCase, so they must be subtracted here too.
    const boxWidth = Math.max(1, cab.DX - 2 * T - r.SCRL - r.SCRR - r.IDCL - r.IDCR - runnerThick * 2)
    const boxDepth = nominalLength

    // Cabinet-space origin of the box — interior left face (T + SCRL) plus clearance and
    // the left runner, so the box sits between the two rails.
    const boxX = T + r.SCRL + r.IDCL + runnerThick
    const boxY = zone.Y               // bottom aligns with bottom of face zone
    const boxZ = zone.Z - boxDepth    // cabinet Z of the back face of the box

    // Slide Z: back of slide rail. Front of slide aligns with the front face of the box sides
    // (zone.Z in cabinet space), not the back face of db_front.
    const slideZ = zone.Z - nominalLength

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
      { ...slideBase, side: 'left',  X: T + r.SCRL + r.IDCL },
      { ...slideBase, side: 'right', X: cab.DX - T - r.SCRR - r.IDCR - runnerThick },
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
