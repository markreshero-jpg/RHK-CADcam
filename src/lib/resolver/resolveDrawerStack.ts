// ============================================================
// Drawer Stack Resolver
// For each drawer_face zone, resolves:
//   1. The 5-piece drawer box (positioned in cabinet space)
//   2. Two slide rails (left + right, mounted to gable inner faces, or to the
//      internal dividers either side of the front — z_dividers V2)
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
  ResolvedDrawerStack, ResolvedDrawerSlide, ResolvedInternalPart, ResolvedHingeMountTarget,
  DrawerType, DrawerFrontType, SlideProduct, SlideScheduleEntry, Section,
  DEFAULT_DB_RULES,
} from './types'
import { resolveDrawerBox } from './resolveDrawerBox'
import { slideDrillOps } from '../slideDrilling'
import { gridForFacet, zoneTurn, type ZoneOpening } from './resolveShapedHardware'

const EPS = 1e-6
const round1 = (n: number) => Math.round(n * 10) / 10

// The panels a front's runners fix to (z_dividers V2): the nearest internal
// divider face either side of the front's centre that spans most of the
// front's height, else the carcass side (target null).
interface Member { x: number; target: ResolvedHingeMountTarget | null }
function memberBounds(
  zone: ResolvedFaceZone, dividers: ResolvedInternalPart[], left: number, right: number,
): { left: Member; right: Member } {
  const cx = zone.X + zone.DX / 2
  const y0 = zone.Y, y1 = zone.Y + zone.DY
  const out: { left: Member; right: Member } = { left: { x: left, target: null }, right: { x: right, target: null } }
  for (const d of dividers) {
    // Divider: X = left face, DZ = thickness along X, Y..Y+DY = height.
    const overlap = Math.min(y1, d.Y + d.DY) - Math.max(y0, d.Y)
    if (overlap < Math.min(zone.DY, d.DY) * 0.5) continue
    const target: ResolvedHingeMountTarget = { table: 'internal_parts', internal_part_type: d.part_type, internal_sort_order: d.sort_order }
    if (d.X + d.DZ <= cx && d.X + d.DZ > out.left.x) out.left = { x: d.X + d.DZ, target }
    if (d.X >= cx && d.X < out.right.x) out.right = { x: d.X, target }
  }
  return out
}

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

// z_bin_cabinet: picks the pull-out bin for a front. A bin fits when the clear
// width between its mounting faces is inside the product's range, the cabinet
// is deep enough (nominal_length = min inside depth) and the bin is no taller
// than the height above the floor. The tallest fitting bin wins (B-D7), ties
// broken by name so the pick is stable.
export function findBin(
  insideWidth: number,
  insideDepth: number,
  availableHeight: number,
  bins: SlideProduct[],
  productId?: string,
): SlideProduct | null {
  if (productId) return bins.find(b => b.id === productId) ?? null
  const fitting = bins.filter(b =>
    b.inside_width_min != null && b.inside_width_max != null &&
    insideWidth >= b.inside_width_min - EPS && insideWidth <= b.inside_width_max + EPS &&
    (b.nominal_length ?? 0) <= insideDepth + EPS &&
    (b.box_height ?? 0) <= availableHeight + EPS)
  return [...fitting].sort((a, b) =>
    (b.box_height ?? 0) - (a.box_height ?? 0) || a.name.localeCompare(b.name),
  )[0] ?? null
}

// Does the interior hold anything that needs height above a bin?
export function treeHasDrawerFittings(s: Section | undefined | null): boolean {
  if (!s) return false
  if (s.type === 'open') return (s.fittings ?? []).some(f => f.type === 'inner_drawer' || f.type === 'pull_out')
  return s.children.some(c => treeHasDrawerFittings(c.section))
}

