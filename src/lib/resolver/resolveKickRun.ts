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
//   • oversized runs split into equal segments at max_segment_length (the split
//     only cuts the face / sub front / back; no extra spreaders at the seams);
//   • or manual seams (KS1): face seams + sub front seams set separately, the
//     back mirrored from the sub front so the joints stagger.
// ============================================================

import {
  CabinetInput, ResolvedToekickPart, ConstructionRules,
  ResolverError, edgeSidesToBanding, DEFAULT_EDGING, EdgingDefaults,
} from './types'
import { kickReturns } from './resolveToekick'

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

type Seg = { start: number; len: number }

// Seam positions (mm from the kick's left end) → segments. Seams outside the
// kick (or within 1mm of an end / each other) are dropped.
export function seamsToSegments(L: number, seams: number[] | null | undefined): Seg[] {
  const xs = [...new Set((seams ?? []).filter(x => Number.isFinite(x) && x > 1 && x < L - 1))].sort((a, b) => a - b)
  const cuts = [0, ...xs.filter((x, i) => i === 0 || x - xs[i - 1] > 1), L]
  return cuts.slice(1).map((x, i) => ({ start: cuts[i], len: x - cuts[i] }))
}

// Round-number sub kick seams (Mark, KS1): full pieces of the max length rounded
// down to 100 (2400, 2300, ...) from the left, remainder last.
export function roundSubSeams(L: number, maxSeg: number | null | undefined): number[] {
  const step = Math.floor((maxSeg && maxSeg > 0 ? maxSeg : 2400) / 100) * 100
  if (step <= 0 || L <= step) return []
  const xs: number[] = []
  for (let x = step; x < L - 1; x += step) xs.push(x)
  return xs
}

// Mirror seams end for end: the kick back takes the sub front's seams from the
// other end, so its longest piece starts at the opposite end (stagger = strength).
export function mirrorSeams(L: number, seams: number[]): number[] {
  return seams.map(x => L - x).sort((a, b) => a - b)
}

// The face / sub front / back segments of a joined kick. Equal / exact split all
// three at the same seams; manual takes the face and sub seams as set (sub
// defaults to round numbers, face to the equal split) and mirrors the sub for the back.
export function kickRunSegments(
  L: number,
  run: { max_segment_length: number | null; split_mode: string; face_splits?: number[] | null; sub_splits?: number[] | null } | undefined,
): { face: Seg[]; sub: Seg[]; back: Seg[] } {
  const maxSeg = run?.max_segment_length ?? null
  if (run?.split_mode !== 'manual') {
    const segs = splitKickSegments(L, maxSeg, run?.split_mode === 'exact' ? 'exact' : 'equal')
    return { face: segs, sub: segs, back: segs }
  }
  const face = run.face_splits ? seamsToSegments(L, run.face_splits) : splitKickSegments(L, maxSeg ?? 2400, 'equal')
  const subSeams = run.sub_splits ?? roundSubSeams(L, maxSeg)
  return { face, sub: seamsToSegments(L, subSeams), back: seamsToSegments(L, mirrorSeams(L, subSeams)) }
}

