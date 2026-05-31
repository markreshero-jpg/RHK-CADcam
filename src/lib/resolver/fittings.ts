// ============================================================
// Internal Fittings — registry + resolvers
//
// A *fitting* is a non-structural component placed inside an open compartment of
// the internal section tree. The tree's walk() computes an exact compartment box
// {x, y, w, h} (cabinet coords, y = bottom); each fitting is dispatched by type
// to a resolver that emits ResolvedInternalPart[] within that box.
//
// Structural separators (fixed shelves as an hsplit, dividers as a vsplit) are
// NOT fittings — they live in the tree as SplitSection and are emitted by
// resolveInternal directly. A fixed shelf MAY also be placed as a fitting (a lone
// shelf inside a compartment, without subdividing it).
//
// Adding a fitting type = one resolver here + one entry in FITTING_RESOLVERS
// (+ a part_type/edging entry in types.ts, + an editor menu entry in Phase 4).
//
// NOTE on inner_drawer / pull_out dimensions: these reuse resolveDrawerBox, which
// carries the *drawer-box* dimension convention (DX = depth/Z extent, DY = width
// or height, DZ = thickness, local Z=0 = front). The mapped ResolvedInternalParts
// preserve that convention, so the Phase 5 renderers must orient them like the
// existing drawer-box parts (the generic internal-part renderers assume a
// shelf/divider convention and will mis-orient them until then).
// ============================================================

import {
  ResolvedInternalPart, ConstructionRules, ResolverError,
  InternalFitting, InternalFittingType,
  AdjShelfFitting, FixedShelfFitting, InnerDrawerFitting, PullOutFitting,
  DrawerType, DrawerBoxRules, DrawerBoxPartType, Material,
  SlideProduct, SlideScheduleEntry, ResolvedDrawerSlide,
  edgeSidesToBanding, EdgingDefaults,
} from './types'
import { resolveDrawerBox } from './resolveDrawerBox'
import { findSlide } from './resolveDrawerStack'

// Axis-aligned compartment region in cabinet coordinates (x = left, y = bottom).
export interface Box { x: number; y: number; w: number; h: number }

// Everything a fitting resolver needs that isn't carried by the box itself.
export interface FittingCtx {
  r:        ConstructionRules
  T:        number   // carcass material thickness
  TS:       number   // shelf material thickness
  intD:     number   // interior depth
  intBack:  number   // cabinet Z of the interior back face (back panel inner face)

  shelfMatId:   string
  carcMatId:    string
  shelfEbId?:   string
  interiorEbId?: string
  edging:       Required<EdgingDefaults>

  // Inner-drawer / pull-out box construction (separate from face drawers)
  innerDrawerRules: DrawerBoxRules
  // Default drawer_type sourced from the inner-drawer method (cabinet → room →
  // project → shop). Used when an inner-drawer fitting has no explicit
  // drawer_type, so changing the job-level inner method updates existing inner
  // drawers automatically.
  defaultInnerDrawerType?: DrawerType
  innerDrawerMat:   Material
  innerDrawerEbId?: string
  innerDrawerBottomMat?: Material
  innerDrawerBottomEbId?: string
  innerDrawerFrontMat?:  Material
  innerDrawerFrontEbId?: string
  slideProducts:    SlideProduct[]
  slideSchedule:    SlideScheduleEntry[]
  // Per-fitting method override map (id → rules). Pre-fetched in loadCabinetInput.
  methodRulesById:  Record<string, DrawerBoxRules>

  // Vertical gap (mm) between stacked items in emitBoxStack. Per-cabinet —
  // sourced from CabinetInput.internal_stack_gap; defaults to 3mm.
  stackGap: number

  // Shared output bookkeeping (merged with the separator emitters in resolveInternal)
  sort:   Record<string, number>
  errors: ResolverError[]
  // Slide rails emitted by inner-drawer / pull-out fittings — collected here so
  // the renderer can draw them like face-drawer slides. Each fitting emits two
  // (left + right) when a slide product is picked.
  internalSlides: ResolvedDrawerSlide[]
}

type FittingResolver = (box: Box, fittings: InternalFitting[], ctx: FittingCtx) => ResolvedInternalPart[]

