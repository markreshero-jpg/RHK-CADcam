// ============================================================
// Drawer Stack Resolver
// For each drawer_face zone, resolves:
//   1. The 5-piece drawer box (positioned in cabinet space)
//   2. Two slide rails (left + right, mounted to gable inner faces)
//
// Coordinate convention matches the cabinet resolver:
//   DX = depth direction (cabinet Z)
//   DY = width / height direction (cabinet X or Y)
//   DZ = thickness
//   X/Y/Z = back-bottom-left origin
// ============================================================

import {
  CabinetInput, ConstructionRules, ResolvedFaceZone,
  ResolvedDrawerStack, ResolvedDrawerSlide,
  DrawerType, SlideProduct, SlideScheduleEntry,
  DEFAULT_DB_RULES,
} from './types'
import { resolveDrawerBox } from './resolveDrawerBox'

const SLIDE_CHANNEL_HEIGHT = 30  // mm — visual height of the rendered slide rail

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
    const drawerType: DrawerType = config?.type ?? 'system'

    const slide = findSlide(IDRUN, slideProducts, slideSchedule, config?.slide_product_id)

    const sideDeduction  = slide?.side_deduction   ?? cab.slide_side_deduction
    const runnerThick    = slide?.runner_thickness  ?? 12
    const nominalLength  = slide?.nominal_length    ?? IDRUN

    // Box height: system drawer uses slide.box_height; five_piece/inner uses opening minus adjustment
    const openingHeight = zone.DX
    let boxHeight: number
    if (drawerType === 'system') {
      boxHeight = slide?.box_height ?? 128
    } else {
      boxHeight = openingHeight - (config?.height_adjustment ?? 25)
    }

    // Box width: inner opening (between gables) minus clearances minus slide deduction
    const boxWidth = Math.max(1, cab.DX - 2 * T - r.IDCL - r.IDCR - sideDeduction)
    const boxDepth = IDRUN

    // Cabinet-space origin of the box
    const boxX = T + r.IDCL           // inside left gable + clearance
    const boxY = zone.Y               // bottom aligns with bottom of face zone
    const boxZ = zone.Z - boxDepth    // box front sits against back face of drawer front panel

    // Resolve the 5-part box in local coords, then offset to cabinet space
    const localParts = resolveDrawerBox({
      box_width:  boxWidth,
      box_height: boxHeight,
      box_depth:  boxDepth,
      material:   drawerMat,
      rules:      dbRules,
    })

    const boxParts = localParts.map(p => ({
      ...p,
      X: p.X + boxX,
      Y: p.Y + boxY,
      Z: p.Z + boxZ,
    }))

    // Slide rails — one on each gable inner face
    const slideBase: Omit<ResolvedDrawerSlide, 'side' | 'X'> = {
      Y: boxY,
      Z: boxZ,
      DX: nominalLength,
      DY: SLIDE_CHANNEL_HEIGHT,
      DZ: runnerThick,
      slide_id:         slide?.id ?? '',
      nominal_length:   nominalLength,
      box_height:       slide?.box_height ?? boxHeight,
      runner_thickness: runnerThick,
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
