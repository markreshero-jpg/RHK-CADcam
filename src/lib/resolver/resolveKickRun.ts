// ============================================================
// Kick Run Resolver — continuous toe kick for a joined run
// ============================================================
// A joined kick run is owned by a synthetic "kick assembly" cabinet (toe-kick
// only) whose DX is the whole run length and DZ is the deepest member's depth
// (both set at join time + kept in sync by the orchestration layer). This module
// builds that continuous ladder from the assembly's own dimensions.
//
// Behaviour (agreed — see z_kick_join/KICK-JOIN-PLAN.md):
//   • whole kick continuous: face + interior ladder, spreaders respaced over
//     the full run length (fewer verticals than per-cabinet);
//   • depth already baked into the assembly's DZ (built to the deepest member);
//   • require ladder — leg-type runs are not merged (caller guards; we no-op);
//   • oversized runs split into equal segments at max_segment_length, with a
//     vertical spreader forced at every split seam so segments butt over a fixing.
// ============================================================

import {
  CabinetInput, ResolvedToekickPart, ConstructionRules,
  ResolverError, edgeSidesToBanding, DEFAULT_EDGING, EdgingDefaults,
} from './types'

// Equal-vs-exact segmentation of a run of length L into pieces no longer than
// maxSeg. 'equal' spreads N = ceil(L/maxSeg) pieces evenly (no sliver offcut);
// 'exact' cuts full maxSeg pieces with the remainder last. Returns one segment
// covering the whole run when no split is needed.
export function splitKickSegments(
  L: number,
  maxSeg: number | null,
  mode: 'equal' | 'exact',
): { start: number; len: number }[] {
  if (!maxSeg || maxSeg <= 0 || L <= maxSeg) return [{ start: 0, len: L }]
  const n = Math.ceil(L / maxSeg)
  if (mode === 'exact') {
    const segs: { start: number; len: number }[] = []
    let start = 0
    for (let i = 0; i < n; i++) {
      const len = Math.min(maxSeg, L - start)
      segs.push({ start, len })
      start += len
    }
    return segs
  }
  const len = L / n   // equal
  return Array.from({ length: n }, (_, i) => ({ start: i * len, len }))
}

