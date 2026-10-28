// ============================================================
// Toe Kick Module Resolver
// ============================================================

import {
  CabinetInput, ResolvedToekickPart, ConstructionRules,
  ResolverError, edgeSidesToBanding, DEFAULT_EDGING, EdgingDefaults
} from './types'
import { resolveKickRunParts } from './resolveKickRun'
import { resolveShapedKick } from './resolveShapedKick'

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

  // Shaped cabinets (z_cabinet_shape 4b): the kick follows the footprint.
  if (cab.footprint?.segments?.length) return resolveShapedKick(cab, r, toeType)

  const edging: Required<EdgingDefaults> = { ...DEFAULT_EDGING, ...(r.EDGING ?? {}) }

  const DX  = cab.DX
  const DZ  = cab.DZ
  const T   = cab.material.DZ
  const TF  = cab.toekick_face_material.DZ      // kick face material thickness
  const TI  = cab.toekick_interior_material.DZ  // kick interior material thickness
  const TK  = r.TOEH
  const FC  = r.TOEFC                           // subframe floor clearance
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
      grain_direction: r.TOEGRAIN ?? 'vertical',
    })
    return { parts, errors }
  }

  // ── Ladder Frame ──────────────────────────────────────────────

  // End returns (TOERETL / TOERETR), mitred to the face: the sub front, back
  // and end spreader stop short of them.
  const ret = kickReturns(r, TF)
  const grain = r.TOEGRAIN ?? 'vertical'

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
    grain_direction: grain,
    ...ret.faceBevels(),
  })

  // Kick Sub Front — sits behind front face, lifted TOEFC off the floor and
  // flush with the top of the kick
  parts.push({
    part_key: 'kick_sub_front',
    sort_order: 1,
    DX: TK - FC,
    DY: W - ret.l - ret.r,
    DZ: TI,
    X: x0 + ret.l, Y: FC, Z: kickSubZ,
    AX: 0, AY: 0, AZ: 0,
    material_id: iid,
    edge_band: edgeSidesToBanding(edging.kick_sub_front, cab.toekick_interior_edgeband_id),
    is_detached: false,
  })

  // Kick Back — at back of assembly
  parts.push({
    part_key: 'kick_back',
    sort_order: 2,
    DX: TK - FC,
    DY: W - ret.l - ret.r,
    DZ: TI,
    X: x0 + ret.l, Y: FC, Z: kickBackZ,
    AX: 0, AY: 0, AZ: 0,
    material_id: iid,
    edge_band: edgeSidesToBanding(edging.kick_back, cab.toekick_interior_edgeband_id),
    is_detached: false,
  })

  parts.push(...ret.parts({ x0, W, TK, Z0: kickBackZ, Zf: kickFrontZ + TF, fid,
    eb: edgeSidesToBanding(edging.kick_return, cab.toekick_face_edgeband_id), detached: false, grain }))

  const sprBW   = 100                    // horizontal brace width (fixed 100mm)

  // Too narrow for a 100mm brace (e.g. a 70mm BFK filler) → boards only, no spreaders.
  if (W < sprBW) return { parts, errors }

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

  const sprH    = TK - FC                // vertical spreader height

  // End spreaders — one at each end of the (inset) kick
  const endPositions: Array<{ x: number; isRight: boolean }> = [
    { x: x0 + ret.l,            isRight: false },
    { x: x0 + W - TI - ret.r,   isRight: true  },
  ]

  for (const { x, isRight } of endPositions) {
    // Vertical spreader
    parts.push({
      part_key: 'spreader_vertical',
      sort_order: isRight ? 4 : 3,
      DX: sprH,
      DY: TI,
      DZ: sprEZ,
      X: x, Y: FC, Z: sprZ0,
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
      X: sx, Y: FC, Z: sprZ0,
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

/**
 * Kick end returns (TOERETL / TOERETR): a face board, kick height, turning back
 * from an open end of the kick (e.g. into a dishwasher opening) to the kick
 * back, mitred 45° to the face like a bulkhead return. `l` / `r` = how far the
 * interior boards and end spreaders step in at each end; `faceBevels(atL, atR)`
 * = the mitre on the face board's ends (the face keeps its outer length).
 * A return is a face-kind board turned ±90° about its inner front/back corner
 * (as the shaped kick boards, resolveShapedKick): local x along the return,
 * local z = thickness, inner face at z = 0.
 */
export function kickReturns(r: Pick<ConstructionRules, 'TOERETL' | 'TOERETR'>, TF: number) {
  const L = !!r.TOERETL, R = !!r.TOERETR
  return {
    l: L ? TF : 0,
    r: R ? TF : 0,
    faceBevels: (atL = true, atR = true) => ({
      ...(L && atL ? { bevel_lo: 45 } : {}), ...(R && atR ? { bevel_hi: 45 } : {}),
    }),
    /** Z0 = the kick back, Zf = the kick face's front plane. */
    parts: (o: {
      x0: number; W: number; TK: number; Z0: number; Zf: number
      fid: string; eb: ResolvedToekickPart['edge_band']; detached: boolean
      grain: ResolvedToekickPart['grain_direction']
    }): ResolvedToekickPart[] => {
      const base = {
        part_key: 'kick_return' as const,
        DX: o.TK, DY: o.Zf - o.Z0, DZ: TF, Y: 0, AX: 0, AZ: 0,
        material_id: o.fid, edge_band: o.eb, is_detached: o.detached, grain_direction: o.grain,
      }
      return [
        // Left: runs back → front (AY −90), mitre at the front (local x = DY).
        ...(L ? [{ ...base, sort_order: 50, X: o.x0 + TF, Z: o.Z0, AY: -90, bevel_hi: 45 }] : []),
        // Right: runs front → back (AY 90), mitre at the front (local x = 0).
        ...(R ? [{ ...base, sort_order: 51, X: o.x0 + o.W - TF, Z: o.Zf, AY: 90, bevel_lo: 45 }] : []),
      ]
    },
  }
}
