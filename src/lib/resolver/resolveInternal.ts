// ============================================================
// Internal Module Resolver
// Walks the recursive section tree, emitting:
//   • fixed shelves  — separators of a horizontal split (hsplit)
//   • dividers       — separators of a vertical split (vsplit)
// Open compartments (leaves) hold *fittings* (adjustable shelves, inner drawers,
// pull-outs, accessories…) which are resolved by the fitting registry against the
// compartment box. See resolver/fittings.ts.
// ============================================================

import {
  CabinetInput, ResolvedInternalPart, ResolvedDrawerSlide, ConstructionRules, ResolvedFaceZone, ResolvedOpenZone,
  ResolverError, Section, SectionChild,
  edgeSidesToBanding, DEFAULT_EDGING, EdgingDefaults, DEFAULT_DB_RULES,
} from './types'
import { Box, FittingCtx, resolveFittings, DEFAULT_STACK_GAP } from './fittings'
import { caseBackT, caseFloor } from './resolveCase'
import type { OutlinePt } from '../shapePath'

// A drawer/rollout bay = an open compartment holding a drawer or rollout. Such a
// bay should have OPEN gaps around it (no shelves), so we detect it to self-heal
// data where the 'none' separator was dropped.
function isDrawerBaySection(section: Section | undefined | null): boolean {
  return !!section && section.type === 'open'
    && (section.fittings ?? []).some(f => f.type === 'inner_drawer' || f.type === 'pull_out')
}

// Panels in the vsplit divider after a child (z_dividers): a double divider is
// two panels back to back. Undefined = automatic: double when it stands between
// drawers side by side (`auto`, V-D3), else single.
export function dividerPanels(c: SectionChild, auto = false): 1 | 2 {
  return c.divider === 'double' || (c.divider === undefined && auto) ? 2 : 1
}

/** Tree key of the separator after children[index] of the split at `path`. */
export const sepKey = (path: number[], index: number) => `${path.join('.')}:${index}`

// A seam between two drawer fronts side by side (same row, neighbouring
// columns): the gap's centre line and the fronts' height.
interface DrawerSeam { mid: number; y0: number; y1: number }
function drawerSeams(zones: ResolvedFaceZone[]): DrawerSeam[] {
  const out: DrawerSeam[] = []
  const drawers = zones.filter(z => z.face_type === 'drawer_face' && !z.facet && !z.AY)
  for (const a of drawers) {
    const b = drawers.find(z => z.row_index === a.row_index && z.col_index === a.col_index + 1)
    if (!b) continue
    out.push({ mid: (a.X + a.DX + b.X) / 2, y0: Math.min(a.Y, b.Y), y1: Math.max(a.Y + a.DY, b.Y + b.DY) })
  }
  return out
}

// Thickness consumed by the divider between child i and i+1 of a split. Vertical
// splits = a divider panel (matT). Horizontal splits = a shelf (shelfT) UNLESS
// the gap is 'none' (explicit open gap) or borders a drawer/rollout bay with no
// explicit separator set (open gap, inferred — keeps drawers shelf-free even if
// the separator field was lost in old data).
function gapThickness(kids: SectionChild[], i: number, horiz: boolean, shelfT: number, matT: number, autoDouble = false): number {
  if (i >= kids.length - 1) return 0
  if (!horiz) return dividerPanels(kids[i], autoDouble) * matT
  const c = kids[i]
  if (c.separator === 'none') return 0
  if (c.separator === undefined && (isDrawerBaySection(c.section) || isDrawerBaySection(kids[i + 1]?.section))) return 0
  return shelfT
}