// Default vertical gap between stacked drawers / pull-outs (mm) when the
// cabinet doesn't carry a per-cabinet override.
export const DEFAULT_STACK_GAP = 3

// ── Adjustable shelves ─────────────────────────────────────────────────────────
// Movable shelves on pins. N shelves divide the compartment into N+1 equal
// openings (unless individually y-locked). Behaviour preserved from the original
// emitAdjShelves so the resolver test-suite stays green.
function resolveAdjShelves(box: Box, fittings: InternalFitting[], ctx: FittingCtx): ResolvedInternalPart[] {
  const out: ResolvedInternalPart[] = []
  const shelves = fittings.filter((f): f is AdjShelfFitting => f.type === 'adj_shelf')
  const n = shelves.length
  if (n === 0) return out

  const { r } = ctx
  const adjDX = ctx.intD - r.ADJSB_F - r.ADJSB_B
  const adjZ  = ctx.intBack + r.ADJSB_B
  if (adjDX <= 0) {
    ctx.errors.push({ code: 'ADJ_SHELF_DEPTH_INVALID', message: `Adj shelf depth resolves to ${adjDX}mm`, part: 'adj_shelf' })
    return out
  }
  const shDY = box.w - r.ADJSL - r.ADJSR
  if (shDY <= 0) {
    ctx.errors.push({ code: 'ADJ_SHELF_TOO_NARROW', message: `Adj shelf width resolves to ${shDY}mm`, part: 'adj_shelf' })
    return out
  }
  const openH = (box.h - n * ctx.TS) / (n + 1)
  if (openH <= 0) {
    ctx.errors.push({ code: 'TOO_MANY_ADJ_SHELVES', message: `${n} adj shelves exceed available height (${Math.round(box.h)}mm)`, part: 'adj_shelf' })
    return out
  }

  shelves.forEach((s, i) => {
    const shY = (s.y_locked && s.y_position !== undefined)
      ? s.y_position
      : box.y + (i + 1) * openH + i * ctx.TS
    out.push({
      part_type:   'adj_shelf',
      sort_order:  ctx.sort.adj_shelf++,
      DX: adjDX, DY: shDY, DZ: ctx.TS,
      X:  box.x + r.ADJSL, Y: shY, Z: adjZ,
      AX: 0, AY: 0, AZ: 0,
      material_id: ctx.shelfMatId,
      edge_band:   edgeSidesToBanding(ctx.edging.adj_shelf, ctx.shelfEbId),
      y_locked:    s.y_locked,
    })
  })
  return out
}

// ── Fixed shelf (as compartment content, not a structural split) ────────────────
// Full internal width, at y_position or compartment mid-height.
function resolveFixedShelfFittings(box: Box, fittings: InternalFitting[], ctx: FittingCtx): ResolvedInternalPart[] {
  const out: ResolvedInternalPart[] = []
  const shelves = fittings.filter((f): f is FixedShelfFitting => f.type === 'fixed_shelf')
  if (shelves.length === 0) return out

  const { r } = ctx
  const fsDX = ctx.intD - r.FIXSB_F - r.FIXSB_B
  const fsZ  = ctx.intBack + r.FIXSB_B
  if (fsDX <= 0) {
    ctx.errors.push({ code: 'FIXED_SHELF_DEPTH_INVALID', message: `Fixed shelf depth resolves to ${fsDX}mm`, part: 'fixed_shelf' })
    return out
  }

  for (const s of shelves) {
    const y = (s.y_locked && s.y_position !== undefined)
      ? s.y_position
      : box.y + box.h / 2 - ctx.TS / 2
    out.push({
      part_type:   'fixed_shelf',
      sort_order:  ctx.sort.fixed_shelf++,
      DX: fsDX, DY: box.w, DZ: ctx.TS,
      X:  box.x, Y: y, Z: fsZ,
      AX: 0, AY: 0, AZ: 0,
      material_id: ctx.shelfMatId,
      edge_band:   edgeSidesToBanding(ctx.edging.fixed_shelf, ctx.shelfEbId),
      y_locked:    s.y_locked,
    })
  }
  return out
}

