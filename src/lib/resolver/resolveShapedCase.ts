// ============================================================
// Shaped-cabinet case (z_cabinet_shape Phase 2).
//
// Runs AFTER resolveCaseParts: the rectangular build already carries every
// joinery / height rule (BACK_JOIN, BOTTOM_JOIN, scribes, top type), so this
// pass only reshapes it to the footprint:
//   - a side/back edge that sits where the box part sits (side on x = 0 or
//     x = DX, back on y = 0) keeps its legacy key (left_side / right_side /
//     back) — trimmed to the edge — so hinges, seams, drilling and the cut list
//     keep working for it;
//   - every other side/back edge becomes `side:<edge>` / `back:<edge>`: a
//     'face'-kind panel (DY length, DX height, DZ thickness inward) rotated AY
//     about its outer start corner;
//   - box parts with no edge left to stand on are dropped;
//   - bottom / top / rails are clipped to the inside of the outline and carry
//     the clipped outline; front facets get their own `rail:<edge>`.
// Square corners are butts (priority from BACK_JOIN). Angled corners (4a):
// ANGLE_JOIN butt_bevel (the same priority; the stopping panel's end bevelled
// against the through panel, whose end lies flush in the outline) or mitre;
// a panel end at an angled front / open edge stays square unless its edge is
// in footprint.flush_ends (then bevelled flush with it).
// Panels are listed at their blank length; bevel_lo / bevel_hi say how the
// ends are cut (jointDrilling.caseBevelOutline).
// ============================================================

import type { CabinetInput, ConstructionRules, ResolvedCasePart, ResolvedInternalPart, ResolverError } from './types'
import { edgeSub, type Footprint, type FootprintSegment } from '../cabinetShape/footprint'
import { arcGeom, mapOutline, restoreArcs, type Circle, type EdgeTag, type OutlinePt, type ShapePt } from '../shapePath'
import {
  canonicalSegments, edgeFrame, insetPolygon, clipToRect, clipToConvex, bbox, isBoxLike, vertexTrim,
  angledEnd, interiorAngle,
} from '../cabinetShape/construct'
import { facetDoorRun } from './resolveShapedFace'
import { caseBackT } from './resolveCase'

const NEAR = 0.5   // mm — "this edge sits on the box side"
const ANGLE_TOL = 0.5   // degrees — corners this close to 90° keep the square butt

const isPanelRole = (s: FootprintSegment) =>
  s.type === 'line' && (s.edge.role === 'side' || s.edge.role === 'back')

// ── Edge sub-types (z_cabinet_shape_edit E1) ────────────────────
// What a panel edge builds, from its sub-type:
//   finished   the panel in the exposed board + exposed tape, at that board's
//              thickness (decision 5)
//   applied    a carcass gable set in by the exposed board's thickness, and an
//              applied end panel (`ap:<edge>`) on the outline outside it
//   scribe     the panel set in from the outline by the edge's scribe allowance
//              (unset = the rules' SCRL / SCRR / SCRBK, which the box build
//              already applies on the box edges — so only the extra moves it)
// The default sub-types build exactly what the shape did before E1.

/** The box edge a footprint edge sits on, if any. */
function boxSlot(cab: CabinetInput, s: FootprintSegment): 'left' | 'right' | 'back' | null {
  if (s.type !== 'line') return null
  if (s.edge.role === 'back') return Math.abs(s.p0.y) < NEAR && Math.abs(s.p1.y) < NEAR ? 'back' : null
  if (s.edge.role !== 'side') return null
  if (Math.abs(s.p0.x) < NEAR && Math.abs(s.p1.x) < NEAR) return 'left'
  if (Math.abs(s.p0.x - cab.DX) < NEAR && Math.abs(s.p1.x - cab.DX) < NEAR) return 'right'
  return null
}

export interface EdgeBuild {
  /** Panel thickness. */
  t: number
  /** The panel's outer face stands this far in from the outline (beyond the rules' scribe on a box edge). */
  off: number
  /** Board + tape for a finished panel; unset = the box part's own. */
  material_id?: string
  tape?: string
  /** Applied end panel on the outline (sub 'applied'). */
  applied?: { t: number; material_id: string; tape?: string }
}

