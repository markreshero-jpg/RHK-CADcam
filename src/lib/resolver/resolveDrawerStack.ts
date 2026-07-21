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
  CabinetInput, ConstructionRules, ResolvedFaceZone, ResolverError,
  ResolvedDrawerStack, ResolvedDrawerSlide,
  DrawerType, SlideProduct, SlideScheduleEntry,
  DEFAULT_DB_RULES,
} from './types'
import { resolveDrawerBox } from './resolveDrawerBox'
import { slideDrillOps } from '../slideDrilling'

const EPS = 1e-6
const round1 = (n: number) => Math.round(n * 10) / 10

export interface DrawerStackResolution {
  stacks:   ResolvedDrawerStack[]
  errors:   ResolverError[]
  warnings: ResolverError[]
}


export interface FindSlideOpts {
  // mm that must stay clear above the box inside the opening (DB_TOP_CLEAR, or a
  // per-zone override). A slide qualifies only if its height + clearance fits.
  clearance?: number
}

// Selects the tallest slide that genuinely fits the opening (and the depth).
//
// There is NO substitution. When a slide schedule is configured it is the only
// source of candidates: if nothing in it fits, the answer is null, never a slide
// from outside the schedule and never an over-tall "best effort" tier. Callers
// surface that as NO_SLIDE_FITS. Only when no schedule is configured at all does
// selection fall back to the raw product list.
export function findSlide(
  availableDepth: number,
  openingHeight: number,
  products: SlideProduct[],
  schedule: SlideScheduleEntry[],
  productId?: string,
  opts?: FindSlideOpts,
): SlideProduct | null {
  if (productId) {
    return products.find(p => p.id === productId) ?? null
  }
  const clearance = opts?.clearance ?? 0
  // A null height means the product/tier declares no height requirement, so it
  // cannot be ruled out — treat it as fitting rather than silently excluding it.
  const fits = (h: number | null | undefined) =>
    h == null || h + clearance <= openingHeight + EPS

  if (schedule.length > 0) {
    // Step 1: largest depth_threshold <= available depth (longest NL that fits)
    const eligible = schedule.filter(e => e.depth_threshold <= availableDepth)
    if (eligible.length === 0) return null   // no tier fits the cabinet depth
    const maxDepth = Math.max(...eligible.map(e => e.depth_threshold))
    const atDepth  = eligible.filter(e => e.depth_threshold === maxDepth)
    // Step 2: tallest height_threshold that still fits once the clearance above
    // the box is reserved. Nothing fitting means nothing fits — full stop.
    const fitting  = atDepth.filter(e => fits(e.height_threshold))
    if (fitting.length === 0) return null
    const maxH  = Math.max(...fitting.map(e => e.height_threshold))
    const entry = fitting.find(e => e.height_threshold === maxH)!
    return products.find(p => p.id === entry.slide_id) ?? null
  }

  // No schedule configured: the whole product list is the candidate pool.
  const byDepth = products.filter(p => p.nominal_length != null && p.nominal_length <= availableDepth)
  const fitting = byDepth.filter(p => fits(p.box_height))
  if (fitting.length === 0) return null
  // Tallest box that fits, tie-broken by longest nominal length, then by id so the
  // choice is stable across loads (the product query only orders by nominal_length,
  // so equal-height products from different brands would otherwise flip order).
  return [...fitting].sort((a, b) =>
    (b.box_height ?? 0) - (a.box_height ?? 0) ||
    (b.nominal_length ?? 0) - (a.nominal_length ?? 0) ||
    a.id.localeCompare(b.id),
  )[0] ?? null
}

// Products that tie with the chosen slide on box height in the no-schedule fallback.
// Distinct brands here mean the pick was effectively arbitrary — worth surfacing.
export function tiedSlideBrands(chosen: SlideProduct, products: SlideProduct[]): string[] {
  const tied = products.filter(p => p.box_height === chosen.box_height)
  return [...new Set(tied.map(p => p.brand).filter((b): b is string => !!b))]
}