// ── Shared box-stack helper (inner drawers + pull-outs) ─────────────────────────
// Stacks one or more boxes bottom→top inside the compartment, reusing
// resolveDrawerBox for the box geometry and findSlide for hardware selection.
interface BoxItem {
  drawerType:           DrawerType
  height?:              number
  y_locked?:            boolean
  y_position?:          number
  slide_product_id?:    string
  runner_depth?:        number
  clearance_l?:         number
  clearance_r?:         number
  drawer_box_method_id?: string   // per-fitting override (resolved via ctx.methodRulesById)
}
interface BoxStackCfg {
  typeMap:       Partial<Record<DrawerBoxPartType, ResolvedInternalPart['part_type']>>
  keepFront:     boolean
  defaultHeight: number
  sortKey:       'inner_drawer' | 'pull_out'
  // When true, emit an additional `inner_drawer_front` per item: a face piece
  // wider than the box (spans runner gap minus IDB_FRONT_CLEAR per side). Inner
  // drawers want this; pull-outs don't.
  emitInnerFront?: boolean
}

function emitBoxStack(box: Box, items: BoxItem[], ctx: FittingCtx, cfg: BoxStackCfg): ResolvedInternalPart[] {
  const out: ResolvedInternalPart[] = []
  const { r } = ctx
  const availableDepth = ctx.intD - r.SLIDE_SETBACK
  // Front opening plane of the interior (cabinet Z). Box front sits here; back
  // runs toward the cabinet back. resolveDrawerBox is local-front-origin (Z=0),
  // so cabinet_Z = frontZ - local_Z (mirrors resolveDrawerStack).
  const frontZ = ctx.intBack + ctx.intD
  if (availableDepth <= 0) {
    ctx.errors.push({ code: 'INNER_DRAWER_DEPTH_INVALID', message: `Available depth resolves to ${Math.round(availableDepth)}mm`, part: cfg.sortKey })
    return out
  }

  const SYSTEM_PARTS = new Set<DrawerBoxPartType>(['db_back', 'db_bottom'])
  let cursorY = box.y

  for (let drawerIdx = 0; drawerIdx < items.length; drawerIdx++) {
    const it = items[drawerIdx]
    // Opening height for slide picking: fitting height if set, else the compartment's
    // own height (lets findSlide pick the tallest slide that fits the compartment).
    const openingH      = it.height ?? box.h
    const slide         = findSlide(availableDepth, openingH, ctx.slideProducts, ctx.slideSchedule, it.slide_product_id)
    const runnerThick   = slide?.runner_thickness ?? 0
    const nominalLength = it.runner_depth ?? slide?.nominal_length ?? availableDepth
    // Box height precedence: explicit fitting.height > slide.box_height > defaultHeight.
    // This means an inner drawer with no height inherits the picked slide's box_height
    // (consistent with how system face drawers already work).
    const boxHeight     = it.height ?? slide?.box_height ?? cfg.defaultHeight

    const cl       = it.clearance_l ?? r.IDCL
    const cr       = it.clearance_r ?? r.IDCR
    const boxWidth = Math.max(1, box.w - cl - cr - runnerThick * 2)
    const boxX     = box.x + cl + runnerThick
    const boxY     = (it.y_locked && it.y_position !== undefined) ? it.y_position : cursorY

    if (boxY + boxHeight > box.y + box.h + 0.5) {
      ctx.errors.push({
        code:    'FITTING_OVERFLOW',
        message: `A ${cfg.sortKey.replace('_', ' ')} (${Math.round(boxHeight)}mm) exceeds the compartment height (${Math.round(box.h)}mm)`,
        part:    cfg.sortKey,
      })
    }

    // Per-fitting method override — falls back to the cabinet-level inner rules.
    const baseRules: DrawerBoxRules =
      (it.drawer_box_method_id && ctx.methodRulesById[it.drawer_box_method_id])
        ? ctx.methodRulesById[it.drawer_box_method_id]
        : ctx.innerDrawerRules
    const rulesForResolve: DrawerBoxRules = it.drawerType === 'system'
      ? { ...baseRules, DB_SIDE_T: 0 }
      : { ...baseRules, DB_SIDE_T: ctx.innerDrawerMat.DZ }

    const localParts = resolveDrawerBox({
      box_width:         boxWidth,
      box_height:        boxHeight,
      box_depth:         nominalLength,
      material:          ctx.innerDrawerMat,
      edgeband_id:       ctx.innerDrawerEbId,
      bottom_material:   ctx.innerDrawerBottomMat,
      bottom_edgeband_id: ctx.innerDrawerBottomEbId,
      front_material:    ctx.innerDrawerFrontMat,
      front_edgeband_id: ctx.innerDrawerFrontEbId,
      rules:             rulesForResolve,
      slide_box_height:  it.drawerType === 'system' ? (slide?.box_height ?? undefined) : undefined,
    }).filter(p => it.drawerType === 'five_piece' || SYSTEM_PARTS.has(p.part_type))

    // Inner-drawer-only adjustments (zeroed for pull-outs / anything without a face):
    // — DRAWER_Z_SETBACK pushes the whole assembly (box + slides + face) into the cabinet.
    // — FRONT_TOP/BOTTOM/WIDTH adjust grow the visible inner-drawer face beyond the box.
    const idbSetback = cfg.emitInnerFront ? (rulesForResolve.IDB_DRAWER_Z_SETBACK ?? 0) : 0

    for (const p of localParts) {
      if (!cfg.keepFront && p.part_type === 'db_front') continue
      const mapped = cfg.typeMap[p.part_type]
      if (!mapped) continue
      out.push({
        part_type:   mapped,
        sort_order:  ctx.sort[cfg.sortKey]++,
        DX: p.DX, DY: p.DY, DZ: p.DZ,
        X:  p.X + boxX,
        Y:  p.Y + boxY,
        Z:  frontZ - p.Z - idbSetback,
        AX: 0, AY: 0, AZ: 0,
        material_id: p.material_id,
        edge_band:   p.edge_band,
        y_locked:    !!it.y_locked,
        inner_drawer_index: drawerIdx,
      })
    }

    // Slide rails — one on each compartment wall, mirroring resolveDrawerStack
    // for face drawers. Only emitted when a slide product was actually picked
    // (runnerThick > 0) so empty/unmatched compartments don't get zero-width rails.
    if (slide && runnerThick > 0) {
      const slideBase: Omit<ResolvedDrawerSlide, 'side' | 'X'> = {
        Y: boxY,
        Z: frontZ - nominalLength - idbSetback,
        DX: nominalLength,
        DY: slide.box_height ?? boxHeight,
        DZ: runnerThick,
        slide_id:         slide.id,
        nominal_length:   nominalLength,
        box_height:       slide.box_height ?? boxHeight,
        runner_thickness: runnerThick,
        colour:           slide.colour ?? null,
        model_url:        slide.model_url ?? null,
        model_format:     slide.model_format ?? null,
        model_scale:      slide.model_scale ?? 1,
        model_anchor_x:   slide.model_anchor_x ?? 0,
        model_anchor_y:   slide.model_anchor_y ?? 0,
        model_anchor_z:   slide.model_anchor_z ?? 0,
        inner_drawer_index: drawerIdx,
      }
      ctx.internalSlides.push(
        { ...slideBase, side: 'left',  X: box.x + cl },
        { ...slideBase, side: 'right', X: box.x + box.w - cr - runnerThick },
      )
    }

    // Inner drawer face — wider than the structural box, sized to the compartment
    // opening minus IDB_FRONT_CLEAR per side, with optional top/bottom/width
    // adjusts to extend past the box edges. Sits in front of the slides by
    // default (back face on slide-front plane); the whole-drawer setback then
    // pulls it (along with box + slides) deeper into the cabinet.
    if (cfg.emitInnerFront) {
      const idbClear = rulesForResolve.IDB_FRONT_CLEAR         ?? 2
      const topAdj   = rulesForResolve.IDB_FRONT_TOP_ADJUST    ?? 0
      const botAdj   = rulesForResolve.IDB_FRONT_BOTTOM_ADJUST ?? 0
      const wAdj     = rulesForResolve.IDB_FRONT_WIDTH_ADJUST  ?? 0
      const frontMat = ctx.innerDrawerFrontMat ?? ctx.innerDrawerMat
      const frontEb  = ctx.innerDrawerFrontEbId ?? ctx.innerDrawerEbId
      const faceDy   = Math.max(1, box.w - cl - cr - 2 * idbClear + wAdj)
      const faceDx   = Math.max(1, boxHeight + topAdj + botAdj)
      out.push({
        part_type:   'inner_drawer_front',
        sort_order:  ctx.sort.inner_drawer++,
        DX: faceDx,
        DY: faceDy,
        DZ: frontMat.DZ,
        X:  box.x + cl + idbClear - wAdj / 2,
        Y:  boxY - botAdj,
        // Cabinet-coord Z = the face's FRONT face (Cabinet3DView / int*Rect all
        // anchor mesh extents as [Z - DZ, Z]). The slides' front face sits at
        // frontZ; to land this face's BACK on that plane (drawer-box-builder
        // convention: face sits in front of slides), Z = frontZ + faceDZ.
        // Setback pulls the whole assembly deeper into the cabinet.
        Z:  frontZ + frontMat.DZ - idbSetback,
        AX: 0, AY: 0, AZ: 0,
        material_id: frontMat.id,
        edge_band:   edgeSidesToBanding(ctx.edging.inner_drawer_front, frontEb),
        y_locked:    !!it.y_locked,
        inner_drawer_index: drawerIdx,
      })
    }

    cursorY = boxY + boxHeight + ctx.stackGap
  }
  return out
}