/** How a side / back edge is built. Null for any other edge. */
export function edgeBuild(cab: CabinetInput, s: FootprintSegment): EdgeBuild | null {
  if (!isPanelRole(s)) return null
  const t = cab.material.DZ
  const exp = cab.exposed_material
  const sub = edgeSub(s.edge)
  if (sub === 'finished') return { t: exp.DZ, off: 0, material_id: exp.id, tape: cab.exposed_edgeband_id }
  if (sub === 'applied' && s.edge.role === 'side')
    return { t, off: exp.DZ, applied: { t: exp.DZ, material_id: exp.id, tape: cab.exposed_edgeband_id } }
  if (sub === 'scribe') {
    const slot = boxSlot(cab, s), r = cab.rules
    const rule = slot === 'left' ? r.SCRL : slot === 'right' ? r.SCRR : slot === 'back' ? r.SCRBK : 0
    return { t, off: Math.max(0, (s.edge.scribe ?? rule ?? 0) - (rule ?? 0)) }
  }
  return { t, off: 0 }
}

/** Where the panel line of edge `s` stands in from the outline, for joining
 *  its neighbours. On a box edge whose panel the sub-type moves or thickens,
 *  that includes the rules' scribe (the box part's outer face is there); an
 *  unchanged edge stays on the outline, as before E1. */
function panelLineOff(cab: CabinetInput, s: FootprintSegment, b: EdgeBuild | null): number {
  if (!b) return 0
  const slot = boxSlot(cab, s)
  if (!slot) return b.off
  if (!b.off && Math.abs(b.t - cab.material.DZ) < 1e-6) return 0
  const r = cab.rules
  return b.off + (slot === 'left' ? r.SCRL : slot === 'right' ? r.SCRR : r.SCRBK)
}

/** How far in from the outline the inside of the carcass is on edge `s`. */
function insetOf(cab: CabinetInput, s: FootprintSegment): number {
  const b = edgeBuild(cab, s)
  return b ? b.off + b.t : 0
}

/** A box edge whose panel E1 sets in or thickens: where the box build put
 *  that panel's inner face (`at`) and how much further in it now is (`d`). */
type FaceShift = { at: number; d: number }
type FaceShifts = { l?: FaceShift; r?: FaceShift; b?: FaceShift }

function boxFaceShifts(cab: CabinetInput, r: ConstructionRules, segs: FootprintSegment[]): FaceShifts {
  const T = cab.material.DZ
  const out: FaceShifts = {}
  for (const s of segs) {
    const slot = boxSlot(cab, s)
    const b = slot && edgeBuild(cab, s)
    if (!slot || !b) continue
    const d = b.off + b.t - T
    if (Math.abs(d) < 1e-6) continue
    if (slot === 'left') out.l ??= { at: r.SCRL + T, d }
    else if (slot === 'right') out.r ??= { at: cab.DX - r.SCRR - T, d }
    else if (caseBackT(cab, r) > 0) out.b ??= { at: r.SCRBK + T, d }
  }
  return out
}

/** A horizontal part's clip-rect edges, moved where its box rect stopped at a
 *  shifted panel (`grow` edges — no panel there — win). */
function shiftedGrow(
  p: { X: number; Z: number; DY: number }, sh: FaceShifts, grow: { x0?: number; x1?: number; z0?: number },
): { x0?: number; x1?: number; z0?: number } {
  const g = { ...grow }
  if (sh.l && g.x0 == null && p.X >= sh.l.at - NEAR) g.x0 = p.X + sh.l.d
  if (sh.r && g.x1 == null && p.X + p.DY <= sh.r.at + NEAR) g.x1 = p.X + p.DY - sh.r.d
  if (sh.b && g.z0 == null && p.Z >= sh.b.at - NEAR) g.z0 = p.Z + sh.b.d
  return g
}

/** The segments with every panel edge's line moved in by its `off`; a moved
 *  edge's vertices are re-found where it meets its neighbours' lines (an arc
 *  by its chord). Unmoved geometry is returned as is. */
function offsetPanelLines(segs: FootprintSegment[], offs: number[]): FootprintSegment[] {
  if (offs.every(o => !o)) return segs
  const n = segs.length
  const lines = segs.map((s, i) => {
    const f = edgeFrame(s)
    return { p: { x: s.p0.x + f.n.x * offs[i], y: s.p0.y + f.n.y * offs[i] }, u: f.u }
  })
  const V = segs.map((s, i) => {
    const ia = (i - 1 + n) % n
    if (!offs[ia] && !offs[i]) return s.p0
    const A = lines[ia], B = lines[i]
    const cr = A.u.x * B.u.y - A.u.y * B.u.x
    if (Math.abs(cr) < 1e-9) return B.p
    const k = ((B.p.x - A.p.x) * B.u.y - (B.p.y - A.p.y) * B.u.x) / cr
    return { x: A.p.x + A.u.x * k, y: A.p.y + A.u.y * k }
  })
  return segs.map((s, i) => ({ ...s, p0: V[i], p1: V[(i + 1) % n] }))
}