// Height an auto-sized bay should take = its drawer/rollout's REAL box height,
// so the open compartments above/below it get the correct remaining space (not a
// hard-coded default). Uses the explicit fitting height, else the chosen slide's
// box_height; falls back to a type default only when the slide is left to
// auto-pick (its height then depends on the opening, which would be circular).
function autoBayHeight(
  section: Section,
  slideProducts: { id: string; box_height?: number | null }[],
): number | null {
  if (section.type !== 'open') return null
  const f = (section.fittings ?? []).find(g => g.type === 'inner_drawer' || g.type === 'pull_out') as
    | { type: string; height?: number; slide_product_id?: string } | undefined
  if (!f) return null
  if (f.height != null && f.height > 0) return f.height
  if (f.slide_product_id) {
    const sp = slideProducts.find(p => p.id === f.slide_product_id)
    if (sp?.box_height != null && sp.box_height > 0) return sp.box_height
  }
  return f.type === 'inner_drawer' ? 150 : 60
}

export function resolveInternalParts(
  cab: CabinetInput,
  r: ConstructionRules,
  // Resolved fronts, for the automatic double divider (z_dividers V-D3).
  zones: ResolvedFaceZone[] = [],
  // fittingFloorY: cabinet Y below which no fitting may sit (the top of a
  // pull-out bin + BINGAP). Absent = the interior floor.
  // openZones: open face cells (z_ubo U2) — with `zones`, gives the face row
  // edges a fixed shelf can sit on (align_face_row).
  opts: { fittingFloorY?: number; openZones?: ResolvedOpenZone[] } = {},
): { parts: ResolvedInternalPart[], slides: ResolvedDrawerSlide[], errors: ResolverError[], autoDouble?: string[] } {
  const parts:  ResolvedInternalPart[] = []
  const slides: ResolvedDrawerSlide[]  = []
  const errors: ResolverError[]        = []

  const edging: Required<EdgingDefaults> = { ...DEFAULT_EDGING, ...(r.EDGING ?? {}) }

  const T   = cab.material.DZ
  const TS  = cab.shelf_material.DZ
  const DX  = cab.DX
  const DY  = cab.DY
  const DZ  = cab.DZ
  const { TK, floorT } = caseFloor(cab, r)   // floorT: bottom panel (0 floating, z_floating)
  const sid = cab.shelf_material.id
  const mid = cab.material.id

  // ── Internal opening reference dimensions ─────────────────────
  const intW = DX - 2 * T - r.SCRL - r.SCRR     // interior width
  const intH = DY - TK - floorT - T - r.SCRT - r.SCRBT   // interior height
  const BT   = caseBackT(cab, r)                // back panel thickness (0 = no back)
  const intD = DZ - r.SCRBK - BT                // interior depth

  // Interior origin (cabinet coordinates)
  const intLeft   = T + r.SCRL        // X of interior left face
  const intBottom = TK + floorT + r.SCRBT  // Y of interior bottom face
  const intBack   = r.SCRBK + BT      // Z of interior back face (back panel inner face)

  if (intW <= 0) {
    errors.push({ code: 'INTERNAL_TOO_NARROW', message: `Internal opening width is ${intW}mm`, part: 'internal' })
    return { parts, slides, errors }
  }
  if (intH <= 0) {
    errors.push({ code: 'INTERNAL_TOO_SHORT', message: `Internal opening height is ${intH}mm`, part: 'internal' })
    return { parts, slides, errors }
  }

  // Depth-related geometry for the structural separators (constant across interior)
  const fsDX  = intD - r.FIXSB_F - r.FIXSB_B   // fixed shelf depth
  const fsZ   = intBack + r.FIXSB_B

  // Per-type sort counters — shared between the separator emitters below and the
  // fitting resolvers (via ctx.sort) for stable downstream naming.
  const sort: Record<string, number> = {
    adj_shelf: 0, fixed_shelf: 0, divider: 0, inner_drawer: 0, pull_out: 0, accessory: 0, rail_support: 0,
  }

  // Context handed to the fitting registry (compartment contents).
  // Face row edges for align_face_row: an open cell in the row gives the row
  // rect exactly; otherwise a front in it (primary front only).
  const faceRowEdge = (row: number, edge: 'bottom' | 'top'): number | undefined => {
    const cell = opts.openZones?.find(z => z.row_index === row)
      ?? zones.find(z => z.row_index === row && !z.facet)
    if (!cell) return undefined
    return edge === 'bottom' ? cell.Y : cell.Y + cell.DY
  }

  const ctx: FittingCtx = {
    r, T, TS, intD, intBack, faceRowEdge,
    shelfMatId:   sid,
    carcMatId:    mid,
    shelfEbId:    cab.shelf_edgeband_id,
    interiorEbId: cab.interior_edgeband_id,
    edging,
    innerDrawerRules:      cab.inner_drawer_box_rules ?? cab.drawer_box_rules ?? DEFAULT_DB_RULES,
    defaultInnerDrawerType: cab.default_inner_drawer_type,
    innerDrawerMat:        cab.inner_drawer_material  ?? cab.drawer_material   ?? cab.material,
    innerDrawerEbId:       cab.inner_drawer_edgeband_id ?? cab.interior_edgeband_id,
    innerDrawerBottomMat:  cab.inner_drawer_bottom_material,
    innerDrawerBottomEbId: cab.inner_drawer_bottom_edgeband_id,
    innerDrawerFrontMat:   cab.inner_drawer_front_material,
    innerDrawerFrontEbId:  cab.inner_drawer_front_edgeband_id,
    slideProducts:    cab.slide_products ?? [],
    accessoryProducts: cab.accessory_products,
    slideSchedule:    cab.slide_schedule ?? [],
    methodRulesById:  cab.drawer_box_method_rules ?? {},
    stackGap:         cab.internal_stack_gap ?? DEFAULT_STACK_GAP,
    sort,
    errors,
    internalSlides: slides,
  }

  // ── Structural separator emitters (split children) ────────────────────────────
  function emitFixedShelf(box: Box, locked: boolean) {
    if (fsDX <= 0) {
      errors.push({ code: 'FIXED_SHELF_DEPTH_INVALID', message: `Fixed shelf depth resolves to ${fsDX}mm`, part: 'fixed_shelf' })
      return
    }
    parts.push({
      part_type:   'fixed_shelf',
      sort_order:  sort.fixed_shelf++,
      DX: fsDX, DY: box.w, DZ: TS,
      X:  box.x, Y: box.y, Z: fsZ,
      AX: 0, AY: 0, AZ: 0,
      material_id: sid,
      edge_band:   edgeSidesToBanding(edging.fixed_shelf, cab.shelf_edgeband_id),
      y_locked:    locked,
    })
  }

  // An adjustable shelf used as a horizontal-split divider (sits on pins). Same
  // role as a fixed shelf but with adj setbacks/insets, emitted as an 'adj_shelf'
  // part so downstream (3D, cut list, drilling) treats it as adjustable.
  function emitAdjShelf(box: Box, locked: boolean) {
    const adjDX = intD - r.ADJSB_F - r.ADJSB_B
    const adjZ  = intBack + r.ADJSB_B
    if (adjDX <= 0) {
      errors.push({ code: 'ADJ_SHELF_DEPTH_INVALID', message: `Adj shelf depth resolves to ${adjDX}mm`, part: 'adj_shelf' })
      return
    }
    const shDY = box.w - r.ADJSL - r.ADJSR
    if (shDY <= 0) {
      errors.push({ code: 'ADJ_SHELF_TOO_NARROW', message: `Adj shelf width resolves to ${shDY}mm`, part: 'adj_shelf' })
      return
    }
    parts.push({
      part_type:   'adj_shelf',
      sort_order:  sort.adj_shelf++,
      DX: adjDX, DY: shDY, DZ: TS,
      X:  box.x + r.ADJSL, Y: box.y, Z: adjZ,
      AX: 0, AY: 0, AZ: 0,
      material_id: sid,
      edge_band:   edgeSidesToBanding(edging.adj_shelf, cab.shelf_edgeband_id),
      y_locked:    locked,
    })
  }

  function emitDivider(box: Box, locked: boolean) {
    parts.push({
      part_type:   'divider',
      sort_order:  sort.divider++,
      DX: intD, DY: box.h, DZ: T,
      X:  box.x, Y: box.y, Z: intBack,
      AX: 0, AY: 0, AZ: 0,
      material_id: mid,
      edge_band:   edgeSidesToBanding(edging.divider, cab.interior_edgeband_id),
      y_locked:    false,
      x_locked:    locked,
    })
  }

  // ── Equalise-group size precomputation ────────────────────────────────────────
  // Two-pass solver: pass 1 walks the tree treating every unlocked child as free
  // flex (no group distinction) and records each group's per-split natural fair
  // share. The group's final size = min of those candidates, so the size always
  // fits in every split the group appears in. Free flex children in larger splits
  // absorb the surplus. Locked children are honoured verbatim.
  // Automatic dividers that stand between drawers side by side resolve double
  // (z_dividers V-D3): found on a first walk, then the tree is walked again.
  const seams = drawerSeams(zones)
  const autoDouble = new Set<string>()
  let groupSizes = computeGroupSizes(cab.internal_tree, intW, intH, TS, T, cab.slide_products ?? [])

  // ── Walk the section tree ─────────────────────────────────────────────────────
  // For a split, the available extent along the split axis is divided among the
  // children: locked sizes honoured, equalise-group members fixed at the group's
  // computed size, the remainder shared equally among free-flex children. A
  // separator part (shelf or divider) is emitted between consecutive children.
  // An open leaf delegates to the fitting registry against its compartment box.
  function walk(section: Section | undefined | null, box: Box, path: number[] = []) {
    // Defensive: a cabinet may carry no internal_tree, or a child may have a
    // missing section (legacy / partial data). Bail rather than throwing — an
    // uncaught error here propagates all the way up and crashes the whole page.
    if (!section || box.w <= 0 || box.h <= 0) return

    if (section.type === 'open') {
      // A bin on the floor (z_bin_cabinet B3): fittings start above it.
      // Separators (dividers, shelves) keep the full box.
      const floor = opts.fittingFloorY
      const fbox = floor != null && floor > box.y
        ? { ...box, y: floor, h: box.y + box.h - floor }
        : box
      if (fbox.h > 0) parts.push(...resolveFittings(fbox, section.fittings ?? [], ctx))
      return
    }

    const horiz = section.type === 'hsplit'
    const total = horiz ? box.h : box.w
    const kids  = section.children ?? []
    const N     = kids.length
    if (N === 0) return

    // Per-separator thickness. Horizontal: each child's separator type ('none'
    // = open gap = 0mm, else a shelf = TS). Vertical: every separator is a
    // divider panel (T).
    const sepThick = (i: number): number => gapThickness(kids, i, horiz, TS, T, autoDouble.has(sepKey(path, i)))
    const sumSep = kids.reduce<number>((a, _c, i) => a + sepThick(i), 0)

    // Classify children: locked (size set), grouped (group id with resolved size),
    // or free flex (everything else). Group members consume their group's size;
    // remainder is divided among free flex children.
    const childResolved: (number | null)[] = kids.map(c => {
      if (c.size !== undefined) return c.size
      if (c.auto_height) {
        const h = autoBayHeight(c.section, cab.slide_products ?? [])
        if (h != null && h > 0) return h
      }
      if (c.equalise_group) {
        const gs = groupSizes.get(c.equalise_group)
        if (gs !== undefined && gs > 0) return gs
      }
      return null
    })
    const avail        = total - sumSep
    const fixedSum     = childResolved.reduce<number>((a, s) => a + (s ?? 0), 0)
    const freeFlexCount = childResolved.filter(s => s === null).length
    const flexSize     = freeFlexCount > 0 ? (avail - fixedSum) / freeFlexCount : 0

    if (avail <= 0 || fixedSum > avail + 0.5 || (freeFlexCount > 0 && flexSize <= 0)) {
      errors.push({
        code:    horiz ? 'TOO_MANY_SHELVES' : 'TOO_MANY_DIVIDERS',
        message: `Internal ${horiz ? 'shelves' : 'dividers'} don't fit in ${Math.round(total)}mm`,
        part:    horiz ? 'fixed_shelf' : 'divider',
      })
      return
    }

    const start = parts.length
    let cursor = horiz ? box.y : box.x
    kids.forEach((c, i) => {
      const size = childResolved[i] ?? flexSize
      const childBox: Box = horiz
        ? { x: box.x, y: cursor, w: box.w, h: size }
        : { x: cursor, y: box.y, w: size, h: box.h }

      walk(c.section, childBox, [...path, i])

      const st = sepThick(i)
      // An automatic divider centred on a drawer seam, over most of the seam's
      // height, is a candidate for double (V-D3).
      if (!horiz && i < N - 1 && c.divider === undefined) {
        const mid = cursor + size + st / 2
        const y0 = box.y, y1 = box.y + box.h
        if (seams.some(s => Math.abs(s.mid - mid) <= AUTO_DOUBLE_TOL
          && Math.min(y1, s.y1) - Math.max(y0, s.y0) >= (s.y1 - s.y0) * 0.5)) autoDouble.add(sepKey(path, i))
      }
      if (i < N - 1 && st > 0) {
        // Group-constrained children are also "locked" from the consumer's
        // perspective — the separator's downstream position is fixed.
        const locked = childResolved[i] !== null
        if (!horiz) {
          // A double divider = two panels back to back, each its own part.
          for (let p = 0; p * T < st - 0.01; p++) {
            emitDivider({ x: cursor + size + p * T, y: box.y, w: T, h: box.h }, locked)
          }
        } else if (c.separator === 'adj_shelf') {
          emitAdjShelf({ x: box.x, y: cursor + size, w: box.w, h: st }, locked)
        } else {
          emitFixedShelf({ x: box.x, y: cursor + size, w: box.w, h: st }, locked)
        }
      }
      cursor += size + st
    })
    // Egg-crate grid (z_dividers V5): merge the pieces, notch the crossings.
    if (section.half_check && halfCheck(parts, start, TS, T)) merged = true
  }

  const root: Box = { x: intLeft, y: intBottom, w: intW, h: intH }
  const startErrors = errors.length
  let merged = false
  walk(cab.internal_tree, root)
  if (autoDouble.size) {
    // Second walk with the doubles in place (thicker separators move the bays).
    parts.length = 0; slides.length = 0; errors.length = startErrors; merged = false
    for (const k of Object.keys(sort)) sort[k] = 0
    groupSizes = computeGroupSizes(cab.internal_tree, intW, intH, TS, T, cab.slide_products ?? [], autoDouble)
    const found = new Set(autoDouble)
    walk(cab.internal_tree, root)
    // Keep exactly the first walk's set (the second can't add new ones mid-walk
    // without moving the layout again).
    autoDouble.clear(); found.forEach(k => autoDouble.add(k))
  }
  // Half-check merges drop pieces: close the gaps in their sort orders.
  if (merged) for (const t of ['divider', 'fixed_shelf'] as const) {
    let n = 0
    for (const p of parts) if (p.part_type === t) p.sort_order = n++
  }

  return { parts, slides, errors, ...(autoDouble.size ? { autoDouble: [...autoDouble] } : {}) }
}

