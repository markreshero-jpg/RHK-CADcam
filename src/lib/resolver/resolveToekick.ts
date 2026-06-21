// ============================================================
// Toe Kick Module Resolver
// ============================================================

import {
  CabinetInput, ResolvedToekickPart, ConstructionRules,
  ResolverError, edgeSidesToBanding, DEFAULT_EDGING, EdgingDefaults
} from './types'
import { resolveKickRunParts } from './resolveKickRun'

export function resolveToekickParts(
  cab: CabinetInput,
  r: ConstructionRules
): { parts: ResolvedToekickPart[], errors: ResolverError[] } {
  const parts: ResolvedToekickPart[] = []
  const errors: ResolverError[] = []

  // Joined kick run: the synthetic kick assembly owns the whole run's continuous
  // toe kick; member cabinets resolve nothing. See resolveKickRun.ts.
  if (cab.kick_run) {
    if (cab.kick_run.role === 'member') return { parts, errors }
    return resolveKickRunParts(cab, r)
  }

  const toeType = cab.toe_type ?? r.TOE_TYPE

  // Wall cabinets and 'none' type have no toe kick
  if (toeType === 'none' || cab.assembly_class === 'wall') {
    return { parts, errors }
  }

  const edging: Required<EdgingDefaults> = { ...DEFAULT_EDGING, ...(r.EDGING ?? {}) }

  const DX  = cab.DX
  const DZ  = cab.DZ
  const T   = cab.material.DZ
  const TF  = cab.toekick_face_material.DZ      // kick face material thickness
  const TI  = cab.toekick_interior_material.DZ  // kick interior material thickness
  const TK  = r.TOEH
  const fid = cab.toekick_face_material.id
  const iid = cab.toekick_interior_material.id

  // Key Z positions
  // Kick front face: back face sits at CAB_DZ - TOESCF - TF
  // Z is the back face of the panel (our origin convention)
  const kickFrontZ  = DZ - r.TOESCF - TF    // kick front face back face position
  const kickSubZ    = kickFrontZ - TI        // kick sub front back face
  const kickBackZ   = r.TOESCB              // kick back back face

  // Left/right scribes inset the kick from the cabinet ends: it starts at x0 and
  // spans W along the width (TOESCL off the left, TOESCR off the right).
  const x0 = r.TOESCL
  const W  = DX - r.TOESCL - r.TOESCR

  // ── Leg Kick ─────────────────────────────────────────────────
  if (toeType === 'leg') {
    parts.push({
      part_key: 'kick_front_face',
      sort_order: 0,
      DX: TK,
      DY: W,
      DZ: TF,
      X: x0, Y: 0, Z: kickFrontZ,
      AX: 0, AY: 0, AZ: 0,
      material_id: fid,
      edge_band: edgeSidesToBanding(edging.kick_front_face, cab.toekick_face_edgeband_id),
      is_detached: false,
    })
    return { parts, errors }
  }

  // ── Ladder Frame ──────────────────────────────────────────────

  // Kick Front Face — full height TK, inset width W, face material
  parts.push({
    part_key: 'kick_front_face',
    sort_order: 0,
    DX: TK,
    DY: W,
    DZ: TF,
    X: x0, Y: 0, Z: kickFrontZ,
    AX: 0, AY: 0, AZ: 0,
    material_id: fid,
    edge_band: edgeSidesToBanding(edging.kick_front_face, cab.toekick_face_edgeband_id),
    is_detached: false,
  })

  // Kick Sub Front — sits behind front face, height = TK - TF (front face caps top)
  // Y = TI so it sits on top of a floor strip / at material thickness
  parts.push({
    part_key: 'kick_sub_front',
    sort_order: 1,
    DX: TK - TF,
    DY: W,
    DZ: TI,
    X: x0, Y: TI, Z: kickSubZ,
    AX: 0, AY: 0, AZ: 0,
    material_id: iid,
    edge_band: edgeSidesToBanding(edging.kick_sub_front, cab.toekick_interior_edgeband_id),
    is_detached: false,
  })

  // Kick Back — at back of assembly
  parts.push({
    part_key: 'kick_back',
    sort_order: 2,
    DX: TK - TF,
    DY: W,
    DZ: TI,
    X: x0, Y: TI, Z: kickBackZ,
    AX: 0, AY: 0, AZ: 0,
    material_id: iid,
    edge_band: edgeSidesToBanding(edging.kick_back, cab.toekick_interior_edgeband_id),
    is_detached: false,
  })

  // Spreader span — Z distance between inner faces of kick back and kick sub front
  // Inner face of kick back   = kickBackZ + TI
  // Inner face of kick sub    = kickSubZ
  const sprZ0  = kickBackZ + TI
  const sprZ1  = kickSubZ
  const sprEZ  = sprZ1 - sprZ0  // Z span of spreaders

  if (sprEZ <= 0) {
    errors.push({
      code: 'INVALID_SPREADER_SPAN',
      message: `Toe kick spreader span is ${sprEZ}mm — check TOESCF and cabinet DZ`,
      part: 'spreader',
    })
    return { parts, errors }
  }

  const sprH    = TK - TF                // vertical spreader height
  const sprBW   = 100                    // horizontal brace width (fixed 100mm)

  // End spreaders — one at each end of the (inset) kick
  const endPositions: Array<{ x: number; isRight: boolean }> = [
    { x: x0,            isRight: false },
    { x: x0 + W - TI,   isRight: true  },
  ]

  for (const { x, isRight } of endPositions) {
    // Vertical spreader
    parts.push({
      part_key: 'spreader_vertical',
      sort_order: isRight ? 4 : 3,
      DX: sprH,
      DY: TI,
      DZ: sprEZ,
      X: x, Y: TI, Z: sprZ0,
      AX: 0, AY: 0, AZ: 0,
      material_id: iid,
      edge_band: edgeSidesToBanding(edging.spreader_vertical, cab.toekick_interior_edgeband_id),
      is_detached: false,
    })
    // Horizontal brace — 100mm wide, lays flat on top of spreader
    const braceX = isRight ? x - sprBW : x + TI
    parts.push({
      part_key: 'spreader_horizontal',
      sort_order: isRight ? 6 : 5,
      DX: sprBW,
      DY: TI,
      DZ: sprEZ,
      X: braceX, Y: TK - TI, Z: sprZ0,
      AX: 0, AY: 0, AZ: 0,
      material_id: iid,
      edge_band: edgeSidesToBanding(edging.spreader_horizontal, cab.toekick_interior_edgeband_id),
      is_detached: false,
    })
  }

  // Internal spreaders at TOESP centres across the inset width
  const qty     = Math.max(0, Math.floor(W / r.TOESP) - 1)
  const spacing = W / (qty + 1)

  for (let i = 1; i <= qty; i++) {
    const sx = x0 + spacing * i - TI / 2

    // Vertical spreader
    parts.push({
      part_key: 'spreader_vertical',
      sort_order: 7 + i * 2,
      DX: sprH,
      DY: TI,
      DZ: sprEZ,
      X: sx, Y: TI, Z: sprZ0,
      AX: 0, AY: 0, AZ: 0,
      material_id: iid,
      edge_band: edgeSidesToBanding(edging.spreader_vertical, cab.toekick_interior_edgeband_id),
      is_detached: false,
    })
    // Horizontal brace — offset inward by TI to clear spreader
    parts.push({
      part_key: 'spreader_horizontal',
      sort_order: 8 + i * 2,
      DX: sprBW,
      DY: TI,
      DZ: sprEZ,
      X: sx + TI, Y: TK - TI, Z: sprZ0,
      AX: 0, AY: 0, AZ: 0,
      material_id: iid,
      edge_band: edgeSidesToBanding(edging.spreader_horizontal, cab.toekick_interior_edgeband_id),
      is_detached: false,
    })
  }

  return { parts, errors }
}
