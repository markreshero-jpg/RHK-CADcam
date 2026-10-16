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
import type { Footprint, FootprintSegment } from '../cabinetShape/footprint'
import { arcGeom, mapOutline, restoreArcs, type Circle, type OutlinePt, type ShapePt } from '../shapePath'
import {
  canonicalSegments, edgeFrame, insetPolygon, clipToRect, clipToConvex, bbox, isBoxLike, vertexTrim,
  angledEnd, interiorAngle,
} from '../cabinetShape/construct'
import { facetDoorRun } from './resolveShapedFace'

const NEAR = 0.5   // mm — "this edge sits on the box side"
const ANGLE_TOL = 0.5   // degrees — corners this close to 90° keep the square butt

const isPanelRole = (s: FootprintSegment) =>
  s.type === 'line' && (s.edge.role === 'side' || s.edge.role === 'scribe' || s.edge.role === 'back')

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
  const t = cab.material.DZ
  return {
    segs,
    outline: insetPolygon(segs, () => 0),
    inner: insetPolygon(segs, s => (isPanelRole(s) ? t : 0)),
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
// OutlinePt), so the part shows and cuts a radius, not 5° flats.
function clipHorizontal<P extends { X: number; Z: number; DX: number; DY: number; outline?: OutlinePt[] }>(
  p: P, poly: ShapePt[], arcs: Circle[], grow?: { x0?: number; x1?: number; z0?: number },
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
  next.outline = mapOutline(restoreArcs(clipped, arcs), q => ({ x: q.x - b.x0, y: b.y1 - q.y }), true)
  return next
}

// A top rail clipped to the shape. An upright rail's plan depth is its
// thickness (DZ), not RD, so clip with the two swapped and swap back; it has
// no horizontal outline.
function clipRail(p: ResolvedCasePart, poly: ShapePt[], arcs: Circle[], grow?: { x0?: number; x1?: number }): ResolvedCasePart | null {
  if (!p.upright) return clipHorizontal(p, poly, arcs, grow)
  const c = clipHorizontal({ ...p, DX: p.DZ, DZ: p.DX }, poly, arcs, grow)
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
  const { segs, outline, inner, arcs } = shape
  const t = cab.material.DZ
  const byKey = new Map(rect.map(p => [p.part_key as string, p]))
  const lsRect = byKey.get('left_side'), bkRect = byKey.get('back')

  for (const s of segs) {
    if (s.type === 'arc' && (s.edge.role === 'side' || s.edge.role === 'scribe' || s.edge.role === 'back'))
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

  segs.forEach((s, i) => {
    if (!isPanelRole(s)) return
    const f = edgeFrame(s)
    const ip = (i - 1 + n) % n, inx = (i + 1) % n
    const prev = segs[ip], next = segs[inx]
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
        return { ...angledEnd(r.ANGLE_JOIN === 'mitre' ? 'mitre' : stops(nb, j) ? 'stop' : 'flush', V, away, f.n, nf, t), angled, boxed: false }
      if (angled && (nb.edge.role === 'front' || nb.edge.role === 'open') && flush.has(s.edge.id))
        return { ...angledEnd('flush', V, away, f.n, nf, t), angled, boxed: false }
      const sq = vertexTrim(away, f.n, nf.n, t, stops(nb, j))
      // A square end at an angled front with a door on it: come forward to the
      // door's end (less the face buffer) instead of stopping at the vertex,
      // which leaves a gap behind the door you can see into. Both end corners
      // keep FACBUF clear of the door's end face; the outer corner may pass the
      // outline — it sits beside the door, not behind it.
      if (angled && nb.edge.role === 'front' && cab.has_face) {
        const af = Math.hypot(V.x - nb.p0.x, V.y - nb.p0.y) < NEAR ? nf.u : { x: -nf.u.x, y: -nf.u.y }
        const fwd = -(away.x * af.x + away.y * af.y)
        if (fwd > 1e-6) {
          const sd = facetDoorRun(cab, r, nb, s, V)
          const e = Math.min(...[0, t].map(off => (sd - r.FACBUF - off * (f.n.x * af.x + f.n.y * af.y)) / fwd))
          if (e > 0 && -e < sq) return { sOut: -e, sIn: -e, angled: false, boxed: false }
        }
      }
      return { sOut: sq, sIn: sq, angled: false, boxed: legacySlot(nb) }
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
    if (isSideRole && vertical && Math.abs(s.p0.x) < NEAR && byKey.has('left_side') && !used.has('left_side')) {
      used.add('left_side')
      const p = byKey.get('left_side')!
      const [Z, DX] = span(p.Z, p.Z + p.DX, a.y, b.y)
      out.push({ ...p, Z, DX, ...bevels(a.y <= b.y) })
      return
    }
    if (isSideRole && vertical && Math.abs(s.p0.x - cab.DX) < NEAR && byKey.has('right_side') && !used.has('right_side')) {
      used.add('right_side')
      const p = byKey.get('right_side')!
      const [Z, DX] = span(p.Z, p.Z + p.DX, a.y, b.y)
      out.push({ ...p, Z, DX, ...bevels(a.y <= b.y) })
      return
    }
    if (!isSideRole && horizontal && Math.abs(s.p0.y) < NEAR && byKey.has('back') && !used.has('back')) {
      used.add('back')
      const p = byKey.get('back')!
      const [X, DY] = span(p.X, p.X + p.DY, a.x, b.x)
      out.push({ ...p, X, DY, ...bevels(a.x <= b.x) })
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
      ...bevels(true),
    })
  })

  // ── Horizontals ────────────────────────────────────────────────
  // Where a box side / back no longer exists, let the part reach the outline
  // edge (the inset polygon then decides) instead of stopping a panel short.
  const grow = {
    ...(!used.has('left_side') ? { x0: 0 } : {}),
    ...(!used.has('right_side') ? { x1: cab.DX } : {}),
    ...(!used.has('back') ? { z0: 0 } : {}),
  }
  const mainFront = segs.find(s => s.type === 'line' && s.edge.role === 'front'
    && Math.abs(s.p0.y - cab.DZ) < NEAR && Math.abs(s.p1.y - cab.DZ) < NEAR)

  for (const p of rect) {
    const k = p.part_key
    if (k === 'bottom') {
      // Backs sitting on the bottom (BOTTOM_BACK_JOIN back_on_bottom, as the box)
      // need it to run under them to the outline (L3: back:bottom holes).
      const underBacks = r.BOTTOM_BACK_JOIN === 'back_on_bottom'
        ? insetPolygon(segs, s => (isPanelRole(s) && s.edge.role !== 'back' ? t : 0))
        : inner
      const c = clipHorizontal(p, r.BOTTOM_JOIN === 'bottom_outside' ? outline : underBacks, arcs, grow)
      if (c) out.push(c)
    } else if (k === 'full_top') {
      const c = clipHorizontal(p, r.RAIL_JOIN === 'on_top_of_sides' ? outline : inner, arcs, grow)
      if (c) out.push(c)
    } else if (k === 'front_rail') {
      if (!mainFront) continue
      const c = clipRail(p, r.RAIL_JOIN === 'on_top_of_sides' ? outline : inner, arcs, { x0: grow.x0, x1: grow.x1 })
      if (c) out.push(c)
    } else if (k === 'back_rail') {
      if (!used.has('back')) continue
      const c = clipRail(p, r.RAIL_JOIN === 'on_top_of_sides' ? outline : inner, arcs, { x0: grow.x0, x1: grow.x1 })
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
  const t = cab.material.DZ
  const adjClr = Math.max(r.ADJSL ?? 0, r.ADJSR ?? 0)
  const adjInner = adjClr > 0
    ? insetPolygon(shape.segs, s => (isPanelRole(s) ? t + (s.edge.role === 'back' ? 0 : adjClr) : 0))
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
  const out: ResolvedInternalPart[] = []
  for (const p of parts) {
    if (p.part_type !== 'adj_shelf' && p.part_type !== 'fixed_shelf') { out.push(p); continue }
    const c = clipHorizontal(p, p.part_type === 'adj_shelf' ? adjInner : shape.inner, shape.arcs, grow)
    if (c) out.push(c)
  }
  return out
}
