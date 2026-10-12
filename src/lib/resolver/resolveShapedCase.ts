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
// Joints are square butts (priority from BACK_JOIN); mitres/bevels = Phase 4.
// ============================================================

import type { CabinetInput, ConstructionRules, ResolvedCasePart, ResolvedInternalPart, ResolverError } from './types'
import type { FootprintSegment } from '../cabinetShape/footprint'
import type { ShapePt } from '../shapePath'
import {
  canonicalSegments, edgeFrame, insetPolygon, clipToRect, clipToConvex, bbox, isBoxLike, vertexTrim,
} from '../cabinetShape/construct'

const NEAR = 0.5   // mm — "this edge sits on the box side"

const isPanelRole = (s: FootprintSegment) =>
  s.type === 'line' && (s.edge.role === 'side' || s.edge.role === 'scribe' || s.edge.role === 'back')

export interface ShapedInterior {
  segs: FootprintSegment[]
  outline: ShapePt[]   // plan polygon of the footprint
  inner: ShapePt[]     // inside of the carcass panels
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
  }
}

// Clip a horizontal part (plan rect X..X+DY × Z..Z+DX) to `poly`. Returns null
// when nothing is left. The outline is in the horizontal shape frame: x across
// from the part's X, y DOWN from its front edge (PartViewer.buildShapedGeometry).
function clipHorizontal<P extends { X: number; Z: number; DX: number; DY: number; outline?: ShapePt[] }>(
  p: P, poly: ShapePt[], grow?: { x0?: number; x1?: number; z0?: number },
): P | null {
  const x0 = grow?.x0 ?? p.X, x1 = grow?.x1 ?? p.X + p.DY
  const z0 = grow?.z0 ?? p.Z, z1 = p.Z + p.DX
  const clipped = clipToRect(poly, x0, z0, x1, z1)
  if (clipped.length < 3) return null
  const b = bbox(clipped)
  if (b.x1 - b.x0 < 1 || b.y1 - b.y0 < 1) return null
  const next = { ...p, X: b.x0, Z: b.y0, DY: b.x1 - b.x0, DX: b.y1 - b.y0 }
  if (isBoxLike(clipped)) { delete next.outline; return next }
  next.outline = clipped.map(q => ({ x: q.x - b.x0, y: b.y1 - q.y }))
  return next
}

export function shapeCaseParts(
  cab: CabinetInput, r: ConstructionRules, rect: ResolvedCasePart[], errors: ResolverError[],
): ResolvedCasePart[] {
  const shape = shapedInterior(cab)
  if (!shape) return rect
  const { segs, outline, inner } = shape
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

  const out: ResolvedCasePart[] = []
  const used = new Set<string>()
  const n = segs.length

  segs.forEach((s, i) => {
    if (!isPanelRole(s)) return
    const f = edgeFrame(s)
    const prev = segs[(i - 1 + n) % n], next = segs[(i + 1) % n]
    // An arc neighbour is approximated by its chord (arcs never carry panels).
    const stops = (nb: FootprintSegment, j: number) =>
      isPanelRole(nb) && (rank(nb) > rank(s) || (rank(nb) === rank(s) && j < i))
    const s0 = vertexTrim(f.u, f.n, edgeFrame(prev).n, t, stops(prev, (i - 1 + n) % n))
    const s1 = vertexTrim({ x: -f.u.x, y: -f.u.y }, f.n, edgeFrame(next).n, t, stops(next, (i + 1) % n))
    const len = f.len - s0 - s1
    if (len < 1) return
    const a = { x: s.p0.x + f.u.x * s0, y: s.p0.y + f.u.y * s0 }
    const b = { x: a.x + f.u.x * len, y: a.y + f.u.y * len }

    const isSideRole = s.edge.role !== 'back'
    const vertical = Math.abs(f.u.x) < 1e-6, horizontal = Math.abs(f.u.y) < 1e-6

    // Legacy slots: keep the box part, trimmed to this edge.
    if (isSideRole && vertical && Math.abs(s.p0.x) < NEAR && byKey.has('left_side') && !used.has('left_side')) {
      used.add('left_side')
      const p = byKey.get('left_side')!
      out.push({ ...p, Z: Math.max(p.Z, Math.min(a.y, b.y)), DX: Math.min(p.Z + p.DX, Math.max(a.y, b.y)) - Math.max(p.Z, Math.min(a.y, b.y)) })
      return
    }
    if (isSideRole && vertical && Math.abs(s.p0.x - cab.DX) < NEAR && byKey.has('right_side') && !used.has('right_side')) {
      used.add('right_side')
      const p = byKey.get('right_side')!
      out.push({ ...p, Z: Math.max(p.Z, Math.min(a.y, b.y)), DX: Math.min(p.Z + p.DX, Math.max(a.y, b.y)) - Math.max(p.Z, Math.min(a.y, b.y)) })
      return
    }
    if (!isSideRole && horizontal && Math.abs(s.p0.y) < NEAR && byKey.has('back') && !used.has('back')) {
      used.add('back')
      const p = byKey.get('back')!
      out.push({ ...p, X: Math.max(p.X, Math.min(a.x, b.x)), DY: Math.min(p.X + p.DY, Math.max(a.x, b.x)) - Math.max(p.X, Math.min(a.x, b.x)) })
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
      const c = clipHorizontal(p, r.BOTTOM_JOIN === 'bottom_outside' ? outline : inner, grow)
      if (c) out.push(c)
    } else if (k === 'full_top') {
      const c = clipHorizontal(p, r.RAIL_JOIN === 'on_top_of_sides' ? outline : inner, grow)
      if (c) out.push(c)
    } else if (k === 'front_rail') {
      if (!mainFront) continue
      const c = clipHorizontal(p, r.RAIL_JOIN === 'on_top_of_sides' ? outline : inner, { x0: grow.x0, x1: grow.x1 })
      if (c) out.push(c)
    } else if (k === 'back_rail') {
      if (!used.has('back')) continue
      const c = clipHorizontal(p, r.RAIL_JOIN === 'on_top_of_sides' ? outline : inner, { x0: grow.x0, x1: grow.x1 })
      if (c) out.push(c)
    }
  }

  // Top rails along every other front facet.
  const fr = rect.find(p => p.part_key === 'front_rail')
  if (fr) {
    for (const s of segs) {
      if (s.type !== 'line' || s.edge.role !== 'front' || s === mainFront) continue
      const f = edgeFrame(s)
      const strip = [
        s.p0, s.p1,
        { x: s.p1.x + f.n.x * r.RD, y: s.p1.y + f.n.y * r.RD },
        { x: s.p0.x + f.n.x * r.RD, y: s.p0.y + f.n.y * r.RD },
      ]
      const c = clipToConvex(inner, strip)
      if (c.length < 3) continue
      const along = c.map(q => (q.x - s.p0.x) * f.u.x + (q.y - s.p0.y) * f.u.y)
      const sMin = Math.min(...along), sMax = Math.max(...along)
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
export function shapeShelves(cab: CabinetInput, parts: ResolvedInternalPart[]): ResolvedInternalPart[] {
  const shape = shapedInterior(cab)
  if (!shape) return parts
  const out: ResolvedInternalPart[] = []
  for (const p of parts) {
    if (p.part_type !== 'adj_shelf' && p.part_type !== 'fixed_shelf') { out.push(p); continue }
    const c = clipHorizontal(p, shape.inner)
    if (c) out.push(c)
  }
  return out
}