// How far an automatic divider's centre may sit from a drawer seam's centre
// line and still count as standing between the drawers.
const AUTO_DOUBLE_TOL = 30

// ── Half-check crossings (z_dividers V5) ─────────────────────────────────────
// Notch width = the crossing part's thickness + clearance; each notch runs past
// the meeting line by the over-cut so the router's corner radius clears.
export const HALF_CHECK_CLEARANCE = 0.2
export const HALF_CHECK_OVERCUT   = 5

// Merge runs of pieces lying end to end along one line into single parts.
// `line` = the coordinate the pieces share, `lo` / `len` their extent along the
// run; pieces join across gaps up to `maxGap` (the crossing panels between them).
function mergeRuns(ps: ResolvedInternalPart[], line: (p: ResolvedInternalPart) => number,
  lo: 'X' | 'Y', len: 'DY', maxGap: number): ResolvedInternalPart[] {
  const out: ResolvedInternalPart[] = []
  const sorted = ps.slice().sort((a, b) => line(a) - line(b) || a[lo] - b[lo])
  for (const p of sorted) {
    const prev = out[out.length - 1]
    if (prev && Math.abs(line(prev) - line(p)) < 0.05 && p[lo] - (prev[lo] + prev[len]) <= maxGap + 0.05) {
      prev[len] = Math.round((p[lo] + p[len] - prev[lo]) * 1000) / 1000
      prev.x_locked = prev.x_locked || p.x_locked
      prev.y_locked = prev.y_locked || p.y_locked
    } else out.push({ ...p })
  }
  return out
}