export interface ShapedInterior {
  segs: FootprintSegment[]
  outline: ShapePt[]   // plan polygon of the footprint
  inner: ShapePt[]     // inside of the carcass panels
  /** The footprint's arcs (they never carry panels, so every inset keeps them
   *  on the outline) — clipped parts get them back as true arcs. */
  arcs: Circle[]
}

/** Plan polygons for a shaped cabinet, or null for a plain box. */
export function shapedInterior(cab: CabinetInput): ShapedInterior | null {
  if (!cab.footprint?.segments?.length) return null
  const segs = canonicalSegments(cab.footprint, cab.DX, cab.DZ)
  if (segs.length < 3) return null
  return {
    segs,
    outline: insetPolygon(segs, () => 0),
    inner: insetPolygon(segs, s => insetOf(cab, s)),
    arcs: segs.flatMap(s => {
      const g = s.type === 'arc' ? arcGeom(s.p0, s.p1, s.rx ?? 0, s.ry ?? 0, s.largeArc ?? 0, s.sweep ?? 0) : null
      return g ? [{ c: { x: g.cx, y: g.cy }, r: g.rx }] : []
    }),
  }
}

/**
 * The footprint edge a case panel stands on, and whether that panel has an end
 * at an angled front / open edge (so it can be bevelled flush — the 3D
 * right-click option). Mirrors the legacy-slot matching in shapeCaseParts.
 */
export function panelFrontEnd(
  fp: Footprint | null | undefined, w: number, d: number, partKey: string,
): { edgeId: string; flush: boolean } | null {
  if (!fp?.segments?.length) return null
  const segs = canonicalSegments(fp, w, d)
  const n = segs.length
  const at = (x: number) => (s: FootprintSegment) => Math.abs(s.p0.x - x) < NEAR && Math.abs(s.p1.x - x) < NEAR
  const pick = partKey === 'left_side' ? segs.find(s => s.type === 'line' && s.edge.role !== 'back' && isPanelRole(s) && at(0)(s))
    : partKey === 'right_side' ? segs.find(s => s.type === 'line' && s.edge.role !== 'back' && isPanelRole(s) && at(w)(s))
    : partKey === 'back' ? segs.find(s => s.type === 'line' && s.edge.role === 'back' && Math.abs(s.p0.y) < NEAR && Math.abs(s.p1.y) < NEAR)
    : /^(side|back):/.test(partKey) ? segs.find(s => s.edge.id === partKey.slice(partKey.indexOf(':') + 1))
    : undefined
  if (!pick) return null
  const i = segs.indexOf(pick)
  const prev = segs[(i - 1 + n) % n], next = segs[(i + 1) % n]
  const angledFront = (nb: FootprintSegment, alpha: number) => nb.type === 'line'
    && (nb.edge.role === 'front' || nb.edge.role === 'open')
    && Math.abs(alpha - 90) > ANGLE_TOL && alpha < 180 - ANGLE_TOL
  if (!angledFront(prev, interiorAngle(prev, pick)) && !angledFront(next, interiorAngle(pick, next))) return null
  return { edgeId: pick.edge.id, flush: (fp.flush_ends ?? []).includes(pick.edge.id) }
}

// Clip a horizontal part (plan rect X..X+DY × Z..Z+DX) to `poly`. Returns null
// when nothing is left. The outline is in the horizontal shape frame: x across
// from the part's X, y DOWN from its front edge (PartViewer.buildShapedGeometry).
// Edges cut from a footprint arc come back as one true arc (a bulge — shapePath
// OutlinePt), so the part shows and cuts a radius, not 5° flats. Each edge is
// tagged with the band flag it takes (tagEdges).
function clipHorizontal<P extends { X: number; Z: number; DX: number; DY: number; outline?: OutlinePt[] }>(
  p: P, poly: ShapePt[], sh: Pick<ShapedInterior, 'segs' | 'arcs'>, grow?: { x0?: number; x1?: number; z0?: number },
): P | null {
  const x0 = grow?.x0 ?? p.X, x1 = grow?.x1 ?? p.X + p.DY
  const z0 = grow?.z0 ?? p.Z, z1 = p.Z + p.DX
  const clipped = clipToRect(poly, x0, z0, x1, z1)
  if (clipped.length < 3) return null
  const b = bbox(clipped)
  if (b.x1 - b.x0 < 1 || b.y1 - b.y0 < 1) return null
  const next = { ...p, X: b.x0, Z: b.y0, DY: b.x1 - b.x0, DX: b.y1 - b.y0 }
  if (isBoxLike(clipped)) { delete next.outline; return next }
  // y flips into the shape frame — a reflection, so each arc turns the other way.
  next.outline = mapOutline(tagEdges(restoreArcs(clipped, sh.arcs), sh.segs), q => ({ x: q.x - b.x0, y: b.y1 - q.y }), true)
  return next
}