// Kick-run parts cut in more than one piece get "JOIN" on their name so the
// shop knows to join them on site. True for a kick assembly's face / sub front /
// back when that part has more than one piece.
export function isKickJoinPiece(partKey: string, sameKeyCount: number, isKickAssembly: boolean): boolean {
  return isKickAssembly && sameKeyCount > 1
    && (partKey === 'kick_front_face' || partKey === 'kick_sub_front' || partKey === 'kick_back')
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
  const FC  = r.TOEFC                           // subframe floor clearance
  const fid = cab.toekick_face_material.id
  const iid = cab.toekick_interior_material.id

  const faceEb = cab.toekick_face_edgeband_id
  const intEb  = cab.toekick_interior_edgeband_id

  // Key Z positions (same convention as resolveToekick).
  const kickFrontZ = DZ - r.TOESCF - TF
  const kickSubZ   = kickFrontZ - TI
  const kickBackZ  = r.TOESCB

  // ── Width-spanning boards, split into segments ──────────────────────────────
  const segs = kickRunSegments(L, cab.kick_run)
  // End returns (TOERETL / TOERETR), mitred to the face: the interior boards and
  // end spreaders step in at a returned end; only the end face boards are mitred.
  const ret = kickReturns(r, TF)
  const grain = r.TOEGRAIN ?? 'vertical'

  segs.face.forEach((seg, i) => {
    const last = segs.face.length - 1
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
      grain_direction: grain,
      ...ret.faceBevels(i === 0, i === last),
    })
  })
  segs.sub.forEach((seg, i) => {
    const inL = i === 0 ? ret.l : 0, inR = i === segs.sub.length - 1 ? ret.r : 0
    // Kick Sub Front — behind the face, lifted TOEFC off the floor, flush at top
    parts.push({
      part_key: 'kick_sub_front',
      sort_order: 100 + i,
      DX: TK - FC, DY: seg.len - inL - inR, DZ: TI,
      X: x0 + seg.start + inL, Y: FC, Z: kickSubZ,
      AX: 0, AY: 0, AZ: 0,
      material_id: iid,
      edge_band: edgeSidesToBanding(edging.kick_sub_front, intEb),
      is_detached: true,
    })
  })
  segs.back.forEach((seg, i) => {
    const inL = i === 0 ? ret.l : 0, inR = i === segs.back.length - 1 ? ret.r : 0
    // Kick Back — at the back of the assembly
    parts.push({
      part_key: 'kick_back',
      sort_order: 200 + i,
      DX: TK - FC, DY: seg.len - inL - inR, DZ: TI,
      X: x0 + seg.start + inL, Y: FC, Z: kickBackZ,
      AX: 0, AY: 0, AZ: 0,
      material_id: iid,
      edge_band: edgeSidesToBanding(edging.kick_back, intEb),
      is_detached: true,
    })
  })

  parts.push(...ret.parts({ x0, W: L, TK, Z0: kickBackZ, Zf: kickFrontZ + TF, fid,
    eb: edgeSidesToBanding(edging.kick_return, faceEb), detached: true, grain }))

  // ── Spreaders ───────────────────────────────────────────────────────────────
  const sprBW = 100       // horizontal brace width (fixed 100mm)

  // Too narrow for a 100mm brace (e.g. a detached 70mm filler kick) → no spreaders.
  if (L < sprBW) return { parts, errors }

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

  const sprH  = TK - FC   // vertical spreader height

  // Collect vertical-spreader X positions across the whole run:
  //   • both run ends, • TOESP-spaced internals. Split seams get no extra
  //   spreader (Mark 2026-11-03: they overlapped the spaced ones) — a split only
  //   cuts the face, sub front and back.
  // Dedupe near-coincident positions.
  const xL = x0 + ret.l, xR = x0 + L - TI - ret.r
  const xs: number[] = [xL, xR]

  const qty     = Math.max(0, Math.floor(L / r.TOESP) - 1)
  const spacing = L / (qty + 1)
  for (let i = 1; i <= qty; i++) xs.push(x0 + spacing * i - TI / 2)

  const uniqXs: number[] = []
  for (const x of xs.sort((a, b) => a - b)) {
    if (uniqXs.length === 0 || Math.abs(x - uniqXs[uniqXs.length - 1]) > 1) uniqXs.push(x)
  }

  uniqXs.forEach((x, k) => {
    const isRight = Math.abs(x - xR) < 1
    // Vertical spreader
    parts.push({
      part_key: 'spreader_vertical',
      sort_order: 300 + k * 2,
      DX: sprH, DY: TI, DZ: sprEZ,
      X: x, Y: FC, Z: sprZ0,
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