// ── Inner drawer (compartment-anchored pull-out drawer) ─────────────────────────
function resolveInnerDrawers(box: Box, fittings: InternalFitting[], ctx: FittingCtx): ResolvedInternalPart[] {
  const items: BoxItem[] = fittings
    .filter((f): f is InnerDrawerFitting => f.type === 'inner_drawer')
    .map(f => ({
      // Cascade: explicit fitting type → cabinet's inner-method default → 'five_piece'.
      drawerType:           f.drawer_type ?? ctx.defaultInnerDrawerType ?? 'five_piece',
      height:               f.height,
      y_locked:             f.y_locked,
      y_position:           f.y_position,
      slide_product_id:     f.slide_product_id,
      runner_depth:         f.runner_depth,
      clearance_l:          f.clearance_l,
      clearance_r:          f.clearance_r,
      drawer_box_method_id: f.drawer_box_method_id,
    }))
  if (items.length === 0) return []
  // No db_front mapping: the inner-drawer face is emitted separately by
  // emitBoxStack (see `emitInnerFront`) so it can span wider than the box.
  return emitBoxStack(box, items, ctx, {
    typeMap: {
      db_left_side:  'inner_drawer_side',
      db_right_side: 'inner_drawer_side',
      db_back:       'inner_drawer_back',
      db_bottom:     'inner_drawer_bottom',
    },
    keepFront:      false,
    defaultHeight:  150,
    sortKey:        'inner_drawer',
    emitInnerFront: true,
  })
}