// O5: which of a horizontal's edge-band flags each plan-outline edge takes, so
// the optimiser deducts the tape on the right edges of an L / clipped / radius
// part. top = front, bottom = back, left / right = the ends (PartViewer
// edgeStrips, horizontal). In order:
//   - an arc, or an edge on a footprint front → front, whichever way it faces
//     (a pie corner's second leg);
//   - an edge along a panel (its inside face, a shelf's pin clearance off it) →
//     back for a back panel; for a side panel the end it stands at — left / right
//     by which half of the cabinet it is in (a pie corner's end2 panel closes
//     the side leg at the front, and is still the right-hand end);
//   - anything else (a clip line, an open end) → the way it faces.
const PANEL_REACH = 45   // mm — how far in from a panel line an edge still "sits against" it
function tagEdges(pts: OutlinePt[], segs: FootprintSegment[]): OutlinePt[] {
  const n = pts.length
  let area = 0
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a.x * b.y - b.x * a.y }
  const midX = segs.reduce((m, s) => Math.max(m, s.p0.x, s.p1.x), 0) / 2
  // Distance off the segment's line, and whether q lies within its length.
  const rel = (q: ShapePt, s: FootprintSegment) => {
    const f = edgeFrame(s)
    const along = (q.x - s.p0.x) * f.u.x + (q.y - s.p0.y) * f.u.y
    return { off: Math.abs((q.x - s.p0.x) * f.u.y - (q.y - s.p0.y) * f.u.x), within: along > -NEAR && along < f.len + NEAR, u: f.u }
  }
  const fronts = segs.filter(s => s.type === 'line' && s.edge.role === 'front')
  const panels = segs.filter(isPanelRole)
  return pts.map((a, i) => {
    const b = pts[(i + 1) % n]
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len }
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    let e: EdgeTag | null = null
    if (typeof a.b === 'number' && Math.abs(a.b) > 1e-9) e = 'top'
    else if (fronts.some(s => { const ra = rel(a, s), rb = rel(b, s); return ra.off < NEAR && rb.off < NEAR && ra.within && rb.within })) e = 'top'
    else {
      let best = Infinity
      for (const s of panels) {
        const r = rel(m, s)
        if (!r.within || r.off > PANEL_REACH || r.off >= best || Math.abs(r.u.x * u.y - r.u.y * u.x) > 1e-3) continue
        best = r.off
        e = s.edge.role === 'back' ? 'bottom' : (s.p0.x + s.p1.x) / 2 < midX ? 'left' : 'right'
      }
    }
    if (!e) {
      // Outward = right of travel on a positive-area loop.
      const o = area > 0 ? { x: u.y, y: -u.x } : { x: -u.y, y: u.x }
      e = Math.abs(o.y) >= Math.abs(o.x) ? (o.y > 0 ? 'top' : 'bottom') : (o.x < 0 ? 'left' : 'right')
    }
    return { ...a, e }
  })
}

// A top rail clipped to the shape. An upright rail's plan depth is its
// thickness (DZ), not RD, so clip with the two swapped and swap back; it has
// no horizontal outline.
function clipRail(p: ResolvedCasePart, poly: ShapePt[], sh: Pick<ShapedInterior, 'segs' | 'arcs'>, grow?: { x0?: number; x1?: number }): ResolvedCasePart | null {
  if (!p.upright) return clipHorizontal(p, poly, sh, grow)
  const c = clipHorizontal({ ...p, DX: p.DZ, DZ: p.DX }, poly, sh, grow)
  if (!c) return null
  const next = { ...c, DX: c.DZ, DZ: c.DX }
  delete next.outline
  return next
}

