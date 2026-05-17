// ============================================================
// Internal Module Resolver
// Resolves adjustable shelves, fixed shelves, inner drawers
// ============================================================

import {
  CabinetInput, ResolvedInternalPart, ConstructionRules,
  ResolverError, AdjShelfInput, FixedShelfInput,
  InnerDrawerInput, ResolvedFaceZone,
  edgeSidesToBanding, DEFAULT_EDGING, EdgingDefaults
} from './types'

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
  const TK  = r.TOEH
  const sid = cab.shelf_material.id
  const mid = cab.material.id

  // ── Internal Opening Reference Dimensions ─────────────────────
  // Width: less sides and scribes
  const intW = DX - 2 * T - r.SCRL - r.SCRR
  // Height: to underside of top rail (2 × material thickness — bottom + top/rail)
  const intH = DY - TK - 2 * T
  // Depth: less back panel and scribe
  const intD = DZ - r.SCRBK - T

  if (intW <= 0) {
    errors.push({ code: 'INTERNAL_TOO_NARROW', message: `Internal opening width is ${intW}mm`, part: 'internal' })
    return { parts, errors }
  }
  if (intH <= 0) {
    errors.push({ code: 'INTERNAL_TOO_SHORT', message: `Internal opening height is ${intH}mm`, part: 'internal' })
    return { parts, errors }
  }

  // ── Adjustable Shelves ────────────────────────────────────────
  const N = cab.adj_shelves.length
  if (N > 0) {
    const shDX = intD - (r.ADJSB_F + r.ADJSB_B)
    const shDY = intW - r.ADJSL - r.ADJSR
    const shX  = T + r.SCRL + r.ADJSL
    const shZ  = r.SCRBK + T + r.ADJSB_B

    if (shDX <= 0) {
      errors.push({ code: 'ADJ_SHELF_DEPTH_INVALID', message: `Adj shelf depth resolves to ${shDX}mm`, part: 'adj_shelf' })
    } else {
      for (let i = 0; i < N; i++) {
        const shelf = cab.adj_shelves[i]

        // Y position: equalised by default, locked if manually set
        let shY: number
        if (shelf.y_locked && shelf.y_position !== undefined) {
          shY = shelf.y_position
        } else {
          // Equalise: split intH into N+1 equal openings
          // Shelf sits at bottom of the i-th opening
          const openingH = intH / (N + 1)
          shY = TK + T + openingH * (i + 1) - (i + 1) * TS / 2
        }

        parts.push({
          part_type:   'adj_shelf',
          sort_order:  shelf.sort_order,
          DX: shDX,
          DY: shDY,
          DZ: TS,
          X:  shX,
          Y:  shY,
          Z:  shZ,
          AX: 0, AY: 0, AZ: 0,
          material_id: sid,
          edge_band:   edgeSidesToBanding(edging.adj_shelf, cab.shelf_edgeband_id),
          y_locked:    shelf.y_locked,
        })
      }
    }
  }

  // ── Fixed Shelves ─────────────────────────────────────────────
  for (const shelf of cab.fixed_shelves) {
    const fsDX = intD - (r.FIXSB_F + r.FIXSB_B)
    const fsDY = intW   // full internal width — no pin clearance
    const fsX  = T      // referenced from left side inner face
    const fsZ  = r.SCRBK + T + r.FIXSB_B

    // Y: default mid internal height, overridable
    const fsY = shelf.y_locked && shelf.y_position !== undefined
      ? shelf.y_position
      : TK + T + intH / 2 - TS / 2

    if (fsDX <= 0) {
      errors.push({ code: 'FIXED_SHELF_DEPTH_INVALID', message: `Fixed shelf depth resolves to ${fsDX}mm`, part: 'fixed_shelf' })
      continue
    }

    parts.push({
      part_type:   'fixed_shelf',
      sort_order:  shelf.sort_order,
      DX: fsDX,
      DY: fsDY,
      DZ: TS,
      X:  fsX,
      Y:  fsY,
      Z:  fsZ,
      AX: 0, AY: 0, AZ: 0,
      material_id: sid,
      edge_band:   edgeSidesToBanding(edging.fixed_shelf, cab.shelf_edgeband_id),
      y_locked:    shelf.y_locked,
    })
  }

  // ── Inner Drawers ─────────────────────────────────────────────
  for (const drawer of cab.inner_drawers) {
    const runnerDepth = drawer.runner_depth ?? r.IDRUN

    // Validate runner depth against cabinet internal depth
    if (runnerDepth > intD) {
      errors.push({
        code: 'RUNNER_TOO_DEEP',
        message: `Runner depth ${runnerDepth}mm exceeds cabinet internal depth ${intD}mm`,
        part: 'inner_drawer',
      })
      continue
    }

    // Find the corresponding face zone to get Y position
    const faceZone = resolvedFaceZones.find(
      z => z.row_index === drawer.face_zone_row &&
           z.col_index === drawer.face_zone_col
    )

    // Y start: bottom of the face zone, plus 10mm placeholder offset
    // (will be driven by drawer box builder when defined)
    const yStart = faceZone
      ? faceZone.Y + 10
      : TK + T + 10   // fallback if no face zone

    const slideDed  = cab.slide_side_deduction
    const idDY      = intW - 2 * slideDed - r.IDCL - r.IDCR
    const idX       = T + r.SCRL + slideDed

    if (idDY <= 0) {
      errors.push({
        code: 'INNER_DRAWER_TOO_NARROW',
        message: `Inner drawer width resolves to ${idDY}mm after slide deductions`,
        part: 'inner_drawer',
      })
      continue
    }

    // Inner Drawer Bottom
    parts.push({
      part_type:   'inner_drawer_bottom',
      sort_order:  drawer.sort_order,
      DX: runnerDepth,
      DY: idDY,
      DZ: T,
      X:  idX,
      Y:  yStart,
      Z:  r.SCRBK + T,    // flush with back panel inner face
      AX: 0, AY: 0, AZ: 0,
      material_id: mid,   // drawer box material (will be from drawerbox schedule)
      edge_band:   edgeSidesToBanding(edging.inner_drawer_bottom, cab.interior_edgeband_id),
      y_locked:    false,
    })

    // Inner Drawer Back
    // Z sits at back of runner depth, less its own thickness
    const backH = 100 - T   // placeholder height — drawer box builder will set
    parts.push({
      part_type:   'inner_drawer_back',
      sort_order:  drawer.sort_order,
      DX: backH,
      DY: idDY,
      DZ: T,
      X:  idX,
      Y:  yStart,
      Z:  r.SCRBK + T + runnerDepth - T,
      AX: 0, AY: 0, AZ: 0,
      material_id: mid,
      edge_band:   edgeSidesToBanding(edging.inner_drawer_back, cab.interior_edgeband_id),
      y_locked:    false,
    })
  }

  return { parts, errors }
}
