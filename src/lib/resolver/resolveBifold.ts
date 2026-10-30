// ============================================================
// Sliding bi-fold doors — Finista BF-05 (z_bifold_slide)
// The cabinet's two doors fold as a pair. The OUTER door hangs on the BIFOLD
// gable with the ordinary hinges; the LEADING door gets no hinges, only:
//   • top carriage: 2 × Ø35 × 11.5 cups 64 apart, the top one 47.5 below the
//     underside of the cabinet top, 22.5 in from the leading edge
//   • bottom guide: one Ø35 × 11.5 cup 22.5 in, 26.5 above the top of the
//     cabinet bottom ('above') or 26.5 below its underside ('below'), or none
// Centre hinges join the doors at the outer door's hinge heights:
//   • standard (kit nylon): a 32 × 32 square of Ø3 × 10 across the joint, so
//     each door's column sits (32 - gap) / 2 from the joint edge (B*)
//   • cup: on both doors a Ø35 × 12 cup 22.5 from the joint, plus 2 × Ø10 ×
//     11.5 dowels 52 apart, 5.5 further from the joint
// Holes are zone-local from the bottom-left as seen from the front, drilled
// into the back face. Tracks are not drilled (drawn only, F3).
// ============================================================

import type { CabinetInput, ConstructionRules, ResolvedFaceZone, ResolvedCasePart, ResolvedInternalPart, ResolvedHingeInstance, ResolverError, BifoldHole, ResolvedCabinet } from './types'
import { caseBox, internalBox } from '../jointDrilling'

type Box = ReturnType<typeof caseBox>
import { resolveHandle } from './resolveHandles'

export const BIFOLD = {
  cupDia: 35, cupDepth: 11.5,
  edgeIn: 22.5,          // door edge → carriage / guide cup centre
  topDrop: 47.5,         // underside of the cabinet top → top carriage cup
  carriagePitch: 64,
  guideOffset: 26.5,     // cabinet bottom face → guide cup
  belowMin: 55,          // 'below': the door hangs at least this far under the bottom
  stdPitch: 32, stdDia: 3, stdDepth: 10,
  cupHingeIn: 22.5, cupHingeDepth: 12,
  dowelDia: 10, dowelDepth: 11.5, dowelPitch: 52, dowelOut: 5.5,
  maxInside: 1200, maxHeight: 2200, maxThick: 25, maxOverlay: 17,
} as const

/** Track envelope off the BR0124CH sheet (no maker model): front 22.7 and back
 *  40 behind the doors' back face (screws on 30.5), 20 deep off the panel it's
 *  fixed to. The same track top and bottom (LS 7104967 "Track Top & Bottom"). */
export const BIFOLD_TRACK = { front: 22.7, back: 40, height: 20, wall: 1.5 } as const

/** End profile, shaped like the LS photo (z_accessories/models/Bi-fold Door):
 *  a channel closed against the panel and open away from it, the roller inside,
 *  at the back of the envelope; a foot flange along the open edge running
 *  forward to the envelope's front (toward the doors — Mark, 2026-10-30), and
 *  two small ribs on that side. u = back from the track's front, v = away from
 *  the panel. */
export const BIFOLD_TRACK_PROFILE: readonly (readonly [number, number])[] = [
  [17.3, 0], [6.3, 0],
  [6.3, 5], [5.7, 5], [5.7, 6], [6.3, 6],            // ribs
  [6.3, 9], [5.7, 9], [5.7, 10], [6.3, 10],
  [6.3, 18.5], [0, 18.5], [0, 20],               // foot flange
  [7.8, 20], [7.8, 1.5], [15.8, 1.5], [15.8, 20], [17.3, 20],
]

export interface BifoldTrack {
  which: 'top' | 'bottom'
  x: number; y: number; z: number      // bounding box min corner, cabinet coords
  dx: number; dy: number; dz: number
  open: 'up' | 'down'                  // toward the roller
  face: number                         // y of the panel face it's fixed to
  zFront: number                       // z of the track's front (22.7 behind the doors)
}

/** The track's end profile in cabinet (z, y). */
export function trackProfile(t: BifoldTrack): { z: number; y: number }[] {
  const dir = t.open === 'down' ? -1 : 1
  return BIFOLD_TRACK_PROFILE.map(([u, v]) => ({ z: t.zFront - u, y: t.face + dir * v }))
}