export function shapeCaseParts(
  cab: CabinetInput, r: ConstructionRules, rect: ResolvedCasePart[], errors: ResolverError[],
): ResolvedCasePart[] {
  const shape = shapedInterior(cab)
  if (!shape) return rect
  const { segs, outline, inner } = shape
  const byKey = new Map(rect.map(p => [p.part_key as string, p]))
  const lsRect = byKey.get('left_side'), bkRect = byKey.get('back')
  // Per edge: thickness, set-in, board (E1). Panels stand on their edge lines
  // moved in by any scribe / applied panel (`psegs`); `segs` stays the outline.
  const builds = segs.map(s => edgeBuild(cab, s))
  const psegs = offsetPanelLines(segs, segs.map((s, j) => panelLineOff(cab, s, builds[j])))
  const tOf = (j: number) => builds[j]?.t ?? cab.material.DZ

  for (const s of segs) {
    if (s.type === 'arc' && (s.edge.role === 'side' || s.edge.role === 'back'))
      errors.push({ code: 'SHAPE_CURVED_PANEL', message: `Curved ${s.edge.role} edge "${s.edge.id}" has no panel yet — treated as open`, part: 'case' })
  }

  // Butt priority: the higher rank runs through. Ties → the earlier edge.
  const behind = r.BACK_JOIN === 'behind_sides'
  const rank = (s: FootprintSegment) => s.edge.role === 'back' ? (behind ? 2 : 1) : (behind ? 1 : 2)

  // Edges the box build already has a part on (left/right side, back).
  const legacySlot = (e: FootprintSegment) => {
    if (e.type !== 'line' || !isPanelRole(e)) return false
    if (e.edge.role === 'back') return Math.abs(e.p0.y) < NEAR && Math.abs(e.p1.y) < NEAR
    return (Math.abs(e.p0.x) < NEAR && Math.abs(e.p1.x) < NEAR) || (Math.abs(e.p0.x - cab.DX) < NEAR && Math.abs(e.p1.x - cab.DX) < NEAR)
  }

  const flush = new Set(cab.footprint?.flush_ends ?? [])

  const out: ResolvedCasePart[] = []
  const used = new Set<string>()
  const n = segs.length

  psegs.forEach((s, i) => {
    if (!isPanelRole(s)) return
    const build = builds[i]!
    const t = build.t
    const o = segs[i]   // the edge on the outline (box-slot tests, applied panel)
    const f = edgeFrame(s)
    const ip = (i - 1 + n) % n, inx = (i + 1) % n
    const prev = psegs[ip], next = psegs[inx]
    // An arc neighbour is approximated by its chord (arcs never carry panels).
    const stops = (nb: FootprintSegment, j: number) =>
      isPanelRole(nb) && (rank(nb) > rank(s) || (rank(nb) === rank(s) && j < i))
    // Each end: where the outer face (sOut) and inner face (sIn) stop, along the
    // panel from its vertex. Square corners keep the butt trims; an angled
    // corner to another panel follows ANGLE_JOIN, to a front / open edge the
    // end is bevelled flush with it (decision 12).
    const endCut = (nb: FootprintSegment, j: number, V: ShapePt, away: ShapePt, alpha: number) => {
      const nf = edgeFrame(nb)
      const angled = nb.type === 'line' && Math.abs(alpha - 90) > ANGLE_TOL && alpha < 180 - ANGLE_TOL
      if (angled && isPanelRole(nb))
        return { ...angledEnd(r.ANGLE_JOIN === 'mitre' ? 'mitre' : stops(nb, j) ? 'stop' : 'flush', V, away, f.n, nf, t, tOf(j)), angled, boxed: false }
      if (angled && (nb.edge.role === 'front' || nb.edge.role === 'open') && flush.has(s.edge.id))
        return { ...angledEnd('flush', V, away, f.n, nf, t), angled, boxed: false }
      const sq = vertexTrim(away, f.n, nf.n, t, stops(nb, j), tOf(j))
      // A square end at an angled front with a door on it: come forward to the
      // door's end (less the face buffer) instead of stopping at the vertex,
      // which leaves a gap behind the door you can see into. Both end corners
      // keep FACBUF clear of the door's end face; the outer corner may pass the
      // outline — it sits beside the door, not behind it.
      if (angled && nb.edge.role === 'front' && edgeSub(nb.edge) !== 'open' && cab.has_face) {
        const af = Math.hypot(V.x - nb.p0.x, V.y - nb.p0.y) < NEAR ? nf.u : { x: -nf.u.x, y: -nf.u.y }
        const fwd = -(away.x * af.x + away.y * af.y)
        if (fwd > 1e-6) {
          const sd = facetDoorRun(cab, r, nb, s, V)
          const e = Math.min(...[0, t].map(off => (sd - r.FACBUF - off * (f.n.x * af.x + f.n.y * af.y)) / fwd))
          if (e > 0 && -e < sq) return { sOut: -e, sIn: -e, angled: false, boxed: false }
        }
      }
      return { sOut: sq, sIn: sq, angled: false, boxed: legacySlot(segs[j]) }
    }
    const c0 = endCut(prev, ip, s.p0, f.u, interiorAngle(prev, s))
    const c1 = endCut(next, inx, s.p1, { x: -f.u.x, y: -f.u.y }, interiorAngle(s, next))
    const lo = Math.min(c0.sOut, c0.sIn), hi = f.len - Math.min(c1.sOut, c1.sIn)
    const len = hi - lo
    if (len < 1) return
    const a = { x: s.p0.x + f.u.x * lo, y: s.p0.y + f.u.y * lo }
    const b = { x: s.p0.x + f.u.x * hi, y: s.p0.y + f.u.y * hi }
    // Bevel from square, degrees; + = the inner face is the shorter.
    const bev = (c: { sOut: number; sIn: number }) => {
      const d = Math.atan2(c.sIn - c.sOut, t) * 180 / Math.PI
      return Math.abs(d) < 0.01 ? 0 : Math.round(d * 100) / 100
    }
    const bevels = (p0First: boolean) => {
      const [l, h] = p0First ? [bev(c0), bev(c1)] : [bev(c1), bev(c0)]
      return { ...(l ? { bevel_lo: l } : {}), ...(h ? { bevel_hi: h } : {}) }
    }

    const isSideRole = s.edge.role !== 'back'
    const vertical = Math.abs(f.u.x) < 1e-6, horizontal = Math.abs(f.u.y) < 1e-6

    // Board for a finished panel; the same tape edges in the exposed tape.
    const board = (p: ResolvedCasePart): Partial<ResolvedCasePart> => build.material_id
      ? { material_id: build.material_id, edge_band: { ...p.edge_band, id: build.tape ?? p.edge_band.id } }
      : {}
    // Applied end panel (sub 'applied') on the outline, outside the set-in
    // gable, the gable's height. Its ends lie flush in the neighbours' outer
    // planes (square at a square corner), so it stays inside the outline.
    const appliedPanel = (ref: ResolvedCasePart, y0: number, h: number) => {
      const ap = build.applied
      if (!ap) return
      const of = edgeFrame(o)
      const ends = [segs[ip], segs[inx]].map((nb, k) => angledEnd('flush', k ? o.p1 : o.p0,
        k ? { x: -of.u.x, y: -of.u.y } : of.u, of.n, edgeFrame(nb), ap.t))
      const lo0 = Math.min(ends[0].sOut, ends[0].sIn), hi0 = of.len - Math.min(ends[1].sOut, ends[1].sIn)
      if (hi0 - lo0 < 1) return
      const bv = (c: { sOut: number; sIn: number }) => {
        const d = Math.atan2(c.sIn - c.sOut, ap.t) * 180 / Math.PI
        return Math.abs(d) < 0.01 ? 0 : Math.round(d * 100) / 100
      }
      const [bl, bh] = [bv(ends[0]), bv(ends[1])]
      out.push({
        part_key: `ap:${o.edge.id}`,
        DX: h, DY: hi0 - lo0, DZ: ap.t,
        X: o.p0.x + of.u.x * lo0, Y: y0, Z: o.p0.y + of.u.y * lo0,
        AX: 0, AY: Math.atan2(-of.u.y, of.u.x) * 180 / Math.PI, AZ: 0,
        material_id: ap.material_id,
        edge_band: { ...ref.edge_band, id: ap.tape ?? ref.edge_band.id },
        ...(bl ? { bevel_lo: bl } : {}), ...(bh ? { bevel_hi: bh } : {}),
      })
    }
    const off = build.off

    // Legacy slots: keep the box part, trimmed to this edge. An end against
    // another box part stays inside the box part (scribes, BACK_JOIN); any
    // other end goes where the joint puts it (e.g. two backs of a diagonal
    // corner meeting where the box had a side).
    const span = (boxLo: number, boxHi: number, pa: number, pb: number) => {
      const [cLo, cHi] = pa <= pb ? [c0, c1] : [c1, c0]
      const l = cLo.boxed ? Math.max(boxLo, Math.min(pa, pb)) : Math.min(pa, pb)
      const h = cHi.boxed ? Math.min(boxHi, Math.max(pa, pb)) : Math.max(pa, pb)
      return [l, h - l]
    }
    // A box part keeps its outer face where the box build put it (rules'
    // scribe), moved in by `off`, at the edge's thickness.
    if (isSideRole && vertical && Math.abs(o.p0.x) < NEAR && byKey.has('left_side') && !used.has('left_side')) {
      used.add('left_side')
      const p = byKey.get('left_side')!
      const [Z, DX] = span(p.Z, p.Z + p.DX, a.y, b.y)
      out.push({ ...p, X: p.X + off, Z, DX, DZ: t, ...board(p), ...bevels(a.y <= b.y) })
      appliedPanel(p, p.Y, p.DY)
      return
    }
    if (isSideRole && vertical && Math.abs(o.p0.x - cab.DX) < NEAR && byKey.has('right_side') && !used.has('right_side')) {
      used.add('right_side')
      const p = byKey.get('right_side')!
      const [Z, DX] = span(p.Z, p.Z + p.DX, a.y, b.y)
      out.push({ ...p, X: p.X + p.DZ - t - off, Z, DX, DZ: t, ...board(p), ...bevels(a.y <= b.y) })
      appliedPanel(p, p.Y, p.DY)
      return
    }
    if (!isSideRole && horizontal && Math.abs(o.p0.y) < NEAR && byKey.has('back') && !used.has('back')) {
      used.add('back')
      const p = byKey.get('back')!
      const [X, DY] = span(p.X, p.X + p.DY, a.x, b.x)
      out.push({ ...p, X, DY, Z: p.Z + off, ...(build.material_id ? { DZ: t } : {}), ...board(p), ...bevels(a.x <= b.x) })
      return
    }

    // Generic per-edge panel. Heights follow the box side / back.
    const ref = isSideRole ? lsRect : bkRect
    if (!ref) return
    const y0 = isSideRole ? ref.Y : ref.Y + ref.DZ          // caseBox: back sits at Y + DZ
    const h  = isSideRole ? ref.DY : ref.DX
    out.push({
      part_key: `${isSideRole ? 'side' : 'back'}:${s.edge.id}`,
      DX: h, DY: len, DZ: t,
      X: a.x, Y: y0, Z: a.y,
      AX: 0, AY: Math.atan2(-f.u.y, f.u.x) * 180 / Math.PI, AZ: 0,
      material_id: ref.material_id,
      edge_band: ref.edge_band,
      ...board(ref),
      ...bevels(true),
    })
    if (isSideRole) appliedPanel(ref, y0, h)
  })

  // ── Horizontals ────────────────────────────────────────────────
  // Where a box side / back no longer exists, let the part reach the outline
  // edge (the inset polygon then decides) instead of stopping a panel short.
  const grow = {
    ...(!used.has('left_side') ? { x0: 0 } : {}),
    ...(!used.has('right_side') ? { x1: cab.DX } : {}),
    ...(!used.has('back') ? { z0: 0 } : {}),
  }
  // A box panel set in / thickened by its sub-type moves the parts that stopped at it.
  const shifts = boxFaceShifts(cab, r, segs)
  const gr = (p: ResolvedCasePart) => shiftedGrow(p, shifts, grow)
  const mainFront = segs.find(s => s.type === 'line' && s.edge.role === 'front'
    && Math.abs(s.p0.y - cab.DZ) < NEAR && Math.abs(s.p1.y - cab.DZ) < NEAR)

  for (const p of rect) {
    const k = p.part_key
    if (k === 'bottom') {
      // Backs sitting on the bottom (BOTTOM_BACK_JOIN back_on_bottom, as the box)
      // need it to run under them to the outline (L3: back:bottom holes).
      const underBacks = r.BOTTOM_BACK_JOIN === 'back_on_bottom'
        ? insetPolygon(segs, s => (s.edge.role !== 'back' ? insetOf(cab, s) : 0))
        : inner
      const c = clipHorizontal(p, r.BOTTOM_JOIN === 'bottom_outside' ? outline : underBacks, shape, gr(p))
      if (c) out.push(c)
    } else if (k === 'full_top') {
      const c = clipHorizontal(p, r.RAIL_JOIN === 'on_top_of_sides' ? outline : inner, shape, gr(p))
      if (c) out.push(c)
    } else if (k === 'front_rail') {
      if (!mainFront) continue
      const c = clipRail(p, r.RAIL_JOIN === 'on_top_of_sides' ? outline : inner, shape, { x0: gr(p).x0, x1: gr(p).x1 })
      if (c) out.push(c)
    } else if (k === 'back_rail') {
      if (!used.has('back')) continue
      const c = clipRail(p, r.RAIL_JOIN === 'on_top_of_sides' ? outline : inner, shape, { x0: gr(p).x0, x1: gr(p).x1 })
      if (c) out.push(c)
    }
  }

  // Top rails along every other front facet. Plan depth = RD lying flat, the
  // board thickness standing on edge.
  const fr = rect.find(p => p.part_key === 'front_rail')
  if (fr) {
    const depth = fr.upright ? fr.DZ : r.RD
    const n = segs.length
    const isFront = (q: FootprintSegment) => q.type === 'line' && q.edge.role === 'front'
    const concave = (a: FootprintSegment, b: FootprintSegment) => {   // a then b, meeting at a.p1
      const fa = edgeFrame(a), fb = edgeFrame(b)
      return fa.u.x * fb.u.y - fa.u.y * fb.u.x < -1e-9
    }
    for (const [i, s] of segs.entries()) {
      if (!isFront(s) || s === mainFront) continue
      const f = edgeFrame(s)
      const strip = [
        s.p0, s.p1,
        { x: s.p1.x + f.n.x * depth, y: s.p1.y + f.n.y * depth },
        { x: s.p0.x + f.n.x * depth, y: s.p0.y + f.n.y * depth },
      ]
      const c = clipToConvex(inner, strip)
      if (c.length < 3) continue
      const along = c.map(q => (q.x - s.p0.x) * f.u.x + (q.y - s.p0.y) * f.u.y)
      let sMin = Math.min(...along), sMax = Math.max(...along)
      // Inside (pie) corner between two front facets: the earlier facet's rail
      // runs through the corner and on across the other leg to the cabinet's
      // back (the inset outline — less back.t, scribe…); the later one butts
      // against it. Stopping at the corner was too weak (Mark, 2026-10-15).
      const prev = segs[(i - 1 + n) % n], next = segs[(i + 1) % n]
      const runOn = (dir: 1 | -1) => {
        const far = (cab.DX + cab.DZ) * 2
        const from = dir > 0 ? s.p1 : s.p0
        const to = { x: from.x + f.u.x * far * dir, y: from.y + f.u.y * far * dir }
        const band = [from, to, { x: to.x + f.n.x * depth, y: to.y + f.n.y * depth }, { x: from.x + f.n.x * depth, y: from.y + f.n.y * depth }]
        const cc = clipToConvex(inner, band)
        return cc.length < 3 ? null : cc.map(q => (q.x - s.p0.x) * f.u.x + (q.y - s.p0.y) * f.u.y)
      }
      if (isFront(next) && next !== mainFront && concave(s, next) && i < (i + 1) % n) {
        const a = runOn(1); sMax = a ? Math.max(sMax, ...a) : sMax + depth
      }
      if (isFront(prev) && prev !== mainFront && concave(prev, s) && (i - 1 + n) % n > i) {
        const a = runOn(-1); sMin = a ? Math.min(sMin, ...a) : sMin - depth
      }
      if (sMax - sMin < 1) continue
      out.push({
        ...fr,
        part_key: `rail:${s.edge.id}`,
        DX: r.RD, DY: sMax - sMin,
        X: s.p0.x + f.u.x * sMin, Z: s.p0.y + f.u.y * sMin,
        AY: Math.atan2(-f.u.y, f.u.x) * 180 / Math.PI,
      })
    }
  }

  return out
}

