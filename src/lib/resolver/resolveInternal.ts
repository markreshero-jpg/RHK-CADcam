// ============================================================
// Internal Module Resolver
// Walks the recursive section tree, emitting:
//   • fixed shelves  — separators of a horizontal split (hsplit)
//   • dividers       — separators of a vertical split (vsplit)
//   • adjustable shelves — movable contents of an open compartment
// Inner drawers are face-zone driven and resolved separately (Step 2).
// ============================================================

import {
  CabinetInput, ResolvedInternalPart, ConstructionRules,
  ResolverError, Section, OpenSection, ResolvedFaceZone,
  edgeSidesToBanding, DEFAULT_EDGING, EdgingDefaults
} from './types'

// Axis-aligned region in cabinet coordinates (x = left, y = bottom).
interface Box { x: number; y: number; w: number; h: number }

export function resolveInternalParts(
  cab: CabinetInput,
  r: ConstructionRules,
  resolvedFaceZones: ResolvedFaceZone[]
): { parts: ResolvedInternalPart[], errors: ResolverError[] } {
  const parts:  ResolvedInternalPart[] = []
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
    return { parts, errors }
  }
  if (intH <= 0) {
    errors.push({ code: 'INTERNAL_TOO_SHORT', message: `Internal opening height is ${intH}mm`, part: 'internal' })
    return { parts, errors }
  }

  // Depth-related geometry (constant across the interior)
  const fsDX  = intD - r.FIXSB_F - r.FIXSB_B   // fixed shelf depth
  const fsZ   = intBack + r.FIXSB_B
  const adjDX = intD - r.ADJSB_F - r.ADJSB_B   // adj shelf depth
  const adjZ  = intBack + r.ADJSB_B

  // Per-type sort counters for stable downstream naming
  const sort = { adj_shelf: 0, fixed_shelf: 0, divider: 0 }

  // ── Emitters ───────────────────────────────────────────────────────────────
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

  function emitAdjShelves(box: Box, section: OpenSection) {
    const n = section.adj_shelves.length
    if (n === 0) return
    if (adjDX <= 0) {
      errors.push({ code: 'ADJ_SHELF_DEPTH_INVALID', message: `Adj shelf depth resolves to ${adjDX}mm`, part: 'adj_shelf' })
      return
    }
    const shDY = box.w - r.ADJSL - r.ADJSR
    if (shDY <= 0) {
      errors.push({ code: 'ADJ_SHELF_TOO_NARROW', message: `Adj shelf width resolves to ${shDY}mm`, part: 'adj_shelf' })
      return
    }
    const openH = (box.h - n * TS) / (n + 1)
    if (openH <= 0) {
      errors.push({ code: 'TOO_MANY_ADJ_SHELVES', message: `${n} adj shelves exceed available height (${Math.round(box.h)}mm)`, part: 'adj_shelf' })
      return
    }
    section.adj_shelves.forEach((s, i) => {
      const shY = (s.y_locked && s.y_position !== undefined)
        ? s.y_position
        : box.y + (i + 1) * openH + i * TS
      parts.push({
        part_type:   'adj_shelf',
        sort_order:  sort.adj_shelf++,
        DX: adjDX, DY: shDY, DZ: TS,
        X:  box.x + r.ADJSL, Y: shY, Z: adjZ,
        AX: 0, AY: 0, AZ: 0,
        material_id: sid,
        edge_band:   edgeSidesToBanding(edging.adj_shelf, cab.shelf_edgeband_id),
        y_locked:    s.y_locked,
      })
    })
  }

  // ── Step 1: Walk the section tree ────────────────────────────────────────────
  // For a split, the available extent along the split axis is divided among the
  // children (locked sizes honoured, the remainder shared equally), with a
  // separator part (shelf or divider) emitted between consecutive children.
  function walk(section: Section, box: Box) {
    if (box.w <= 0 || box.h <= 0) return

    if (section.type === 'open') {
      emitAdjShelves(box, section)
      return
    }

    const horiz = section.type === 'hsplit'
    const sepT  = horiz ? TS : T
    const total = horiz ? box.h : box.w
    const kids  = section.children
    const N     = kids.length
    if (N === 0) return

    const avail     = total - (N - 1) * sepT
    const lockedSum = kids.reduce((a, c) => a + (c.size ?? 0), 0)
    const flexCount = kids.filter(c => c.size === undefined).length
    const flexSize  = flexCount > 0 ? (avail - lockedSum) / flexCount : 0

    if (avail <= 0 || (flexCount > 0 && flexSize <= 0)) {
      errors.push({
        code:    horiz ? 'TOO_MANY_SHELVES' : 'TOO_MANY_DIVIDERS',
        message: `Internal ${horiz ? 'shelves' : 'dividers'} don't fit in ${Math.round(total)}mm`,
        part:    horiz ? 'fixed_shelf' : 'divider',
      })
      return
    }

    let cursor = horiz ? box.y : box.x
    kids.forEach((c, i) => {
      const size = c.size ?? flexSize
      const childBox: Box = horiz
        ? { x: box.x, y: cursor, w: box.w, h: size }
        : { x: cursor, y: box.y, w: size, h: box.h }

      walk(c.section, childBox)

      if (i < N - 1) {
        const locked = c.size !== undefined
        if (horiz) emitFixedShelf({ x: box.x, y: cursor + size, w: box.w, h: sepT }, locked)
        else       emitDivider   ({ x: cursor + size, y: box.y, w: sepT, h: box.h }, locked)
      }
      cursor += size + (i < N - 1 ? sepT : 0)
    })
  }

  walk(cab.internal_tree, { x: intLeft, y: intBottom, w: intW, h: intH })

  // ── Step 2: Inner drawers ─────────────────────────────────────────────────────
  // Inner drawers map to a specific face zone column — column splitting from the
  // section tree does not apply here.
  for (const drawer of cab.inner_drawers) {
    const runnerDepth = drawer.runner_depth ?? (intD - r.SLIDE_SETBACK)

    if (runnerDepth > intD) {
      errors.push({
        code:    'RUNNER_TOO_DEEP',
        message: `Runner depth ${runnerDepth}mm exceeds cabinet internal depth ${intD}mm`,
        part:    'inner_drawer',
      })
      continue
    }

    const faceZone = resolvedFaceZones.find(
      z => z.row_index === drawer.face_zone_row && z.col_index === drawer.face_zone_col
    )
    const yStart = faceZone
      ? faceZone.Y + 10
      : intBottom + 10

    const slideDed = cab.slide_side_deduction
    const idDY     = intW - 2 * slideDed - r.IDCL - r.IDCR
    const idX      = intLeft + slideDed

    if (idDY <= 0) {
      errors.push({
        code:    'INNER_DRAWER_TOO_NARROW',
        message: `Inner drawer width resolves to ${idDY}mm after slide deductions`,
        part:    'inner_drawer',
      })
      continue
    }

    // Drawer bottom
    parts.push({
      part_type:   'inner_drawer_bottom',
      sort_order:  drawer.sort_order,
      DX: runnerDepth,
      DY: idDY,
      DZ: T,
      X:  idX,
      Y:  yStart,
      Z:  intBack,
      AX: 0, AY: 0, AZ: 0,
      material_id: mid,
      edge_band:   edgeSidesToBanding(edging.inner_drawer_bottom, cab.interior_edgeband_id),
      y_locked:    false,
    })

    // Drawer back
    const backH = 100 - T   // placeholder — drawer box builder will set
    parts.push({
      part_type:   'inner_drawer_back',
      sort_order:  drawer.sort_order,
      DX: backH,
      DY: idDY,
      DZ: T,
      X:  idX,
      Y:  yStart,
      Z:  intBack + runnerDepth - T,
      AX: 0, AY: 0, AZ: 0,
      material_id: mid,
      edge_band:   edgeSidesToBanding(edging.inner_drawer_back, cab.interior_edgeband_id),
      y_locked:    false,
    })
  }

  return { parts, errors }
}
