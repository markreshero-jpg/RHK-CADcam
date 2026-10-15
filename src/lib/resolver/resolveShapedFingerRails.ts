// ============================================================
// Finger-pull backing rails on shaped cabinets (z_cabinet_shape, BCNP finger
// pull — Mark, 2026-10-15: "the gables don't get checked out nor set back to
// allow for backing rail").
//
// The box version (resolveFingerRails) works along cabinet X between the left /
// right sides. Here each front facet gets its own rails, in the facet's frame:
//   • heights per door exactly as the box (RAILH / RAILUP / the gap, clamped to
//     the carcass), merged per facet
//   • along the facet's line, front face on it, the rail thickness inward, from
//     end to end of the facet — through the end panel to its outer face, like
//     the box rail through a side
//   • at an inside (pie) corner between two railed facets the earlier facet's
//     rail runs on by the other's thickness, closing the corner; the later one
//     butts against it (the same order as the top rails)
//   • the end panel each rail ends in is notched at its front edge (box side →
//     side frame; turned `side:<edge>` → face frame)
//   • a rail at the carcass top pushes that facet's top rail back by its
//     thickness (pushFrontRailBack), and the rail butting it at the pie corner
//     grows to meet it.
// Rails are `fprail:<n>` face-kind case parts turned AY, oriented like the box
// rails: local +Z (the "face", drawn in the door's colour) is the front, so
// the part starts at the far end of its run, one thickness in, and runs back.
// No internal dividers on shaped cabinets yet.
// ============================================================

import type { CabinetInput, ConstructionRules, ResolvedCasePart, ResolvedFaceZone } from './types'
import { DEFAULT_RULES } from './types'
import type { FootprintSegment } from '../cabinetShape/footprint'
import { edgeFrame } from '../cabinetShape/construct'
import { shapedInterior } from './resolveShapedCase'
import { notchPanels } from './resolveFingerRails'
import { rotEulerXYZ } from '../jointDrilling'

const EPS = 0.01
const NEAR = 1     // mm — "on this line"

interface FacetRail {
  seg: number            // index into segs
  bottom: number; top: number
  sMin: number; sMax: number
  thickness: number
  material_id: string
}

const rotY = (deg: number, x: number, z: number) => {
  const [rx, , rz] = rotEulerXYZ(0, deg, 0, x, 0, z)
  return { x: rx, z: rz }
}

