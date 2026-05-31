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
  ResolverError, Section,
  edgeSidesToBanding, DEFAULT_EDGING, EdgingDefaults, DEFAULT_DB_RULES,
} from './types'
import { Box, FittingCtx, resolveFittings, DEFAULT_STACK_GAP } from './fittings'

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
  const groupSizes = computeGroupSizes(cab.internal_tree, intW, intH, TS, T)

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
    const sepT  = horiz ? TS : T
    const total = horiz ? box.h : box.w
    const kids  = section.children ?? []
    const N     = kids.length
    if (N === 0) return

    // Classify children: locked (size set), grouped (group id with resolved size),
    // or free flex (everything else). Group members consume their group's size;
    // remainder is divided among free flex children.
    const childResolved: (number | null)[] = kids.map(c => {
      if (c.size !== undefined) return c.size
      if (c.equalise_group) {
        const gs = groupSizes.get(c.equalise_group)
        if (gs !== undefined && gs > 0) return gs
      }
      return null
    })
    const avail        = total - (N - 1) * sepT
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

      if (i < N - 1) {
        // Group-constrained children are also "locked" from the consumer's
        // perspective — the separator's downstream position is fixed.
        const locked = childResolved[i] !== null
        if (horiz) emitFixedShelf({ x: box.x, y: cursor + size, w: box.w, h: sepT }, locked)
        else       emitDivider   ({ x: cursor + size, y: box.y, w: sepT, h: box.h }, locked)
      }
      cursor += size + (i < N - 1 ? sepT : 0)
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
): Map<string, number> {
  const candidates = new Map<string, number[]>()
  if (!root) return new Map()

  function walk(s: Section | undefined | null, w: number, h: number) {
    if (!s || s.type === 'open' || w <= 0 || h <= 0) return
    const horiz = s.type === 'hsplit'
    const sepT  = horiz ? shelfT : matT
    const total = horiz ? h : w
    const kids  = s.children ?? []
    const N     = kids.length
    if (N === 0) return
    const avail        = total - (N - 1) * sepT
    const lockedSum    = kids.reduce((a, c) => a + (c.size ?? 0), 0)
    const unlockedCnt  = kids.filter(c => c.size === undefined).length
    const naturalFlex  = unlockedCnt > 0 ? (avail - lockedSum) / unlockedCnt : 0
    if (naturalFlex > 0) {
      for (const c of kids) {
        if (c.size === undefined && c.equalise_group) {
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
      const size = c.size ?? Math.max(0, naturalFlex)
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