/** The panels the tracks fix to: the lowest one over the pair (the cabinet top or
 *  front rail, or a fixed shelf when the pair is a lower row — RHK6595 WC-02, Mark
 *  2026-10-31) and the highest one under it (the bottom or a fixed shelf). A fixed
 *  shelf counts when it runs across the middle of the pair. */
export function bifoldPanels(caseParts: ResolvedCasePart[], internalParts: ResolvedInternalPart[], pair: ResolvedFaceZone[]): { top: Box | null; bottom: Box | null } {
  if (!pair.length) return { top: null, bottom: null }
  const mid = Math.min(...pair.map(z => z.Y)) + Math.max(...pair.map(z => z.DY)) / 2
  const cx = (Math.min(...pair.map(z => z.X)) + Math.max(...pair.map(z => z.X + z.DX))) / 2
  const boxes: Box[] = [
    ...caseParts.filter(p => p.part_key === 'full_top' || p.part_key === 'front_rail' || p.part_key === 'bottom').map(caseBox),
    ...internalParts.filter(p => p.part_type === 'fixed_shelf').map(internalBox).filter((b): b is Box => !!b && b.x <= cx && cx <= b.x + b.w),
  ]
  const above = boxes.filter(b => b.y >= mid), below = boxes.filter(b => b.y + b.h <= mid)
  return {
    top:    above.length ? above.reduce((a, b) => (b.y < a.y ? b : a)) : null,
    bottom: below.length ? below.reduce((a, b) => (b.y + b.h > a.y + a.h ? b : a)) : null,
  }
}

/** The top track, and the bottom one unless the guide is None: gable to gable,
 *  under the top; on top of the bottom ('above') or under it ('below'). */
export function bifoldTracks(rp: Pick<ResolvedCabinet, 'bifold' | 'case_parts' | 'face_zones'> & { internal_parts?: ResolvedInternalPart[] }): BifoldTrack[] {
  const pair = rp.face_zones.filter(z => z.bifold_role)
  const leading = pair.find(z => z.bifold_role === 'leading')
  if (!leading) return []
  const T = BIFOLD_TRACK
  const box = (k: ResolvedCasePart['part_key']) => { const p = rp.case_parts.find(c => c.part_key === k); return p ? caseBox(p) : null }
  const ls = box('left_side'), rs = box('right_side')
  const x = ls ? ls.x + ls.w : Math.min(...pair.map(z => z.X))
  const dx = (rs ? rs.x : Math.max(...pair.map(z => z.X + z.DX))) - x
  const zFront = leading.Z - T.front
  const z = leading.Z - T.back, dz = T.back - T.front
  const track = (which: BifoldTrack['which'], face: number, open: BifoldTrack['open']): BifoldTrack =>
    ({ which, x, y: open === 'down' ? face - T.height : face, z, dx, dy: T.height, dz, open, face, zFront })
  const out: BifoldTrack[] = []
  const { top, bottom: bot } = bifoldPanels(rp.case_parts, rp.internal_parts ?? [], pair)
  if (top) out.push(track('top', top.y, 'down'))
  const mode = rp.bifold?.bottom ?? 'above'
  if (bot && mode !== 'none') out.push(mode === 'above' ? track('bottom', bot.y + bot.h, 'up') : track('bottom', bot.y, 'down'))
  return out
}

/** How far the pair folds open: until the two doors (thickness `thick`) sit side by
 *  side as a pack (+4) at the hinge gable. The outer door's angle, radians; `span` =
 *  both doors + the gap between them. The 3D open doors and the plan share it. */
export function bifoldFoldAngle(span: number, thick: number): number {
  return Math.acos(Math.min(1, (2 * thick + 4) / span))
}

/** Bi-fold fitting holes in cabinet space (front view) for the 2D views — the points the CNC drills. */
export function bifoldHoleShapes(zones: ResolvedFaceZone[]): { x: number; y: number; r: number }[] {
  return zones.flatMap(z => (z.bifold_holes ?? []).map(p => ({ x: z.X + p.x, y: z.Y + p.y, r: p.dia / 2 })))
}

export interface BifoldPair { hand: 'L' | 'R'; outer: ResolvedFaceZone; leading: ResolvedFaceZone }