export function resolveKickRunParts(
  cab: CabinetInput,
  r: ConstructionRules,
): { parts: ResolvedToekickPart[]; errors: ResolverError[] } {
  const parts: ResolvedToekickPart[] = []
  const errors: ResolverError[] = []

  const toeType = cab.toe_type ?? r.TOE_TYPE
  if (toeType === 'none') return { parts, errors }

  // Require ladder: legs are discrete and aren't merged into a run. The join
  // action guards this; if a leg run reaches us, emit nothing + warn.
  if (toeType === 'leg') {
    errors.push({
      code: 'KICK_RUN_LEG_UNSUPPORTED',
      message: 'Leg-type toe kicks cannot be joined into a continuous run',
      part: 'kick',
    })
    return { parts, errors }
  }

  const edging: Required<EdgingDefaults> = { ...DEFAULT_EDGING, ...(r.EDGING ?? {}) }

  // The kick assembly carries the run length as its own width and the deepest
  // member's depth as its own depth (set at join, kept in sync by orchestration).
  const DZ = cab.DZ
  // Left/right scribes inset the kick from the run ends: the kick starts at x0 and
  // spans W (TOESCL off the left end, TOESCR off the right end). Internal cabinet
  // boundaries get no scribe — the run is one continuous piece.
  const x0 = r.TOESCL
  const L  = cab.DX - r.TOESCL - r.TOESCR

  const TF  = cab.toekick_face_material.DZ      // kick face material thickness
  const TI  = cab.toekick_interior_material.DZ  // kick interior material thickness
  // Kick height = the assembly's OWN height (DY), so resizing the standalone kick
  // assembly changes the toe height. Falls back to the construction TOEH if the
  // assembly somehow has no height set.
  const TK  = cab.DY > 0 ? cab.DY : r.TOEH
  const fid = cab.toekick_face_material.id
  const iid = cab.toekick_interior_material.id

  const faceEb = cab.toekick_face_edgeband_id
  const intEb  = cab.toekick_interior_edgeband_id

  // Key Z positions (same convention as resolveToekick).
  const kickFrontZ = DZ - r.TOESCF - TF
  const kickSubZ   = kickFrontZ - TI
  const kickBackZ  = r.TOESCB

  // ── Width-spanning boards, split into segments ──────────────────────────────
  const segs = splitKickSegments(L, cab.kick_run?.max_segment_length ?? null, cab.kick_run?.split_mode ?? 'equal')

  segs.forEach((seg, i) => {
    // Kick Front Face — full height TK, face material
    parts.push({
      part_key: 'kick_front_face',
      sort_order: i,
      DX: TK, DY: seg.len, DZ: TF,
      X: x0 + seg.start, Y: 0, Z: kickFrontZ,
      AX: 0, AY: 0, AZ: 0,
      material_id: fid,
      edge_band: edgeSidesToBanding(edging.kick_front_face, faceEb),
      is_detached: true,
    })
    // Kick Sub Front — behind the face, capped by it at the top
    parts.push({
      part_key: 'kick_sub_front',
      sort_order: 100 + i,
      DX: TK - TF, DY: seg.len, DZ: TI,
      X: x0 + seg.start, Y: TI, Z: kickSubZ,
      AX: 0, AY: 0, AZ: 0,
      material_id: iid,
      edge_band: edgeSidesToBanding(edging.kick_sub_front, intEb),
      is_detached: true,
    })
    // Kick Back — at the back of the assembly
    parts.push({
      part_key: 'kick_back',
      sort_order: 200 + i,
      DX: TK - TF, DY: seg.len, DZ: TI,
      X: x0 + seg.start, Y: TI, Z: kickBackZ,
      AX: 0, AY: 0, AZ: 0,
      material_id: iid,
      edge_band: edgeSidesToBanding(edging.kick_back, intEb),
      is_detached: true,
    })
  })

  // ── Spreaders ───────────────────────────────────────────────────────────────
  const sprZ0 = kickBackZ + TI   // inner face of kick back
  const sprZ1 = kickSubZ         // inner face of kick sub front
  const sprEZ = sprZ1 - sprZ0    // Z span of spreaders

  if (sprEZ <= 0) {
    errors.push({
      code: 'INVALID_SPREADER_SPAN',
      message: `Kick run spreader span is ${sprEZ}mm — check TOESCF and member depth`,
      part: 'spreader',
    })
    return { parts, errors }
  }

  const sprH  = TK - TF   // vertical spreader height
  const sprBW = 100       // horizontal brace width (fixed 100mm)

  // Collect vertical-spreader X positions across the whole run:
  //   • both run ends, • TOESP-spaced internals, • forced at each split seam.
  // Dedupe near-coincident positions (e.g. a seam landing on a TOESP centre).
  const xs: number[] = [x0, x0 + L - TI]

  const qty     = Math.max(0, Math.floor(L / r.TOESP) - 1)
  const spacing = L / (qty + 1)
  for (let i = 1; i <= qty; i++) xs.push(x0 + spacing * i - TI / 2)

  // Interior split seams (skip seg[0].start === 0) → spreader centred on the seam.
  for (let i = 1; i < segs.length; i++) xs.push(x0 + segs[i].start - TI / 2)

  const uniqXs: number[] = []
  for (const x of xs.sort((a, b) => a - b)) {
    if (uniqXs.length === 0 || Math.abs(x - uniqXs[uniqXs.length - 1]) > 1) uniqXs.push(x)
  }

  uniqXs.forEach((x, k) => {
    const isRight = Math.abs(x - (x0 + L - TI)) < 1
    // Vertical spreader
    parts.push({
      part_key: 'spreader_vertical',
      sort_order: 300 + k * 2,
      DX: sprH, DY: TI, DZ: sprEZ,
      X: x, Y: TI, Z: sprZ0,
      AX: 0, AY: 0, AZ: 0,
      material_id: iid,
      edge_band: edgeSidesToBanding(edging.spreader_vertical, intEb),
      is_detached: true,
    })
    // Horizontal brace — sits on top of the vertical, kept inside the run
    const braceX = isRight ? x - sprBW : x + TI
    parts.push({
      part_key: 'spreader_horizontal',
      sort_order: 301 + k * 2,
      DX: sprBW, DY: TI, DZ: sprEZ,
      X: braceX, Y: TK - TI, Z: sprZ0,
      AX: 0, AY: 0, AZ: 0,
      material_id: iid,
      edge_band: edgeSidesToBanding(edging.spreader_horizontal, intEb),
      is_detached: true,
    })
  })

  return { parts, errors }
}