// ── Pull-out shelf / tray (drawer without a front) ──────────────────────────────
function resolvePullOuts(box: Box, fittings: InternalFitting[], ctx: FittingCtx): ResolvedInternalPart[] {
  const items: BoxItem[] = fittings
    .filter((f): f is PullOutFitting => f.type === 'pull_out')
    .map(f => ({
      drawerType:       'five_piece' as DrawerType,
      height:           f.height,
      y_locked:         f.y_locked,
      y_position:       f.y_position,
      slide_product_id: f.slide_product_id,
      runner_depth:     f.runner_depth,
      clearance_l:      f.clearance_l,
      clearance_r:      f.clearance_r,
    }))
  if (items.length === 0) return []
  return emitBoxStack(box, items, ctx, {
    typeMap: {
      db_left_side:  'pull_out_side',
      db_right_side: 'pull_out_side',
      db_back:       'pull_out_back',
      db_bottom:     'pull_out_bottom',
    },
    keepFront:     false,
    defaultHeight: 60,
    sortKey:       'pull_out',
  })
}

// ── Accessory (wine rack / file rail / misc) — registry slot, geometry TBD ───────
function resolveAccessories(_box: Box, _fittings: InternalFitting[], _ctx: FittingCtx): ResolvedInternalPart[] {
  // Phase 2 stub: accepted in the model + editor, but emits no parts yet.
  // Geometry will be driven by the parts_library `key` in a later phase.
  return []
}