/** Half-check the fixed shelves × dividers emitted from parts[start] on: merge
 *  each run of pieces into one full-length part, then notch every crossing on
 *  the outlines — shelves from the back, dividers from the front (V-D6), to the
 *  meeting line + over-cut, the other part's thickness + clearance wide (V-D7).
 *  The parts are flagged `half_check` (no joint drilling, V-D8). Returns true
 *  when pieces were merged (sort orders then need renumbering). */
function halfCheck(parts: ResolvedInternalPart[], start: number, shelfT: number, matT: number): boolean {
  const mine = parts.slice(start)
  const divs = mine.filter(p => p.part_type === 'divider')
  const shelves = mine.filter(p => p.part_type === 'fixed_shelf')
  if (!divs.length || !shelves.length) return false
  const mDivs = mergeRuns(divs, p => p.X, 'Y', 'DY', shelfT)
  const mShelves = mergeRuns(shelves, p => p.Y, 'X', 'DY', 2 * matT)
  const c = HALF_CHECK_CLEARANCE / 2, oc = HALF_CHECK_OVERCUT
  type Notch = { a0: number; a1: number; deep: number }
  const shelfNotches = new Map<ResolvedInternalPart, Notch[]>()
  const divNotches = new Map<ResolvedInternalPart, Notch[]>()
  for (const s of mShelves) for (const d of mDivs) {
    const crosses = d.X > s.X + 0.05 && d.X + d.DZ < s.X + s.DY - 0.05
      && s.Y > d.Y + 0.05 && s.Y + s.DZ < d.Y + d.DY - 0.05
    if (!crosses) continue
    // Meeting line: the middle of the depth both parts share (Z = back edge).
    const z0 = Math.max(s.Z, d.Z), z1 = Math.min(s.Z + s.DX, d.Z + d.DX)
    if (z1 <= z0) continue
    const zm = (z0 + z1) / 2
    // Shelf (horizontal frame: x along its width, y back from the front edge):
    // notch from the back edge forward to zm + over-cut.
    shelfNotches.set(s, [...(shelfNotches.get(s) ?? []), {
      a0: d.X - s.X - c, a1: d.X + d.DZ - s.X + c, deep: s.Z + s.DX - Math.min(zm + oc, s.Z + s.DX),
    }])
    // Divider (side frame: x = depth from its back, y down from its top):
    // notch from the front edge back to zm − over-cut.
    divNotches.set(d, [...(divNotches.get(d) ?? []), {
      a0: d.Y + d.DY - (s.Y + s.DZ) - c, a1: d.Y + d.DY - s.Y + c, deep: Math.max(zm - oc - d.Z, 0),
    }])
  }
  for (const [s, ns] of shelfNotches) {
    const W = s.DY, D = s.DX
    const pts: OutlinePt[] = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: D }]
    for (const n of ns.sort((a, b) => b.a0 - a.a0)) pts.push({ x: n.a1, y: D }, { x: n.a1, y: n.deep }, { x: n.a0, y: n.deep }, { x: n.a0, y: D })
    pts.push({ x: 0, y: D })
    s.outline = pts
  }
  for (const [d, ns] of divNotches) {
    const D = d.DX, H = d.DY
    const pts: OutlinePt[] = [{ x: 0, y: 0 }, { x: D, y: 0 }]
    for (const n of ns.sort((a, b) => a.a0 - b.a0)) pts.push({ x: D, y: n.a0 }, { x: n.deep, y: n.a0 }, { x: n.deep, y: n.a1 }, { x: D, y: n.a1 })
    pts.push({ x: D, y: H }, { x: 0, y: H })
    d.outline = pts
  }
  for (const p of [...mDivs, ...mShelves]) p.half_check = true
  // Swap the pieces for the merged parts, keeping everything else in place.
  const rest = mine.filter(p => p.part_type !== 'divider' && p.part_type !== 'fixed_shelf')
  parts.splice(start, mine.length, ...mDivs, ...mShelves, ...rest)
  return mDivs.length < divs.length || mShelves.length < shelves.length
}