export function shapedFingerRails(
  cab: CabinetInput, r: ConstructionRules, zones: ResolvedFaceZone[], caseParts: ResolvedCasePart[],
): ResolvedCasePart[] {
  const shape = shapedInterior(cab)
  if (!shape || r.FPRAIL === false) return []
  const { segs } = shape
  const n = segs.length
  const isFront = (q: FootprintSegment) => q.type === 'line' && q.edge.role === 'front'

  // Carcass height from the panels the rails sit in.
  const sideH = (p: ResolvedCasePart) => p.part_key.startsWith('side:') ? p.DX : p.DY
  const panels = caseParts.filter(p => p.part_key === 'left_side' || p.part_key === 'right_side' || p.part_key.startsWith('side:'))
  if (!panels.length) return []
  const carcTop = Math.max(...panels.map(p => p.Y + sideH(p)))
  const carcBot = Math.min(...panels.map(p => p.Y))
  const down = Math.max(r.RAILH - DEFAULT_RULES.FPGAP - r.RAILUP, 0)

  // 1. One rail per finger-gap front, on the facet the front sits on.
  const found: FacetRail[] = []
  for (const z of zones) {
    const h = z.handle
    if (!h?.finger_gap) continue
    const c = rotY(z.AY ?? 0, z.DX / 2, z.DZ / 2)
    const cx = z.X + c.x, cz = z.Z + c.z
    const zu = rotY(z.AY ?? 0, 1, 0)
    const seg = segs.findIndex(s => {
      if (!isFront(s)) return false
      const f = edgeFrame(s)
      if (Math.abs(Math.abs(zu.x * f.u.x + zu.z * f.u.y) - 1) > 1e-3) return false
      const along = (cx - s.p0.x) * f.u.x + (cz - s.p0.y) * f.u.y
      const off = -((cx - s.p0.x) * f.n.x + (cz - s.p0.y) * f.n.y)   // in front of the line
      return along > 0 && along < f.len && off > -NEAR && off < z.DZ + r.FACBUF + 10
    })
    if (seg < 0) continue
    const gap = h.finger_gap_mm ?? r.FPGAP
    let bottom: number, top: number
    if (h.grip_edge === 'top') {
      const gapLo = z.Y + z.DY
      bottom = gapLo - down
      top = Math.min(gapLo + gap + r.RAILUP, carcTop)
    } else {
      const gapHi = z.Y
      top = gapHi + down
      bottom = Math.max(gapHi - gap - r.RAILUP, carcBot)
    }
    if (top - bottom <= EPS) continue
    found.push({ seg, bottom, top, sMin: 0, sMax: edgeFrame(segs[seg]).len, thickness: z.DZ, material_id: z.material_id })
  }

  // 2. Fronts on one facet sharing a seam share a rail.
  const rails: FacetRail[] = []
  for (const rl of found.sort((a, b) => a.seg - b.seg || a.bottom - b.bottom)) {
    const prev = rails.find(m => m.seg === rl.seg && rl.bottom < m.top - EPS && rl.top > m.bottom + EPS)
    if (!prev) { rails.push({ ...rl }); continue }
    prev.bottom = Math.min(prev.bottom, rl.bottom); prev.top = Math.max(prev.top, rl.top)
  }

  // 3. Inside corners between two railed facets: the earlier runs on by the
  //    other's thickness, the later butts.
  const concave = (a: FootprintSegment, b: FootprintSegment) => {
    const fa = edgeFrame(a), fb = edgeFrame(b)
    return fa.u.x * fb.u.y - fa.u.y * fb.u.x < -1e-9
  }
  const meets = (a: FacetRail, b: FacetRail) => Math.min(a.top, b.top) - Math.max(a.bottom, b.bottom) > EPS
  for (const rl of rails) {
    const i = rl.seg, s = segs[i]
    const ni = (i + 1) % n, pi = (i - 1 + n) % n
    if (isFront(segs[ni]) && concave(s, segs[ni]) && i < ni) {
      const o = rails.find(m => m.seg === ni && meets(m, rl))
      if (o) rl.sMax += o.thickness
    }
    if (isFront(segs[pi]) && concave(segs[pi], s) && pi > i) {
      const o = rails.find(m => m.seg === pi && meets(m, rl))
      if (o) rl.sMin -= o.thickness
    }
  }

  // 4. Notch the end panel each rail ends in (not at a pie corner).
  const panelOn = (q: FootprintSegment): ResolvedCasePart | undefined => {
    if (q.type !== 'line') return undefined
    const atX = (x: number) => Math.abs(q.p0.x - x) < NEAR && Math.abs(q.p1.x - x) < NEAR
    return caseParts.find(p => p.part_key === `side:${q.edge.id}`)
      ?? (atX(0) ? caseParts.find(p => p.part_key === 'left_side') : undefined)
      ?? (atX(cab.DX) ? caseParts.find(p => p.part_key === 'right_side') : undefined)
  }
  const ends = new Map<ResolvedCasePart, { front: { x: number; y: number }; rails: FacetRail[] }>()
  for (const rl of rails) {
    const s = segs[rl.seg]
    for (const [nb, corner] of [[segs[(rl.seg - 1 + n) % n], s.p0], [segs[(rl.seg + 1) % n], s.p1]] as const) {
      if (isFront(nb)) continue
      const p = panelOn(nb)
      if (!p) continue
      const e = ends.get(p) ?? { front: corner, rails: [] }
      e.rails.push(rl)
      ends.set(p, e)
    }
  }
  for (const [p, e] of ends) {
    // A proxy in the side frame (x = depth from the back, front at x = D), all
    // the panel's rails crossing its thickness.
    const face = p.part_key.startsWith('side:')
    const D = face ? p.DY : p.DX, H = sideH(p)
    const proxy: { X: number; Y: number; DX: number; DY: number; DZ: number; outline?: { x: number; y: number }[] } =
      { X: 0, Y: p.Y, DX: D, DY: H, DZ: 1 }
    notchPanels([proxy], e.rails.map(rl => ({
      key: 'fprail:0' as const, bottom: rl.bottom, top: rl.top, x0: 0, x1: 1, frontZ: 0, thickness: rl.thickness, material_id: rl.material_id,
    })), r.RAILCUT)
    if (!proxy.outline) continue
    if (!face) {
      // Box side: front at Z + DX. Mirror when the facet sits at its Z end.
      const atBack = Math.abs(e.front.y - p.Z) < NEAR
      p.outline = atBack ? proxy.outline.map(q => ({ x: D - q.x, y: q.y })) : proxy.outline
    } else {
      // Face frame: x along the length from the outer start (X, Z), y down.
      p.outline = Math.hypot(e.front.x - p.X, e.front.y - p.Z) < NEAR + p.DZ
        ? proxy.outline.map(q => ({ x: D - q.x, y: q.y }))
        : proxy.outline
    }
  }

  // 5. A rail at the carcass top takes the place of the facet's top rail:
  //    push that back by the rail's thickness; the top rail butting it at the
  //    pie corner grows to meet it.
  const topRailOf = (i: number) => caseParts.find(p => p.part_key === `rail:${segs[i].edge.id}`)
  // The facet whose top rail runs through at the inside corner with facet j.
  const throughAt = (i: number, j: number) => isFront(segs[i]) && isFront(segs[j]) && (
    (j === (i + 1) % n && i < j && concave(segs[i], segs[j])) ||
    (j === (i - 1 + n) % n && j > i && concave(segs[j], segs[i])))
  const pushed = new Map<number, number>()
  for (const rl of rails) {
    const tr = topRailOf(rl.seg)
    if (!tr || pushed.has(rl.seg)) continue
    const trTop = tr.Y + (tr.upright ? tr.DX : tr.DZ)
    if (!(rl.top >= trTop - EPS && rl.bottom < trTop)) continue
    const f = edgeFrame(segs[rl.seg])
    tr.X += f.n.x * rl.thickness; tr.Z += f.n.y * rl.thickness
    pushed.set(rl.seg, rl.thickness)
  }
  for (const [i, t] of pushed) {
    for (const j of [(i + 1) % n, (i - 1 + n) % n]) {
      const tr = topRailOf(j)
      if (!tr || !throughAt(i, j)) continue
      // Its end at the corner vertex follows the through rail back.
      const V = j === (i + 1) % n ? segs[i].p1 : segs[i].p0
      const fj = edgeFrame(segs[j])
      const end = { x: tr.X + fj.u.x * tr.DY, y: tr.Z + fj.u.y * tr.DY }
      if (Math.hypot(tr.X - V.x, tr.Z - V.y) <= Math.hypot(end.x - V.x, end.y - V.y)) {
        tr.X -= fj.u.x * t; tr.Z -= fj.u.y * t
      }
      tr.DY += t
    }
  }

  // 6. The rail parts (face kind: DX = height, DY = length, DZ = thickness).
  return rails
    .sort((a, b) => a.bottom - b.bottom || a.seg - b.seg)
    .map((rl, k) => {
      const f = edgeFrame(segs[rl.seg])
      const s0 = segs[rl.seg].p0
      // Local x = −u from the far end, local z = −n (out to the front face).
      const o = { x: s0.x + f.u.x * rl.sMax + f.n.x * rl.thickness, y: s0.y + f.u.y * rl.sMax + f.n.y * rl.thickness }
      return {
        grain_direction: r.RAILGRAIN ?? 'horizontal',
        fprail: { cut: r.RAILCUT, blockSetback: r.RAILBLK, blockDia: r.RAILBLKD, blockDepth: r.RAILBLKZ, shaped: true },
        part_key: `fprail:${k}`,
        DX: rl.top - rl.bottom, DY: rl.sMax - rl.sMin, DZ: rl.thickness,
        X: o.x, Y: rl.bottom, Z: o.y,
        AX: 0, AY: Math.atan2(f.u.y, -f.u.x) * 180 / Math.PI, AZ: 0,
        material_id: rl.material_id,
        edge_band: { top: false, bottom: false, left: false, right: false },
      } as ResolvedCasePart
    })
}