// ── Registry + dispatcher ───────────────────────────────────────────────────────
const FITTING_RESOLVERS: Record<InternalFittingType, FittingResolver> = {
  adj_shelf:    resolveAdjShelves,
  fixed_shelf:  resolveFixedShelfFittings,
  inner_drawer: resolveInnerDrawers,
  pull_out:     resolvePullOuts,
  accessory:    resolveAccessories,
}

// Estimate a fitting's vertical extent (mm) so the cross-type cursor walk can
// advance the right amount before placing the next item. Mirrors the heights
// each type's resolver would settle on:
//   • fixed_shelf → shelf thickness
//   • inner_drawer / pull_out → explicit height, else slide.box_height (via the
//     same findSlide call emitBoxStack makes), else type default
//   • accessory → explicit height, else 80mm (matches the editor's DEF_ACC_H)
function fittingExtent(box: Box, f: InternalFitting, ctx: FittingCtx): number {
  switch (f.type) {
    case 'fixed_shelf': return ctx.TS
    case 'inner_drawer':
    case 'pull_out': {
      const availableDepth = ctx.intD - ctx.r.SLIDE_SETBACK
      const openingH = f.height ?? box.h
      const slide = findSlide(availableDepth, openingH, ctx.slideProducts, ctx.slideSchedule, f.slide_product_id)
      const def    = f.type === 'inner_drawer' ? 150 : 60
      return f.height ?? slide?.box_height ?? def
    }
    case 'accessory': return f.height ?? 80
    default:          return 0
  }
}

// Walk fittings in order with a single cursor so the stack gap applies between
// every adjacent pair regardless of type (shelf-drawer, drawer-drawer,
// drawer-shelf-pull-out, …). Each unlocked fitting is rewritten with
// y_locked=true and y_position=cursor; the type-specific resolvers then pick
// up the same Y. User-locked fittings keep their explicit Y but still bump
// the cursor past their own extent so later items stack above them.
//
// Special case: when the compartment holds exactly one non-adj fitting and
// it's an unlocked fixed_shelf, we leave it untouched so the long-standing
// "lone shelf sits at mid-height" default still applies. Any setup with 2+
// stackable fittings opts in to ordered stacking.
//
// adj_shelf is excluded — those are equalised across the whole compartment by
// resolveAdjShelves and don't participate in ordered stacking.
function positionFittings(box: Box, fittings: InternalFitting[], ctx: FittingCtx): InternalFitting[] {
  const stackables = fittings.filter(f => f.type !== 'adj_shelf')
  if (stackables.length === 1 && stackables[0].type === 'fixed_shelf' && !stackables[0].y_locked) {
    return fittings
  }
  let cursor = box.y
  return fittings.map(f => {
    if (f.type === 'adj_shelf') return f
    const h = fittingExtent(box, f, ctx)
    if (f.y_locked && f.y_position !== undefined) {
      cursor = Math.max(cursor, f.y_position + h + ctx.stackGap)
      return f
    }
    const y = cursor
    cursor = y + h + ctx.stackGap
    return { ...f, y_locked: true, y_position: y } as InternalFitting
  })
}

// Resolve every fitting in an open compartment. Groups by type (preserving order)
// so batch resolvers (e.g. adj shelves equalising together) get all their items.
export function resolveFittings(box: Box, fittings: InternalFitting[], ctx: FittingCtx): ResolvedInternalPart[] {
  if (!fittings || fittings.length === 0) return []
  // Pre-position non-adj fittings so the cross-type cursor walk drives every
  // type's resolver. Each type-specific resolver still computes its own
  // geometry — we just guarantee they all see consistent y_position values
  // when stacking applies.
  const positioned = positionFittings(box, fittings, ctx)
  const out: ResolvedInternalPart[] = []
  const byType = new Map<InternalFittingType, InternalFitting[]>()
  for (const f of positioned) {
    const arr = byType.get(f.type)
    if (arr) arr.push(f)
    else byType.set(f.type, [f])
  }
  for (const [type, fs] of byType) {
    out.push(...FITTING_RESOLVERS[type](box, fs, ctx))
  }
  return out
}
