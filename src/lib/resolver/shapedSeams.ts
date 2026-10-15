// ── Shaped-cabinet seams (z_cabinet_shape L3) ─────────────────────────────────
// The legacy seam list (resolveJoints) only pairs the box parts — left/right
// side, bottom, top / rails, back. A shaped cabinet adds per-edge panels
// (side:<edge>, back:<edge>) and facet rails (rail:<edge>), often turned about
// Y, and none of them got joints. This finds them geometrically: in a frame
// turned so the receiving panel faces ±X, a part whose end sits on that face
// (overlapping it in height and depth) is a seam. The drilling then reuses the
// legacy X-normal code in that frame (jointDrilling.shapedSeamDrillOps).
//
// The receiving panel may stand at any angle (z_angled_filler); the meeting
// part must be square to it — a panel end-on, or a bottom / top / rail with an
// edge along its face. Angled butts and mitres between panels stay hand-fixed.
// Pure — shared by the resolver and the canvasDB seam reconstruction.

import type { ResolvedCasePart, ResolvedInternalPart, ResolvedSeamJoint } from './types'
import { turnedBox, partPlan, squareIn, panelTurn, contactSpan, runsAlongX, type PlanPart } from '../jointDrilling'

const TOUCH = 1      // carcass parts: end on the face within this (mm)
const MAX_GAP = 30   // shelves: clearance to their support (matches enumerateInternalSeams)
const MIN_OVERLAP = 1

export interface ShapedSeamCandidate {
  seam_key:     string
  part_a_key:   string
  part_b_key:   string
  generic_key:  string        // CM default key, e.g. "bottom:left_side"
  shaped:       NonNullable<ResolvedSeamJoint['shaped']>
  internal_edge?: 'left' | 'right'   // shelf ↔ panel seams use the internal drill path
  bank?:        { y0: number; y1: number }
}

type Role = 'side' | 'back' | 'bottom' | 'top' | 'rail'

function roleOf(k: string): Role | null {
  if (k === 'left_side' || k === 'right_side' || k.startsWith('side:')) return 'side'
  if (k === 'back' || k.startsWith('back:')) return 'back'
  if (k === 'bottom') return 'bottom'
  if (k === 'full_top') return 'top'
  if (k === 'front_rail' || k === 'back_rail' || k.startsWith('rail:')) return 'rail'
  return null
}

const LEGACY = new Set(['left_side', 'right_side', 'back', 'bottom', 'full_top', 'front_rail', 'back_rail'])
const isShapedKey = (k: string) => !LEGACY.has(k)

// Which part pairs can join, part A's end on part B's face.
function pairAllowed(a: Role, b: Role): boolean {
  if (b === 'side') return a === 'bottom' || a === 'top' || a === 'rail' || a === 'back'
  if (b === 'back') return a === 'side' || a === 'back' || a === 'rail'
  if (b === 'rail') return a === 'rail'
  return false
}

// The legacy CM key a shaped seam inherits its joint from.
function genericKey(aKey: string, a: Role, side: 'left' | 'right'): string {
  const s = side === 'left' ? 'left_side' : 'right_side'
  if (a === 'bottom') return `bottom:${s}`
  if (a === 'top') return `full_top:${s}`
  if (a === 'rail') return `${aKey === 'back_rail' ? 'back_rail' : 'front_rail'}:${s}`
  return `back:${s}`
}

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0)

/** Part A's end on part B's face in B's turned frame → which side of B it's on. */
function touchSide(a: ReturnType<typeof turnedBox>, b: ReturnType<typeof turnedBox>, maxGap: number): 'left' | 'right' | null {
  const plus = a.x - (b.x + b.w), minus = b.x - (a.x + a.w)
  // A to +X of B → B is the LEFT support of A (seamDrillOps' isLeft).
  if (plus >= -TOUCH && plus <= maxGap) return 'left'
  if (minus >= -TOUCH && minus <= maxGap) return 'right'
  return null
}