// When no bin fits the clear width, the widest bin narrower than it (height +
// depth permitting) — the one divisions would make fit (B-D4).
export function binForDivisions(
  insideWidth: number, insideDepth: number, availableHeight: number, bins: SlideProduct[],
): SlideProduct | null {
  const narrower = bins.filter(b =>
    b.inside_width_max != null && b.inside_width_max < insideWidth &&
    (b.nominal_length ?? 0) <= insideDepth + EPS &&
    (b.box_height ?? 0) <= availableHeight + EPS)
  return [...narrower].sort((a, b) =>
    (b.inside_width_max ?? 0) - (a.inside_width_max ?? 0) ||
    (b.box_height ?? 0) - (a.box_height ?? 0) || a.name.localeCompare(b.name),
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
  // Shaped cabinets (z_cabinet_shape Phase 3b): the clear opening behind each
  // drawer front, in the zone's square frame. Absent = the plain box opening.
  openingOf?: (zone: ResolvedFaceZone) => ZoneOpening | null,
  // Internal dividers the runners can fix to (z_dividers V2). Box cabinets only.
  dividers: ResolvedInternalPart[] = [],
  // Finger-pull backing rails (z_handles H6). A bin's usable height stops under
  // the lowest one above it: nothing inside can rise past it.
  backingRails: { bottom: number; x0: number; x1: number }[] = [],
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
    const opening = openingOf?.(zone) ?? null
    const zoneInput = gridForFacet(cab, zone.facet)?.zones.find(
      z => z.row_index === zone.row_index && z.col_index === zone.col_index
    )
    const config = zoneInput?.drawer_type_config
    const drawerType: DrawerFrontType = config?.type ?? cab.default_drawer_type ?? 'system'

    const openingHeight = zone.DY   // face zone: DY = height (DX = width)
    const zoneRef = `${zone.facet ? `${zone.facet} ` : ''}[${zone.row_index},${zone.col_index}]`

    if (openingHeight <= 0) {
      errors.push({
        code: 'DRAWER_OPENING_INVALID',
        message: `Drawer zone ${zoneRef} has a ${round1(openingHeight)}mm opening height`,
        part: 'drawer_face',
      })
      continue
    }

    // ── Pull-out bin (z_bin_cabinet B2) ─────────────────────────────────────
    // No drawer box and no separate runners: the bin product carries both. Its
    // rails sit on the mounting faces (gables, or the divisions either side),
    // and every hole is measured up from the cabinet floor (B-D6).
    if (drawerType === 'bin') {
      if (opening) {
        errors.push({ code: 'BIN_SHAPED_UNSUPPORTED', message: `Bin ${zoneRef}: bins need a square cabinet`, part: 'drawer_box' })
        continue
      }
      const binMembers = memberBounds(zone, dividers, T + r.SCRL, cab.DX - T - r.SCRR)
      const insideW = binMembers.right.x - binMembers.left.x
      const railUnder = backingRails
        .filter(rl => rl.bottom > internalFloorY && rl.x0 < binMembers.right.x && rl.x1 > binMembers.left.x)
        .map(rl => rl.bottom)
      const interiorTop = Math.min(zone.Y + zone.DY, cab.DY - T - r.SCRT, ...railUnder)
      const availH = interiorTop - internalFloorY
      const bins = cab.bin_products ?? []
      const binOverride = config?.slide_product_id
      // Inner drawers / pull-outs inside (BBIN+I1, B-D7): keep BINUP clear above
      // the bin. If no bin leaves that much, fall back to the tallest that fits
      // and say the fittings won't.
      const roomAbove = cab.has_internal && treeHasDrawerFittings(cab.internal_tree) ? r.BINUP : 0
      let bin = findBin(insideW, internalDepth, availH - roomAbove, bins, binOverride)
      if (!bin && roomAbove > 0) {
        bin = findBin(insideW, internalDepth, availH, bins, binOverride)
        if (bin) warnings.push({
          code: 'BIN_NO_ROOM_ABOVE',
          message: `Bin ${zoneRef}: no bin leaves ${round1(roomAbove)}mm for the inner drawer above — the ${bin.name} leaves ${round1(availH - (bin.box_height ?? 0))}mm`,
          part: 'drawer_box',
        })
      }
      if (!bin) {
        const fix = binForDivisions(insideW, internalDepth, availH, bins)
        // One-click fix (B4): a division each side, bin column mid-range. Only
        // between the carcass sides — existing divisions are the user's layout.
        const target = fix && fix.inside_width_min != null && fix.inside_width_max != null
          ? (fix.inside_width_min + fix.inside_width_max) / 2 : null
        const voidMm = target != null ? (insideW - 2 * T - target) / 2 : 0
        const action = target != null && voidMm > 0 && !binMembers.left.target && !binMembers.right.target
          ? { type: 'add_bin_divisions' as const, void_mm: round1(voidMm), bin: fix!.name, zone: [zone.row_index, zone.col_index] as [number, number] }
          : undefined
        warnings.push({
          ...(action ? { action } : {}),
          code: 'NO_BIN_FITS',
          message: bins.length === 0
            ? `Bin ${zoneRef}: no bins in the hardware library`
            : `Bin ${zoneRef}: no bin fits ${round1(insideW)}mm inside` +
              (fix ? ` — add a division each side to fit the ${fix.name} (${fix.inside_width_min}–${fix.inside_width_max})` : ''),
          part: 'drawer_box',
        })
        continue
      }
      if (binOverride) {
        const issues = [
          bin.inside_width_min != null && insideW < bin.inside_width_min - EPS && `${round1(insideW)}mm inside is under its ${bin.inside_width_min} minimum`,
          bin.inside_width_max != null && insideW > bin.inside_width_max + EPS && `${round1(insideW)}mm inside is over its ${bin.inside_width_max} maximum`,
          (bin.box_height ?? 0) > availH + EPS && `it is ${round1((bin.box_height ?? 0) - availH)}mm too tall`,
          (bin.nominal_length ?? 0) > internalDepth + EPS && `the cabinet is ${round1((bin.nominal_length ?? 0) - internalDepth)}mm too shallow`,
        ].filter(Boolean)
        if (issues.length) warnings.push({ code: 'BIN_FORCED_MISFIT', message: `Bin ${zoneRef}: the chosen ${bin.name} doesn't fit — ${issues.join('; ')}`, part: 'drawer_box' })
      }
      const NL = bin.nominal_length ?? 520
      const binH = bin.box_height ?? 0
      const RT = bin.runner_thickness
      const railBase: Omit<ResolvedDrawerSlide, 'side' | 'X'> = {
        Y: internalFloorY, Z: zone.Z - NL, DX: NL, DY: binH, DZ: RT,
        slide_id: bin.id, nominal_length: NL, box_height: binH, runner_thickness: RT,
        colour: bin.colour, model_url: bin.model_url, model_format: bin.model_format,
        model_scale: bin.model_scale, model_anchor_x: bin.model_anchor_x,
        model_anchor_y: bin.model_anchor_y, model_anchor_z: bin.model_anchor_z,
        drills: [],
      }
      const rails: ResolvedDrawerSlide[] = [
        { ...railBase, side: 'left',  X: binMembers.left.x, ...(binMembers.left.target ? { member: binMembers.left.target } : {}) },
        { ...railBase, side: 'right', X: binMembers.right.x - RT, ...(binMembers.right.target ? { member: binMembers.right.target } : {}) },
      ]
      for (const sl of rails) {
        sl.drills = slideDrillOps(sl, bin.drill_ops, {
          face: zone,
          memberFaceX: sl.side === 'left' ? binMembers.left.x : binMembers.right.x,
          frontDatumY: internalFloorY,
        })
      }
      stacks.push({
        ...(zone.facet ? { facet: zone.facet } : {}),
        face_zone_row: zone.row_index,
        face_zone_col: zone.col_index,
        drawer_type:   'bin',
        box_parts:     [],
        slides:        rails,
        box_width:  insideW,
        box_height: binH,
        box_depth:  NL,
        box_X: binMembers.left.x,
        box_Y: internalFloorY,
        box_Z: zone.Z - NL,
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
    const depthHere = opening ? opening.availableDepth : availableDepth
    if (opening && depthHere < 100) {
      errors.push({
        code: 'DRAWER_NO_ROOM',
        message: `Drawer ${zoneRef}: only ${round1(Math.max(0, depthHere))}mm of depth behind this front — make it a door or a false front`,
        part: 'drawer_box',
      })
      continue
    }
    const slide = findSlide(depthHere, openingHeight, slideProducts, slideSchedule, slideOverride, { clearance })

    if (!slide && hasHardware && !slideOverride) {
      const source = slideSchedule.length > 0 ? 'the slide schedule' : 'the slide list'
      errors.push({
        code: 'NO_SLIDE_FITS',
        message: `Drawer ${zoneRef}: nothing in ${source} fits a ${round1(openingHeight)}mm opening` +
          (clearance > 0 ? ` with ${round1(clearance)}mm clearance above the box` : '') +
          ` at ${round1(depthHere)}mm available depth`,
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
    const nominalLength  = slide?.nominal_length    ?? depthHere

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
    // Shaped: the faces the runners fix to are the opening's sides over the
    // runner length (zone frame); a side with no square panel needs a packer.
    const span = opening?.span(nominalLength) ?? null
    if (opening && !span) {
      errors.push({ code: 'DRAWER_NO_ROOM', message: `Drawer ${zoneRef}: no clear opening for a ${round1(nominalLength)}mm runner`, part: 'drawer_box' })
      continue
    }
    const members = span ? null : memberBounds(zone, dividers, T + r.SCRL, cab.DX - T - r.SCRR)
    const leftMemberX  = span ? span.x0 : members!.left.x
    const rightMemberX = span ? span.x1 : members!.right.x
    if (opening && span) {
      // One warning per facet side, not per drawer.
      const where = zone.facet ? `on the ${zone.facet} facet` : 'on the front'
      for (const [side, x] of [['left', span.x0], ['right', span.x1]] as const) {
        const message = `Drawers ${where}: the ${side} runners have no square panel to fix to — need packers or rear brackets`
        if (!opening.squarePanelAt(x, nominalLength) && !warnings.some(w => w.message === message))
          warnings.push({ code: 'DRAWER_RUNNER_PACKER', message, part: 'drawer_box' })
      }
    }
    const boxWidth = Math.max(1, rightMemberX - leftMemberX - runnerThick * 2)
    const boxDepth = nominalLength

    // Cabinet-space origin of the box — interior left face (T + SCRL) plus the left
    // runner, so the box sits between the two rails which touch the gables.
    const boxX = leftMemberX + runnerThick
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
      box_width:           boxWidth,
      box_height:          boxHeight,
      box_depth:           boxDepth,
      material:            drawerMat,
      edgeband_id:         cab.drawer_edgeband_id,
      bottom_material:     cab.drawer_bottom_material,
      bottom_edgeband_id:  cab.drawer_bottom_edgeband_id,
      rules:               rulesForResolve,
      slide_box_height:    slide?.box_height ?? undefined,
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
      drawn_as:         slide?.drawn_as ?? null,
      drills:           [],
    }

    const slides: ResolvedDrawerSlide[] = [
      { ...slideBase, side: 'left',  X: leftMemberX, ...(members?.left.target ? { member: members.left.target } : {}) },
      { ...slideBase, side: 'right', X: rightMemberX - runnerThick, ...(members?.right.target ? { member: members.right.target } : {}) },
    ]

    // Resolve slide-imposed drilling against the REAL resolved parts (not the box
    // envelope) so back setback, dado raise and face overhang land correctly.
    const backPart   = boxParts.find(p => p.part_type === 'db_back')
    const bottomPart = boxParts.find(p => p.part_type === 'db_bottom')
    for (const sl of slides) {
      const sidePart = boxParts.find(p =>
        p.part_type === (sl.side === 'left' ? 'db_left_side' : 'db_right_side'))
      sl.drills = slideDrillOps(sl, slide?.drill_ops ?? [], {
        backPart, bottomPart, sidePart, face: zone,
        memberFaceX: sl.side === 'left' ? leftMemberX : rightMemberX,
      })
    }

    stacks.push({
      ...(zone.facet ? { facet: zone.facet } : {}),
      ...(opening && zone.AY ? { turn: zoneTurn(zone) } : {}),
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
