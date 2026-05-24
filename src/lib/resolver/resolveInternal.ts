// ============================================================
// Internal Module Resolver
// Resolves adjustable shelves, fixed shelves, inner drawers, dividers
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

  // ── Internal opening reference dimensions ─────────────────────
  const intW = DX - 2 * T - r.SCRL - r.SCRR   // interior width
  const intH = DY - TK - 2 * T - r.SCRT - r.SCRBT   // interior height
  const intD = DZ - r.SCRBK - T   // interior depth

  // Interior origin (cabinet coordinates)
  const intLeft  = T + r.SCRL       // X of interior left face
  const intBottom = TK + T + r.SCRBT // Y of interior bottom face
  const intBack   = r.SCRBK + T     // Z of interior back face (back panel inner face)

  if (intW <= 0) {
    errors.push({ code: 'INTERNAL_TOO_NARROW', message: `Internal opening width is ${intW}mm`, part: 'internal' })
    return { parts, errors }
  }
  if (intH <= 0) {
    errors.push({ code: 'INTERNAL_TOO_SHORT', message: `Internal opening height is ${intH}mm`, part: 'internal' })
    return { parts, errors }
  }

  // ── Step 1: Resolve vertical dividers ────────────────────────────────────────
  // Dividers are resolved FIRST so their X positions can be used to split shelves.
  //
  // Equal opening formula:
  //   openW = (intW - ND × T) / (ND + 1)
  //   divider i left face X = intLeft + (i+1) × openW + i × T
  //
  // This gives ND+1 equal-width openings, each openW wide.

  const dividerInputs = (cab.dividers ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)
  const ND = dividerInputs.length

  // Resolved divider left-face X positions (cabinet X), in order
  const divXList: number[] = []

  if (ND > 0) {
    const openW = (intW - ND * T) / (ND + 1)

    if (openW <= 0) {
      errors.push({
        code:    'TOO_MANY_DIVIDERS',
        message: `${ND} dividers exceed available interior width (${intW}mm). Need at least ${ND * T + (ND + 1)}mm.`,
        part:    'divider',
      })
    } else {
      for (let i = 0; i < ND; i++) {
        const div = dividerInputs[i]
        const divX = (div.x_locked && div.x_position !== undefined)
          ? intLeft + div.x_position
          : intLeft + (i + 1) * openW + i * T

        divXList.push(divX)

        parts.push({
          part_type:   'divider',
          sort_order:  div.sort_order,
          DX: intD,
          DY: intH,
          DZ: T,
          X:  divX,
          Y:  intBottom,
          Z:  intBack,
          AX: 0, AY: 0, AZ: 0,
          material_id: mid,
          edge_band:   edgeSidesToBanding(edging.divider ?? ['top', 'left', 'right'], cab.interior_edgeband_id),
          y_locked:    false,
          x_locked:    div.x_locked,
        })
      }
    }
  }

  // ── Step 2: Column boundaries ─────────────────────────────────────────────────
  // Each column is an open span in X between case sides / dividers.
  // col.xLeft  = cabinet X of the left bound (right face of left panel or divider)
  // col.xRight = cabinet X of the right bound (left face of right panel or next divider)

  const columns: { xLeft: number; xRight: number }[] = []
  {
    const intRight = DX - T - r.SCRR
    let cursor = intLeft
    for (const dx of divXList) {
      if (dx > cursor + 1) columns.push({ xLeft: cursor, xRight: dx })
      cursor = dx + T
    }
    if (intRight > cursor + 1) columns.push({ xLeft: cursor, xRight: intRight })
    // Fallback: if no dividers OR all dividers out of range, one full-width column
    if (columns.length === 0) columns.push({ xLeft: intLeft, xRight: DX - T - r.SCRR })
  }

  // ── Step 3: Adjustable shelves (per column) ───────────────────────────────────
  // Equal-opening formula (mirrors divider approach, but in Y):
  //   openH = (intH - N × TS) / (N + 1)
  //   shelf i bottom Y = intBottom + (i+1) × openH + i × TS
  //
  // Adj shelves are narrowed by pin clearances on each side and per-column.
  const N = cab.adj_shelves.length
  if (N > 0) {
    const shDX  = intD - r.ADJSB_F - r.ADJSB_B
    const shZ   = intBack + r.ADJSB_B
    const openH = (intH - N * TS) / (N + 1)

    if (shDX <= 0) {
      errors.push({ code: 'ADJ_SHELF_DEPTH_INVALID', message: `Adj shelf depth resolves to ${shDX}mm`, part: 'adj_shelf' })
    } else if (openH <= 0) {
      errors.push({ code: 'TOO_MANY_ADJ_SHELVES', message: `${N} adj shelves exceed available interior height (${intH}mm)`, part: 'adj_shelf' })
    } else {
      for (let i = 0; i < N; i++) {
        const shelf = cab.adj_shelves[i]

        const shY = (shelf.y_locked && shelf.y_position !== undefined)
          ? shelf.y_position
          : intBottom + (i + 1) * openH + i * TS

        for (const col of columns) {
          const shDY = col.xRight - col.xLeft - r.ADJSL - r.ADJSR
          if (shDY <= 0) continue

          parts.push({
            part_type:   'adj_shelf',
            sort_order:  shelf.sort_order,
            DX: shDX,
            DY: shDY,
            DZ: TS,
            X:  col.xLeft + r.ADJSL,
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
  }

  // ── Step 4: Fixed shelves (per column) ───────────────────────────────────────
  // Fixed shelves span the full column width (no pin clearance).
  // Y default: centred in the interior height.
  for (const shelf of cab.fixed_shelves) {
    const fsDX = intD - r.FIXSB_F - r.FIXSB_B
    const fsZ  = intBack + r.FIXSB_B
    const fsY  = (shelf.y_locked && shelf.y_position !== undefined)
      ? shelf.y_position
      : intBottom + (intH - TS) / 2

    if (fsDX <= 0) {
      errors.push({ code: 'FIXED_SHELF_DEPTH_INVALID', message: `Fixed shelf depth resolves to ${fsDX}mm`, part: 'fixed_shelf' })
      continue
    }

    for (const col of columns) {
      const fsDY = col.xRight - col.xLeft
      if (fsDY <= 0) continue

      parts.push({
        part_type:   'fixed_shelf',
        sort_order:  shelf.sort_order,
        DX: fsDX,
        DY: fsDY,
        DZ: TS,
        X:  col.xLeft,
        Y:  fsY,
        Z:  fsZ,
        AX: 0, AY: 0, AZ: 0,
        material_id: sid,
        edge_band:   edgeSidesToBanding(edging.fixed_shelf, cab.shelf_edgeband_id),
        y_locked:    shelf.y_locked,
      })
    }
  }

  // ── Step 5: Inner drawers ─────────────────────────────────────────────────────
  // Inner drawers are always whole-column (they span a face zone column).
  // Column splitting from dividers does not apply here — each drawer maps to
  // a specific face zone that already defines the column it lives in.
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