/** The two doors side by side the pair is made of, or null when the cabinet
 *  isn't a bi-fold. The pair is a row of exactly 2 doors (nothing else in that
 *  row); with several such rows, the tallest (RHK6595 WC-02: the 1000 appliance
 *  doors, not the 390 PTO doors over them). Sets both doors' hinge side to the
 *  hand (the leading door turns about its edge at the joint) and their roles.
 *  Run before handles. */
export function bifoldPair(cab: CabinetInput, zones: ResolvedFaceZone[], warnings: ResolverError[]): BifoldPair | null {
  const hand = cab.rules.BIFOLD
  if (hand !== 'L' && hand !== 'R') return null
  const rows = new Map<number, ResolvedFaceZone[]>()
  for (const z of zones) if (!z.facet && !z.AY) rows.set(z.row_index, [...(rows.get(z.row_index) ?? []), z])
  const pairs = [...rows.values()].filter(r => r.length === 2 && r.every(z => z.face_type === 'door'))
  if (cab.footprint || !pairs.length) {
    warnings.push({ code: 'BIFOLD_NEEDS_2_DOORS', message: 'Sliding bi-fold needs a row of exactly 2 doors side by side — the doors are left as normal doors', part: 'hinge' })
    return null
  }
  const doors = pairs.reduce((best, r) => (Math.max(...r.map(z => z.DY)) > Math.max(...best.map(z => z.DY)) ? r : best))
  const [a, b] = [...doors].sort((p, q) => p.X - q.X)
  const outer = hand === 'L' ? a : b
  const leading = hand === 'L' ? b : a
  const side = hand === 'L' ? 'left' : 'right'
  outer.hinge_side = side
  leading.hinge_side = side
  outer.bifold_role = 'outer'
  leading.bifold_role = 'leading'
  return { hand, outer, leading }
}

/** One handle, on the leading door at the joint (the middle of the cabinet,
 *  where the pair folds out); none on the outer door (Mark, 2026-10-30). The
 *  handle sits opposite a door's hinge side, so the leading door's is resolved
 *  as if hinged on its leading edge. After resolveHandles. */
export function bifoldHandles(cab: CabinetInput, pair: BifoldPair): void {
  const { leading, outer } = pair
  const side = leading.hinge_side
  leading.hinge_side = side === 'left' ? 'right' : 'left'
  leading.handle = resolveHandle(cab, leading)
  leading.hinge_side = side
  outer.handle = null
}

/** Fitting holes on both doors + the pair's checks. After the hinges, whose
 *  heights on the outer door the centre hinges follow. */
