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
  CabinetInput, ResolvedInternalPart, ResolvedDrawerSlide, ConstructionRules,
  ResolverError, Section, SectionChild,
  edgeSidesToBanding, DEFAULT_EDGING, EdgingDefaults, DEFAULT_DB_RULES,
} from './types'
import { Box, FittingCtx, resolveFittings, DEFAULT_STACK_GAP } from './fittings'

// A drawer/rollout bay = an open compartment holding a drawer or rollout. Such a
// bay should have OPEN gaps around it (no shelves), so we detect it to self-heal
// data where the 'none' separator was dropped.
function isDrawerBaySection(section: Section | undefined | null): boolean {
  return !!section && section.type === 'open'
    && (section.fittings ?? []).some(f => f.type === 'inner_drawer' || f.type === 'pull_out')
}

// Thickness consumed by the divider between child i and i+1 of a split. Vertical
// splits = a divider panel (matT). Horizontal splits = a shelf (shelfT) UNLESS
// the gap is 'none' (explicit open gap) or borders a drawer/rollout bay with no
// explicit separator set (open gap, inferred — keeps drawers shelf-free even if
// the separator field was lost in old data).
function gapThickness(kids: SectionChild[], i: number, horiz: boolean, shelfT: number, matT: number): number {
  if (i >= kids.length - 1) return 0
  if (!horiz) return matT
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
): { parts: ResolvedInternalPart[], slides: ResolvedDrawerSlide[], errors: ResolverError[] } {
  const parts:  ResolvedInternalPart[] = []
  const slides: ResolvedDrawerSlide[]  = []
  const errors: ResolverError[]        = []

  const edging: Required<EdgingDefaults> = { ...DEFAULT_EDGING, ...(r.EDGING ?? {}) }

  const T   = cab.material.DZ
  const TS  = cab.shelf_material.DZ
  const DX  = cab.DX
  const DY  = cab.DY
  const DZ  = cab.DZ
  const TK  = cab.has_toekick ? r.TOEH : 0
  const sid = cab.shelf_material.id
  const mid = cab.material.id

  // ── Internal opening reference dimensions ─────────────────────
  const intW = DX - 2 * T - r.SCRL - r.SCRR     // interior width
  const intH = DY - TK - 2 * T - r.SCRT - r.SCRBT   // interior height
  const intD = DZ - r.SCRBK - T                 // interior depth

  // Interior origin (cabinet coordinates)
  const intLeft   = T + r.SCRL        // X of interior left face
  const intBottom = TK + T + r.SCRBT  // Y of interior bottom face
  const intBack   = r.SCRBK + T       // Z of interior back face (back panel inner face)

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
    adj_shelf: 0, fixed_shelf: 0, divider: 0, inner_drawer: 0, pull_out: 0, accessory: 0,
  }

  // Context handed to the fitting registry (compartment contents).
  const ctx: FittingCtx = {
    r, T, TS, intD, intBack,
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
  const groupSizes = computeGroupSizes(cab.internal_tree, intW, intH, TS, T, cab.slide_products ?? [])

  // ── Walk the section tree ─────────────────────────────────────────────────────
  // For a split, the available extent along the split axis is divided among the
  // children: locked sizes honoured, equalise-group members fixed at the group's
  // computed size, the remainder shared equally among free-flex children. A
  // separator part (shelf or divider) is emitted between consecutive children.
  // An open leaf delegates to the fitting registry against its compartment box.
  function walk(section: Section | undefined | null, box: Box) {
    // Defensive: a cabinet may carry no internal_tree, or a child may have a
    // missing section (legacy / partial data). Bail rather than throwing — an
    // uncaught error here propagates all the way up and crashes the whole page.
    if (!section || box.w <= 0 || box.h <= 0) return

    if (section.type === 'open') {
      parts.push(...resolveFittings(box, section.fittings ?? [], ctx))
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
    const sepThick = (i: number): number => gapThickness(kids, i, horiz, TS, T)
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

    let cursor = horiz ? box.y : box.x
    kids.forEach((c, i) => {
      const size = childResolved[i] ?? flexSize
      const childBox: Box = horiz
        ? { x: box.x, y: cursor, w: box.w, h: size }
        : { x: cursor, y: box.y, w: size, h: box.h }

      walk(c.section, childBox)

      const st = sepThick(i)
      if (i < N - 1 && st > 0) {
        // Group-constrained children are also "locked" from the consumer's
        // perspective — the separator's downstream position is fixed.
        const locked = childResolved[i] !== null
        if (!horiz) {
          emitDivider({ x: cursor + size, y: box.y, w: st, h: box.h }, locked)
        } else if (c.separator === 'adj_shelf') {
          emitAdjShelf({ x: box.x, y: cursor + size, w: box.w, h: st }, locked)
        } else {
          emitFixedShelf({ x: box.x, y: cursor + size, w: box.w, h: st }, locked)
        }
      }
      cursor += size + st
    })
  }

  walk(cab.internal_tree, { x: intLeft, y: intBottom, w: intW, h: intH })

  return { parts, slides, errors }
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
): Map<string, number> {
  const candidates = new Map<string, number[]>()
  if (!root) return new Map()

  // A child's fixed extent for pass-1 sizing: explicit size, or an auto-height
  // bay's drawer height. Returns null for genuinely free/flex children.
  const fixedOf = (c: SectionChild): number | null =>
    c.size !== undefined ? c.size
    : c.auto_height ? (autoBayHeight(c.section, slideProducts) ?? null)
    : null

  function walk(s: Section | undefined | null, w: number, h: number) {
    if (!s || s.type === 'open' || w <= 0 || h <= 0) return
    const horiz = s.type === 'hsplit'
    const total = horiz ? h : w
    const kids  = s.children ?? []
    const N     = kids.length
    if (N === 0) return
    const sumSep = kids.reduce<number>((a, _c, i) => a + gapThickness(kids, i, horiz, shelfT, matT), 0)
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
    kids.forEach(c => {
      const size = fixedOf(c) ?? Math.max(0, naturalFlex)
      if (horiz) walk(c.section, w,    size)
      else       walk(c.section, size, h   )
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