// Pass-1 walker: collect per-split natural fair-share for each group, then take
// the min so the group fits in every split that contains its members. Splits
// where every child is locked contribute nothing (no flex slots to size).
function computeGroupSizes(
  root:   Section | undefined | null,
  rootW:  number,
  rootH:  number,
  shelfT: number,
  matT:   number,
  slideProducts: { id: string; box_height?: number | null }[],
  autoDouble: Set<string> = new Set(),
): Map<string, number> {
  const candidates = new Map<string, number[]>()
  if (!root) return new Map()

  // A child's fixed extent for pass-1 sizing: explicit size, or an auto-height
  // bay's drawer height. Returns null for genuinely free/flex children.
  const fixedOf = (c: SectionChild): number | null =>
    c.size !== undefined ? c.size
    : c.auto_height ? (autoBayHeight(c.section, slideProducts) ?? null)
    : null

  function walk(s: Section | undefined | null, w: number, h: number, path: number[] = []) {
    if (!s || s.type === 'open' || w <= 0 || h <= 0) return
    const horiz = s.type === 'hsplit'
    const total = horiz ? h : w
    const kids  = s.children ?? []
    const N     = kids.length
    if (N === 0) return
    const sumSep = kids.reduce<number>((a, _c, i) => a + gapThickness(kids, i, horiz, shelfT, matT, autoDouble.has(sepKey(path, i))), 0)
    const avail        = total - sumSep
    const lockedSum    = kids.reduce((a, c) => a + (fixedOf(c) ?? 0), 0)
    const unlockedCnt  = kids.filter(c => fixedOf(c) === null).length
    const naturalFlex  = unlockedCnt > 0 ? (avail - lockedSum) / unlockedCnt : 0
    if (naturalFlex > 0) {
      for (const c of kids) {
        if (fixedOf(c) === null && c.equalise_group) {
          const arr = candidates.get(c.equalise_group) ?? []
          arr.push(naturalFlex)
          candidates.set(c.equalise_group, arr)
        }
      }
    }
    // Recurse with the naive (pass-1) child box so nested groups see the right
    // parent extent. For hsplit parents the child's height = size, width = w;
    // for vsplit parents width = size, height = h.
    kids.forEach((c, i) => {
      const size = fixedOf(c) ?? Math.max(0, naturalFlex)
      if (horiz) walk(c.section, w,    size, [...path, i])
      else       walk(c.section, size, h,    [...path, i])
    })
  }

  walk(root, rootW, rootH)

  const out = new Map<string, number>()
  for (const [g, arr] of candidates) {
    if (arr.length === 0) continue
    out.set(g, Math.min(...arr))
  }
  return out
}