/** Clip shelves to the inside of a shaped carcass; drop any that vanish. */
export function shapeShelves(cab: CabinetInput, r: ConstructionRules, parts: ResolvedInternalPart[]): ResolvedInternalPart[] {
  const shape = shapedInterior(cab)
  if (!shape) return parts
  // Adjustable shelves keep their pin clearance off every side panel they meet,
  // angled ones too (a box side's is already in the shelf's rect); none at the
  // back, none on a fixed shelf — as the box build.
  const adjClr = Math.max(r.ADJSL ?? 0, r.ADJSR ?? 0)
  const adjInner = adjClr > 0
    ? insetPolygon(shape.segs, s => (isPanelRole(s) ? insetOf(cab, s) + (s.edge.role === 'back' ? 0 : adjClr) : 0))
    : shape.inner
  // No box side / back panel on that edge (an end set to open, a shape with no
  // edge there): nothing to clear, so the shelf runs out to the outline — the
  // inset polygon decides — as the bottom does (shapeCaseParts `grow`).
  const on = (s: FootprintSegment, k: 'x' | 'y', v: number) =>
    s.type === 'line' && isPanelRole(s) && Math.abs(s.p0[k] - v) < NEAR && Math.abs(s.p1[k] - v) < NEAR
  const has = (k: 'x' | 'y', v: number) => shape.segs.some(s => on(s, k, v))
  const grow = {
    ...(!has('x', 0) ? { x0: 0 } : {}),
    ...(!has('x', cab.DX) ? { x1: cab.DX } : {}),
    ...(!has('y', 0) ? { z0: 0 } : {}),
  }
  const shifts = boxFaceShifts(cab, r, shape.segs)
  const out: ResolvedInternalPart[] = []
  for (const p of parts) {
    if (p.part_type !== 'adj_shelf' && p.part_type !== 'fixed_shelf') { out.push(p); continue }
    const c = clipHorizontal(p, p.part_type === 'adj_shelf' ? adjInner : shape.inner, shape, shiftedGrow(p, shifts, grow))
    if (c) out.push(c)
  }
  return out
}