export function resolveBifoldHoles(
  pair: BifoldPair, r: ConstructionRules, caseParts: ResolvedCasePart[], internalParts: ResolvedInternalPart[],
  hinges: ResolvedHingeInstance[], warnings: ResolverError[],
): void {
  const { hand, outer, leading } = pair
  const B = BIFOLD
  const lead: BifoldHole[] = []
  const out: BifoldHole[] = []
  const cup = (x: number, y: number, kind: BifoldHole['kind']): BifoldHole => ({ x, y, dia: B.cupDia, depth: B.cupDepth, kind })
  // Leading edge = away from the hand; joint edges face each other.
  const leadX = hand === 'L' ? leading.DX - B.edgeIn : B.edgeIn
  const leadJoint = (d: number) => hand === 'L' ? d : leading.DX - d
  const outerJoint = (d: number) => hand === 'L' ? outer.DX - d : d

  const box = (k: ResolvedCasePart['part_key']) => { const p = caseParts.find(c => c.part_key === k); return p ? caseBox(p) : null }

  // Top carriage: under the panel over the pair (cabinet top, or a fixed shelf).
  const { top, bottom } = bifoldPanels(caseParts, internalParts, [outer, leading])
  if (top) {
    const y = top.y - B.topDrop - leading.Y
    lead.push(cup(leadX, y, 'carriage'), cup(leadX, y - B.carriagePitch, 'carriage'))
  } else {
    warnings.push({ code: 'BIFOLD_NO_TOP', message: 'Sliding bi-fold: no cabinet top or fixed shelf over the doors for the top track — no carriage holes', part: 'hinge' })
  }

  // Bottom guide.
  const mode = r.BIFOLD_BOTTOM ?? 'above'
  if (mode !== 'none' && bottom) {
    if (mode === 'above') lead.push(cup(leadX, bottom.y + bottom.h + B.guideOffset - leading.Y, 'guide'))
    else {
      lead.push(cup(leadX, bottom.y - B.guideOffset - leading.Y, 'guide'))
      const hang = bottom.y - leading.Y
      if (hang < B.belowMin) warnings.push({
        code: 'BIFOLD_BELOW_55',
        message: `Sliding bi-fold: the doors hang ${Math.round(hang)} below the cabinet bottom — the bottom track under it needs at least ${B.belowMin}`,
        part: 'hinge',
      })
    }
  } else if (mode !== 'none') {
    warnings.push({ code: 'BIFOLD_NO_BOTTOM', message: 'Sliding bi-fold: no cabinet bottom for the bottom track — no guide hole', part: 'hinge' })
  }

  // Centre hinges at the outer door's hinge heights (cabinet Y → each door's own).
  const heights = hinges
    .filter(h => !h.facet && h.row_index === outer.row_index && h.col_index === outer.col_index && !h.pie)
    .map(h => outer.Y + h.y_position_mm)
  const gap = Math.max(0, hand === 'L' ? leading.X - (outer.X + outer.DX) : outer.X - (leading.X + leading.DX))
  for (const cy of heights) {
    const yo = cy - outer.Y, yl = cy - leading.Y
    if ((r.BIFOLD_CENTRE ?? 'standard') === 'cup') {
      for (const [list, jx, y] of [[out, outerJoint, yo], [lead, leadJoint, yl]] as const) {
        list.push({ x: jx(B.cupHingeIn), y, dia: B.cupDia, depth: B.cupHingeDepth, kind: 'centre' })
        for (const dy of [B.dowelPitch / 2, -B.dowelPitch / 2])
          list.push({ x: jx(B.cupHingeIn + B.dowelOut), y: y + dy, dia: B.dowelDia, depth: B.dowelDepth, kind: 'centre' })
      }
    } else {
      const bStar = (B.stdPitch - gap) / 2
      for (const [list, jx, y] of [[out, outerJoint, yo], [lead, leadJoint, yl]] as const)
        for (const dy of [B.stdPitch / 2, -B.stdPitch / 2])
          list.push({ x: jx(bStar), y: y + dy, dia: B.stdDia, depth: B.stdDepth, kind: 'centre' })
    }
  }

  // Off the door → dropped, with a warning.
  for (const [z, list] of [[outer, out], [leading, lead]] as const) {
    const fits = list.filter(h => h.y - h.dia / 2 >= 0 && h.y + h.dia / 2 <= z.DY && h.x - h.dia / 2 >= 0 && h.x + h.dia / 2 <= z.DX)
    if (fits.length < list.length) warnings.push({ code: 'BIFOLD_HOLE_OFF_DOOR', message: `Sliding bi-fold: ${list.length - fits.length} fitting hole(s) fall off the door — check the door height`, part: 'hinge' })
    if (fits.length) z.bifold_holes = fits
  }

  // Limits.
  const ls = caseParts.find(p => p.part_key === 'left_side'), rs = caseParts.find(p => p.part_key === 'right_side')
  if (ls && rs) {
    const inL = caseBox(ls).x + caseBox(ls).w, inR = caseBox(rs).x
    if (inR - inL > B.maxInside) warnings.push({ code: 'BIFOLD_WIDTH', message: `Sliding bi-fold: inside width ${Math.round(inR - inL)} is over ${B.maxInside}`, part: 'hinge' })
    const [a, b] = hand === 'L' ? [outer, leading] : [leading, outer]
    const over = Math.max(inL - a.X, b.X + b.DX - inR)
    if (over > B.maxOverlay) warnings.push({ code: 'BIFOLD_OVERLAY', message: `Sliding bi-fold: doors overlay the gables by ${Math.round(over * 10) / 10} — ${B.maxOverlay} max`, part: 'hinge' })
  }
  if (Math.max(outer.DY, leading.DY) > B.maxHeight) warnings.push({ code: 'BIFOLD_HEIGHT', message: `Sliding bi-fold: doors over ${B.maxHeight} high`, part: 'hinge' })
  if (Math.max(outer.DZ, leading.DZ) > B.maxThick) warnings.push({ code: 'BIFOLD_THICK', message: `Sliding bi-fold: doors over ${B.maxThick} thick`, part: 'hinge' })
}
