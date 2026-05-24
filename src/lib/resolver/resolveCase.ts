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

  // ── Per-part material references ─────────────────────────────
  // All case parts currently use the primary carcass material.
  // Individual part-level overrides wire in here when supported.
  const sideMat   = cab.material
  const bottomMat = cab.material
  const backMat   = cab.material
  const topMat    = cab.material

  const sideT   = sideMat.DZ
  const bottomT = bottomMat.DZ
  const backT   = backMat.DZ
  const topT    = topMat.DZ

  const DX = cab.DX   // cabinet width
  const DY = cab.DY   // cabinet height
  const DZ = cab.DZ   // cabinet depth
  const TK = cab.has_toekick ? r.TOEH : 0

  if (DX <= 2 * sideT) {
    errors.push({ code: 'CASE_TOO_NARROW', message: `Cabinet DX (${DX}mm) is too narrow for side material thickness (${sideT}mm)`, part: 'case' })
    return { parts, errors }
  }

  // ── Joinery ──────────────────────────────────────────────────
  const bottomJoin     = r.BOTTOM_JOIN
  const bottomBackJoin = r.BOTTOM_BACK_JOIN
  const backJoin       = r.BACK_JOIN
  const topBackJoin    = r.TOP_BACK_JOIN
  const railJoin       = r.RAIL_JOIN

  // Side depth/position: when back wraps behind the sides, sides must be shallower
  // by exactly the back material thickness and offset forward so they sit in
  // front of the back panel (not overlapping it).
  const sideDepth  = backJoin === 'behind_sides' ? DZ - backT : DZ
  const sideZstart = backJoin === 'behind_sides' ? backT      : 0

  // Side vertical extent.
  // SCRBT shifts the bottom edge of the side panels up (positive) or down (negative).
  // SCRT  shifts the top  edge of the side panels down (positive) or up  (negative).
  // bottom_outside: sides must also clear the bottom panel thickness.
  // on_top_of_sides: rail sits on top of the sides, so sides stop at rail bottom face.
  const sideYstart = TK + r.SCRBT + (bottomJoin === 'bottom_outside' ? bottomT : 0)
  const sideHeight = DY - r.SCRT - sideYstart - (railJoin === 'on_top_of_sides' ? topT : 0)

  // Bottom: full-width or between sides (X/width).
  // sides_outside: bottom fits between sides, so scribes narrow it on both ends.
  const botX = bottomJoin === 'bottom_outside' ? 0  : sideT + r.SCRL
  const botW  = bottomJoin === 'bottom_outside' ? DX : DX - 2 * sideT - r.SCRL - r.SCRR

  // Bottom: depth relationship with back panel (Z/depth)
  const botZstart = bottomBackJoin === 'butts_into_back' ? r.SCRBK + backT : 0
  const botDepth  = DZ - botZstart

  // Back: between sides or wrapping full-width behind them.
  // between_sides: scribes narrow the back panel to match the bottom/shelves.
  const backX = backJoin === 'behind_sides' ? 0      : sideT + r.SCRL
  const backW  = backJoin === 'behind_sides' ? DX     : DX - 2 * sideT - r.SCRL - r.SCRR

  // Rail / top: between sides or spanning full width on top of them.
  // between_sides: scribes narrow the rail to match the bottom/shelves.
  const railX = railJoin === 'on_top_of_sides' ? 0  : sideT + r.SCRL
  const railW  = railJoin === 'on_top_of_sides' ? DX : DX - 2 * sideT - r.SCRL - r.SCRR

  // Top / back relationship: where full_top and back_rail start in Z.
  // SCRBK (scribe back) holds the top/rail forward off the rear edge so the sides
  // can be scribed to the wall without cutting into the top. The back panel sits at
  // Z = SCRBK; the top's rear edge aligns with the back's rear face (sits_over_back)
  // or its front face (otherwise), so SCRBK reduces the top depth in both cases.
  const topZstart = r.SCRBK + (topBackJoin === 'sits_over_back' ? 0 : backT)
  const topDepth  = DZ - topZstart

  // SCRT: extra material on side panels above the top rail for scribing to a soffit/ceiling.
  // The rail/top drops by SCRT so that SCRT mm of the side panels protrude above it.
  // SCRBT: extra material on side panels below the bottom panel for scribing to the floor.

  // ── Left Side ────────────────────────────────────────────────
  parts.push({
    part_key: 'left_side',
    DX: sideDepth,
    DY: sideHeight,
    DZ: sideT,
    X:  r.SCRL,
    Y:  sideYstart,
    Z:  sideZstart,
    AX: 0, AY: 0, AZ: 0,
    material_id: sideMat.id,
    edge_band: edgeSidesToBanding(edging.left_side, ebId),
  })

  // ── Right Side ───────────────────────────────────────────────
  parts.push({
    part_key: 'right_side',
    DX: sideDepth,
    DY: sideHeight,
    DZ: sideT,
    X:  DX - sideT - r.SCRR,
    Y:  sideYstart,
    Z:  sideZstart,
    AX: 0, AY: 0, AZ: 0,
    material_id: sideMat.id,
    edge_band: edgeSidesToBanding(edging.right_side, ebId),
  })

  // ── Bottom ───────────────────────────────────────────────────
  parts.push({
    part_key: 'bottom',
    DX: botDepth,
    DY: botW,
    DZ: bottomT,
    X:  botX,
    Y:  TK + r.SCRBT,
    Z:  botZstart,
    AX: 0, AY: 0, AZ: 0,
    material_id: bottomMat.id,
    edge_band: edgeSidesToBanding(edging.bottom, ebId),
  })

  // ── Back ─────────────────────────────────────────────────────
  // Bottom joinery shifts the back's stored Y so its 3D bottom face (p.Y + p.DZ)
  // lands at TK+SCRBT (butts_into_back) or TK+SCRBT+backT (back_on_bottom).
  const backY = bottomBackJoin === 'butts_into_back' ? TK + r.SCRBT - backT : TK + r.SCRBT

  // Top joinery trims the back's top face by topT when the top sits over it.
  // SCRT: back panel stops at DY - SCRT (scribe material on sides above).
  // Cabinet3DView now uses p.DX directly as the rendered height of the back panel,
  // so compute it as (top face) − (bottom face in 3D).
  const backBottom3D = backY + backT  // = TK + SCRBT
  const backTop3D    = DY - r.SCRT - (topBackJoin === 'sits_over_back' ? topT : 0)
  const backDX       = backTop3D - backBottom3D

  parts.push({
    part_key: 'back',
    DX: backDX,
    DY: backW,
    DZ: backT,
    X:  backX,
    Y:  backY,
    Z:  r.SCRBK,
    AX: 0, AY: 0, AZ: 0,
    material_id: backMat.id,
    edge_band: edgeSidesToBanding(edging.back, ebId),
  })

  // ── Top options ───────────────────────────────────────────────
  const topType = cab.top_type ?? r.TOP_TYPE

  if (topType === 'full_top') {
    parts.push({
      part_key: 'full_top',
      DX: topDepth,
      DY: railW,
      DZ: topT,
      X:  railX,
      Y:  DY - r.SCRT - topT,
      Z:  topZstart,
      AX: 0, AY: 0, AZ: 0,
      material_id: topMat.id,
      edge_band: edgeSidesToBanding(edging.full_top, ebId),
    })

  } else if (topType === 'front_rail') {
    if (r.RD <= 0) {
      errors.push({ code: 'INVALID_RAIL_DEPTH', message: 'RD must be > 0 for front_rail top type', part: 'front_rail' })
    } else {
      parts.push({
        part_key: 'front_rail',
        DX: r.RD,
        DY: railW,
        DZ: topT,
        X:  railX,
        Y:  DY - r.SCRT - topT,
        Z:  DZ - r.RD,
        AX: 0, AY: 0, AZ: 0,
        material_id: topMat.id,
        edge_band: edgeSidesToBanding(edging.front_rail, ebId),
      })
    }

  } else if (topType === 'double_rail') {
    // Front rail
    parts.push({
      part_key: 'front_rail',
      DX: r.RD,
      DY: railW,
      DZ: topT,
      X:  railX,
      Y:  DY - r.SCRT - topT,
      Z:  DZ - r.RD,
      AX: 0, AY: 0, AZ: 0,
      material_id: topMat.id,
      edge_band: edgeSidesToBanding(edging.front_rail, ebId),
    })
    // Back rail: Z follows same top/back join rule as full_top
    parts.push({
      part_key: 'back_rail',
      DX: r.RD,
      DY: railW,
      DZ: topT,
      X:  railX,
      Y:  DY - r.SCRT - topT,
      Z:  topZstart,
      AX: 0, AY: 0, AZ: 0,
      material_id: topMat.id,
      edge_band: edgeSidesToBanding(edging.back_rail, ebId),
    })
  }
  // TOP_TYPE 'none' → no top parts added

  return { parts, errors }
}