export function resolveDrawerStacks(
  cab: CabinetInput,
  r: ConstructionRules,
  resolvedZones: ResolvedFaceZone[],
): DrawerStackResolution {
  const errors:   ResolverError[] = []
  const warnings: ResolverError[] = []
  const drawerZones = resolvedZones.filter(z => z.face_type === 'drawer_face')
  if (drawerZones.length === 0) return { stacks: [], errors, warnings }

  const T            = cab.material.DZ
  // Internal depth: from back panel inner face to front edge of case
  const internalDepth  = cab.DZ - T - r.SCRBK
  const availableDepth = internalDepth - r.SLIDE_SETBACK
  const slideProducts = cab.slide_products ?? []
  const slideSchedule = cab.slide_schedule ?? []
  const drawerMat    = cab.drawer_material ?? cab.material
  const dbRules      = cab.drawer_box_rules ?? DEFAULT_DB_RULES

  // Interior floor = top face of the carcase bottom panel. Matches resolveCase
  // (bottom panel Y = TK + SCRBT) + its thickness T, i.e. resolveInternal's
  // intBottom. The drawer box must rest on this, not on the face-grid bottom
  // (which for the lowest drawer sits one panel thickness lower, at the cabinet
  // exterior). TK mirrors the case/internal resolvers exactly.
  const TK = cab.has_toekick &&
    (cab.assembly_class === 'base' || cab.assembly_class === 'tall' ||
     cab.assembly_class === 'base_corner' || cab.assembly_class === 'tall_corner')
    ? r.TOEH : 0
  const internalFloorY = TK + T + r.SCRBT

  const stacks: ResolvedDrawerStack[] = []

  for (const zone of drawerZones) {
    const zoneInput = cab.face_grid.zones.find(
      z => z.row_index === zone.row_index && z.col_index === zone.col_index
    )
    const config = zoneInput?.drawer_type_config
    const drawerType: DrawerType = config?.type ?? cab.default_drawer_type ?? 'system'

    const openingHeight = zone.DY   // face zone: DY = height (DX = width)
    const zoneRef = `[${zone.row_index},${zone.col_index}]`

    if (openingHeight <= 0) {
      errors.push({
        code: 'DRAWER_OPENING_INVALID',
        message: `Drawer zone ${zoneRef} has a ${round1(openingHeight)}mm opening height`,
        part: 'drawer_face',
      })
      continue
    }

    // Clearance above the box: per-zone override wins over the drawer box method's
    // DB_TOP_CLEAR. Five-piece boxes are sized from height_adjustment instead, so
    // applying the clearance there as well would double-count it.
    const clearance = drawerType === 'system'
      ? (config?.top_clearance ?? dbRules.DB_TOP_CLEAR ?? 0)
      : 0

    // Per-zone slide_product_id wins; else a cabinet-level preserved slide override; else schedule.
    const slideOverride = config?.slide_product_id ?? (cab.hardware_overrides?.slide_id as string | undefined)
    // A cabinet resolved without any slide data at all must still produce geometry
    // (fixtures, previews); only complain when there was hardware to choose from.
    const hasHardware = slideProducts.length > 0 || slideSchedule.length > 0
    const slide = findSlide(availableDepth, openingHeight, slideProducts, slideSchedule, slideOverride, { clearance })

    if (!slide && hasHardware && !slideOverride) {
      const source = slideSchedule.length > 0 ? 'the slide schedule' : 'the slide list'
      errors.push({
        code: 'NO_SLIDE_FITS',
        message: `Drawer ${zoneRef}: nothing in ${source} fits a ${round1(openingHeight)}mm opening` +
          (clearance > 0 ? ` with ${round1(clearance)}mm clearance above the box` : '') +
          ` at ${round1(availableDepth)}mm available depth`,
        part: 'drawer_box',
      })
      continue
    }

    // With no slide schedule, selection falls back to the raw product list, which
    // spans every brand. If several products tie on the winning box height the pick
    // is arbitrary — the shop almost certainly meant one brand.
    if (slide && !slideOverride && slideSchedule.length === 0) {
      const brands = tiedSlideBrands(slide, slideProducts)
      if (brands.length > 1) {
        warnings.push({
          code: 'SLIDE_SELECTION_AMBIGUOUS',
          message: `Drawer ${zoneRef}: ${brands.join(' and ')} both offer a ${round1(slide.box_height ?? 0)}mm slide and no slide schedule is set — picked "${slide.name}"`,
          part: 'drawer_box',
        })
      }
    }

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

    // A non-positive box height produces inverted panels downstream (resolveDrawerBox
    // does no clamping), so drop the stack rather than emit nonsense geometry.
    if (boxHeight <= 0) {
      errors.push({
        code: 'DRAWER_BOX_HEIGHT_INVALID',
        message: drawerType === 'five_piece'
          ? `Drawer ${zoneRef}: height adjustment ${config?.height_adjustment ?? 25}mm leaves a ${round1(boxHeight)}mm box in a ${round1(openingHeight)}mm opening`
          : `Drawer ${zoneRef}: slide box height resolves to ${round1(boxHeight)}mm`,
        part: 'drawer_box',
      })
      continue
    }

    // A forced slide (per-zone or cabinet override) bypasses the fitting search, so an
    // over-tall box can still reach here. Emit the geometry so the clash is visible.
    if (boxHeight + clearance > openingHeight + EPS) {
      warnings.push({
        code: 'DRAWER_BOX_TOO_TALL',
        message: `Drawer ${zoneRef}: ${round1(boxHeight)}mm box` +
          (clearance > 0 ? ` + ${round1(clearance)}mm clearance` : '') +
          ` does not fit the ${round1(openingHeight)}mm opening` +
          (slide ? ` (slide "${slide.name}")` : ''),
        part: 'drawer_box',
      })
    }

    // Box width: the slide runners sit HARD against the opening sides (gable inner
    // faces), so the box spans the opening minus a runner on each side. No IDCL/IDCR
    // here — those are now inner-drawer FACE clearances only (see fittings.ts).
    // Scribes (SCRL/SCRR) shrink the opening like in resolveInternal/resolveCase.
    const boxWidth = Math.max(1, cab.DX - 2 * T - r.SCRL - r.SCRR - runnerThick * 2)
    const boxDepth = nominalLength

    // Cabinet-space origin of the box — interior left face (T + SCRL) plus the left
    // runner, so the box sits between the two rails which touch the gables.
    const boxX = T + r.SCRL + runnerThick
    // Bottom aligns with the face zone, but never below the interior floor — the
    // lowest drawer's zone.Y sits a panel thickness below it, which would drop the
    // box through the carcase bottom panel.
    const boxY = Math.max(zone.Y, internalFloorY)
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
      model_url:        slide?.model_url ?? null,
      model_format:     slide?.model_format ?? null,
      model_scale:      slide?.model_scale ?? 1,
      model_anchor_x:   slide?.model_anchor_x ?? 0,
      model_anchor_y:   slide?.model_anchor_y ?? 0,
      model_anchor_z:   slide?.model_anchor_z ?? 0,
      drills:           [],
    }

    const slides: ResolvedDrawerSlide[] = [
      { ...slideBase, side: 'left',  X: T + r.SCRL },
      { ...slideBase, side: 'right', X: cab.DX - T - r.SCRR - runnerThick },
    ]

    // Resolve slide-imposed drilling against the REAL resolved parts (not the box
    // envelope) so back setback, dado raise and face overhang land correctly.
    const backPart   = boxParts.find(p => p.part_type === 'db_back')
    const bottomPart = boxParts.find(p => p.part_type === 'db_bottom')
    // Real gable inner faces (the runner sits IDCL/IDCR clearance inboard of these).
    const leftMemberX  = T + r.SCRL
    const rightMemberX = cab.DX - T - r.SCRR
    for (const sl of slides) {
      const sidePart = boxParts.find(p =>
        p.part_type === (sl.side === 'left' ? 'db_left_side' : 'db_right_side'))
      sl.drills = slideDrillOps(sl, slide?.drill_ops ?? [], {
        backPart, bottomPart, sidePart, face: zone,
        memberFaceX: sl.side === 'left' ? leftMemberX : rightMemberX,
      })
    }

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

  return { stacks, errors, warnings }
}
