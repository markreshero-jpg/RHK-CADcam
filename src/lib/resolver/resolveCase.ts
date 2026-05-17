// ============================================================
// Case Module Resolver
// Resolves all carcass parts for a cabinet instance
// ============================================================

import {
  CabinetInput, ResolvedCasePart, ConstructionRules,
  ResolverError, edgeSidesToBanding, DEFAULT_EDGING, EdgingDefaults
} from './types'

export function resolveCaseParts(
  cab: CabinetInput,
  r: ConstructionRules
): { parts: ResolvedCasePart[], errors: ResolverError[] } {
  const parts: ResolvedCasePart[] = []
  const errors: ResolverError[] = []

  const edging: Required<EdgingDefaults> = { ...DEFAULT_EDGING, ...(r.EDGING ?? {}) }
  const ebId = cab.interior_edgeband_id

  const T  = cab.material.DZ    // material thickness
  const DX = cab.DX             // cabinet width
  const DY = cab.DY             // cabinet height
  const DZ = cab.DZ             // cabinet depth
  const TK = r.TOEH             // toe kick height
  const mid = cab.material.id

  // Validate minimum sizes
  if (DX <= 2 * T) {
    errors.push({ code: 'CASE_TOO_NARROW', message: `Cabinet DX (${DX}mm) is too narrow for material thickness (${T}mm)`, part: 'case' })
    return { parts, errors }
  }

  // ── Left Side ────────────────────────────────────────────────
  // DX = Cabinet.DZ (cabinet depth becomes panel width on sheet)
  // DY = Cabinet.DY - TOEH (height less toe kick)
  // DZ = @material.DZ
  parts.push({
    part_key: 'left_side',
    DX: DZ,
    DY: DY - TK,
    DZ: T,
    X:  0,
    Y:  TK,
    Z:  0,
    AX: 0, AY: 0, AZ: 0,
    material_id: mid,
    edge_band: edgeSidesToBanding(edging.left_side, ebId),
  })

  // ── Right Side ───────────────────────────────────────────────
  parts.push({
    part_key: 'right_side',
    DX: DZ,
    DY: DY - TK,
    DZ: T,
    X:  DX - T,
    Y:  TK,
    Z:  0,
    AX: 0, AY: 0, AZ: 0,
    material_id: mid,
    edge_band: edgeSidesToBanding(edging.right_side, ebId),
  })

  // ── Bottom Panel ─────────────────────────────────────────────
  // Sits between the two sides
  parts.push({
    part_key: 'bottom',
    DX: DZ,
    DY: DX - 2 * T,
    DZ: T,
    X:  T,
    Y:  TK,
    Z:  0,
    AX: 0, AY: 0, AZ: 0,
    material_id: mid,
    edge_band: edgeSidesToBanding(edging.bottom, ebId),
  })

  // ── Back Panel ───────────────────────────────────────────────
  // Butt jointed, full height, sits between sides
  // Z = SCRBK (offset from back by scribe)
  parts.push({
    part_key: 'back',
    DX: DZ - r.SCRBK,
    DY: DX - 2 * T,
    DZ: T,
    X:  T,
    Y:  TK,
    Z:  r.SCRBK,
    AX: 0, AY: 0, AZ: 0,
    material_id: mid,
    edge_band: edgeSidesToBanding(edging.back, ebId),
  })

  // ── Top Options ───────────────────────────────────────────────
  const topType = cab.top_type ?? r.TOP_TYPE

  if (topType === 'full_top') {
    // Full top: between sides, inset from back
    parts.push({
      part_key: 'full_top',
      DX: DZ - T - r.SCRBK,
      DY: DX - 2 * T,
      DZ: T,
      X:  T,
      Y:  DY - T,
      Z:  T + r.SCRBK,
      AX: 0, AY: 0, AZ: 0,
      material_id: mid,
      edge_band: edgeSidesToBanding(edging.full_top, ebId),
    })

  } else if (topType === 'front_rail') {
    // Front rail only — RD deep, flush with cabinet front
    if (r.RD <= 0) {
      errors.push({ code: 'INVALID_RAIL_DEPTH', message: 'RD must be > 0 for front_rail top type', part: 'front_rail' })
    } else {
      parts.push({
        part_key: 'front_rail',
        DX: r.RD,
        DY: DX - 2 * T,
        DZ: T,
        X:  T,
        Y:  DY - T,
        Z:  DZ - r.RD,
        AX: 0, AY: 0, AZ: 0,
        material_id: mid,
        edge_band: edgeSidesToBanding(edging.front_rail, ebId),
      })
    }

  } else if (topType === 'double_rail') {
    // Front rail
    parts.push({
      part_key: 'front_rail',
      DX: r.RD,
      DY: DX - 2 * T,
      DZ: T,
      X:  T,
      Y:  DY - T,
      Z:  DZ - r.RD,
      AX: 0, AY: 0, AZ: 0,
      material_id: mid,
      edge_band: edgeSidesToBanding(edging.front_rail, ebId),
    })
    // Back rail — aligns with back panel front face
    parts.push({
      part_key: 'back_rail',
      DX: r.RD,
      DY: DX - 2 * T,
      DZ: T,
      X:  T,
      Y:  DY - T,
      Z:  T + r.SCRBK,
      AX: 0, AY: 0, AZ: 0,
      material_id: mid,
      edge_band: edgeSidesToBanding(edging.back_rail, ebId),
    })
  }
  // TOP_TYPE 'none' → no top parts added

  return { parts, errors }
}