export function enumerateShapedSeams(
  caseParts: ResolvedCasePart[],
  internalParts: ResolvedInternalPart[] = [],
  opts?: { adjFullBank?: boolean },
): ShapedSeamCandidate[] {
  // Only shaped cabinets: plain boxes keep the legacy list untouched.
  if (!caseParts.some(p => isShapedKey(p.part_key) && roleOf(p.part_key))) return []
  const out: ShapedSeamCandidate[] = []
  const plans = new Map<string, PlanPart>()
  for (const p of caseParts) if (roleOf(p.part_key)) plans.set(p.part_key, partPlan(p))

  // ── Carcass: part A's end on panel B's face ──
  for (const pb of caseParts) {
    const rb = roleOf(pb.part_key)
    if (!rb || rb === 'bottom' || rb === 'top') continue
    const B = plans.get(pb.part_key)!
    // Only a standing panel has a face to drill through — a flat rail's edge
    // isn't one (flat rails meeting at a pie corner are hand-fixed).
    if (!B.vertical) continue
    const turn = panelTurn(B)
    if (turn == null) continue
    const bB = turnedBox(B, turn)
    for (const pa of caseParts) {
      const ra = roleOf(pa.part_key)
      if (!ra || pa === pb || !pairAllowed(ra, rb)) continue
      if (!isShapedKey(pa.part_key) && !isShapedKey(pb.part_key)) continue   // legacy pair
      const A = plans.get(pa.part_key)!
      const square = squareIn(A, turn)
      const bA = turnedBox(A, turn)
      // A vertical panel must meet B end-on, not lie along it.
      if ((A.vertical || ra === 'rail') && bA.w <= bA.d) continue
      if (overlap(bA.y, bA.y + bA.h, bB.y, bB.y + bB.h) < MIN_OVERLAP) continue
      if (overlap(bA.z, bA.z + bA.d, bB.z, bB.z + bB.d) < MIN_OVERLAP) continue
      const side = touchSide(bA, bB, TOUCH)
      if (!side) continue
      // Not square in B's frame (an angled panel, z_angled_filler): a panel
      // must still stand square to B with its end on B's face (an angled butt
      // or mitre stays hand-fixed); a bottom / top / rail needs an edge lying
      // along B's face.
      if (!square) {
        if (A.vertical && !runsAlongX(A, turn)) continue
        const cs = contactSpan(A, turn, side)
        if (!cs || overlap(cs.z0, cs.z1, bB.z, bB.z + bB.d) < MIN_OVERLAP) continue
      }
      // Two panels touching each other's ends both ways round: keep one.
      if (out.some(c => c.part_a_key === pb.part_key && c.part_b_key === pa.part_key)) continue
      out.push({
        seam_key: `${pa.part_key}|${pb.part_key}`, part_a_key: pa.part_key, part_b_key: pb.part_key,
        generic_key: genericKey(pa.part_key, ra, side),
        shaped: { turn, kind: 'side', side },
      })
    }
  }

  // ── Per-edge backs on the bottom (the legacy back:bottom seam, turned) ──
  const bottom = caseParts.find(p => p.part_key === 'bottom')
  if (bottom) {
    const Bt = plans.get('bottom')!
    for (const p of caseParts) {
      if (!p.part_key.startsWith('back:')) continue
      const P = plans.get(p.part_key)!
      const t0 = panelTurn(P)
      if (t0 == null) continue
      // The back lies along X with the bottom in front of it (+Z), as the box back.
      for (const turn of [t0 + 90, t0 - 90]) {
        const bP = turnedBox(P, turn), bBt = turnedBox(Bt, turn)
        if (bBt.z + bBt.d / 2 <= bP.z + bP.d / 2) continue
        if (overlap(bP.x, bP.x + bP.w, bBt.x, bBt.x + bBt.w) < MIN_OVERLAP) break
        if (bBt.z > bP.z + bP.d + TOUCH || bBt.z + bBt.d < bP.z - TOUCH) break
        out.push({
          seam_key: `${p.part_key}|bottom`, part_a_key: p.part_key, part_b_key: 'bottom',
          generic_key: 'back:bottom', shaped: { turn: ((turn % 360) + 360) % 360, kind: 'back_bottom', side: 'left' },
        })
        break
      }
    }
  }

  // ── Shelves on per-edge side panels, and on the backs of a multi-back
  // cabinet (L corner) — a shelf that long needs pins along its back edges
  // too (Mark, 2026-10-15). Back pins inherit the shelf's side joint. ──
  const intKey = (p: ResolvedInternalPart) => `int_${p.part_type}_${p.sort_order}`
  const shelves = internalParts.filter(p => p.part_type === 'adj_shelf' || p.part_type === 'fixed_shelf')
  // Horizontal anchors bounding a full-bank compartment (as enumerateInternalSeams).
  const anchors = [
    ...caseParts.filter(p => p.part_key === 'bottom' || p.part_key === 'full_top').map(p => ({ y0: p.Y, y1: p.Y + p.DZ })),
    ...internalParts.filter(p => p.part_type === 'fixed_shelf').map(p => ({ y0: p.Y, y1: p.Y + p.DZ })),
  ]
  const multiBack = caseParts.filter(p => roleOf(p.part_key) === 'back').length > 1
  for (const pb of caseParts) {
    if (!pb.part_key.startsWith('side:') && !(multiBack && roleOf(pb.part_key) === 'back')) continue
    const B = plans.get(pb.part_key)!
    const turn = panelTurn(B)
    if (turn == null) continue
    const bB = turnedBox(B, turn)
    const hits: { p: ResolvedInternalPart; side: 'left' | 'right' }[] = []
    for (const s of shelves) {
      const S = partPlan(s)
      if (!squareIn(S, turn)) continue
      const bS = turnedBox(S, turn)
      const midY = s.Y + s.DZ / 2
      if (midY < bB.y || midY > bB.y + bB.h) continue
      if (overlap(bS.z, bS.z + bS.d, bB.z, bB.z + bB.d) < MIN_OVERLAP) continue
      const side = touchSide(bS, bB, MAX_GAP)
      if (side) hits.push({ p: s, side })
    }
    // Pins on a back use the method's back-support joint (one centred row, Mark
    // 2026-10-15), falling back to the side joint.
    const fam = roleOf(pb.part_key) === 'back' ? 'back' : 'side'
    const bankAdj = opts?.adjFullBank ? hits.filter(h => h.p.part_type === 'adj_shelf') : []
    for (const h of hits) {
      if (bankAdj.includes(h)) continue
      const key = intKey(h.p)
      out.push({
        seam_key: `${key}|${pb.part_key}`, part_a_key: key, part_b_key: pb.part_key,
        generic_key: `${h.p.part_type}:${fam}`, shaped: { turn, kind: 'side', side: h.side }, internal_edge: h.side,
      })
    }
    if (bankAdj.length) {
      const anchor = bankAdj.reduce((a, b) => (a.p.sort_order <= b.p.sort_order ? a : b))
      const lo = Math.min(...bankAdj.map(h => h.p.Y)), hi = Math.max(...bankAdj.map(h => h.p.Y + h.p.DZ))
      const below = anchors.filter(a => a.y1 <= lo + 0.5).map(a => a.y1)
      const above = anchors.filter(a => a.y0 >= hi - 0.5).map(a => a.y0)
      const bank = { y0: below.length ? Math.max(...below) : bB.y, y1: above.length ? Math.min(...above) : bB.y + bB.h }
      if (bank.y1 > bank.y0) {
        const key = intKey(anchor.p)
        out.push({
          seam_key: `${key}|${pb.part_key}`, part_a_key: key, part_b_key: pb.part_key,
          generic_key: `adj_shelf:${fam}`, shaped: { turn, kind: 'side', side: anchor.side }, internal_edge: anchor.side, bank,
        })
      }
    }
  }

  return out
}
