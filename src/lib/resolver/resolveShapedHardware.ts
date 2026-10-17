// ============================================================
// Shaped-cabinet hardware (z_cabinet_shape Phase 3b): hinges and drawer boxes
// on every front facet.
//
// Everything here works in a zone's own square frame — the frame the zone has
// before its AY turn (see HardwareTurn). The footprint (plan x, y = cabinet X,
// Z) is turned INTO that frame, so the ordinary hinge / drawer maths runs on a
// square zone and the result turns with the zone, as the 3D view already does.
//
//   hingeMount   the panel a side-hung door hangs on: the panel at that end of
//                its facet (left end = next edge, right end = previous edge, as
//                in resolveShapedFace). The plate sits on that panel's inner
//                face, plate-offset back from the door's back plane, drilled
//                square into the panel. mount_angle = corner angle − 90°.
//   drawerOpening  the clear opening behind a drawer front: the inside of the
//                carcass panels in the zone frame, sliced across the depth;
//                the box is the widest rectangle that stays inside.
//   piePairs     the bi-fold door pairs at an inside (pie) corner (Phase L2).
// ============================================================

import type {
  CabinetInput, ConstructionRules, FaceGridInput, HardwareTurn, ResolvedCasePart,
  ResolvedDrawerStack, ResolvedFaceZone, ResolverError,
} from './types'
import type { FootprintSegment } from '../cabinetShape/footprint'
import type { ShapePt } from '../shapePath'
import { edgeFrame } from '../cabinetShape/construct'
import { shapedInterior } from './resolveShapedCase'
import { primaryFacetId } from './resolveShapedFace'
import { turnPoint } from './hardwareTurn'
import { zoneKey } from '../cabinetShape/partKeys'
export { turnPoint, turnDir, turnDrill } from './hardwareTurn'

const NEAR = 0.5
const D = Math.PI / 180

const isPanel = (s: FootprintSegment) =>
  s.type === 'line' && (s.edge.role === 'side' || s.edge.role === 'scribe' || s.edge.role === 'back')

/** The face grid a zone belongs to: face_grid on the primary front, faces[edge] on a facet. */
export function gridForFacet(cab: CabinetInput, facet: string | undefined): FaceGridInput | undefined {
  return facet ? cab.faces?.[facet] : cab.face_grid
}

export function zoneTurn(z: ResolvedFaceZone): HardwareTurn | undefined {
  return z.AY ? { AY: z.AY, X: z.X, Y: z.Y, Z: z.Z } : undefined
}


// Plan point / direction (x, y = cabinet X, Z) → the zone's square frame.
function toZone(z: ResolvedFaceZone, p: ShapePt): ShapePt {
  if (!z.AY) return p
  const c = Math.cos(z.AY * D), s = Math.sin(z.AY * D)
  const dx = p.x - z.X, dz = p.y - z.Z
  return { x: z.X + c * dx - s * dz, y: z.Z + s * dx + c * dz }
}
function dirToZone(z: ResolvedFaceZone, v: ShapePt): ShapePt {
  if (!z.AY) return v
  const c = Math.cos(z.AY * D), s = Math.sin(z.AY * D)
  return { x: c * v.x - s * v.y, y: s * v.x + c * v.y }
}

export interface ShapedHardwareCtx {
  segs: FootprintSegment[]
  inner: ShapePt[]
  primary: string | null
  t: number
}

export function shapedHardwareCtx(cab: CabinetInput): ShapedHardwareCtx | null {
  const shape = shapedInterior(cab)
  if (!shape) return null
  return { segs: shape.segs, inner: shape.inner, primary: primaryFacetId(shape.segs, cab.DZ), t: cab.material.DZ }
}

function facetIndex(ctx: ShapedHardwareCtx, z: ResolvedFaceZone): number {
  const id = z.facet ?? ctx.primary
  return ctx.segs.findIndex(s => s.edge.id === id)
}

// ── Hinges ─────────────────────────────────────────────────────

export interface ShapedMount {
  part_key: string | null          // case part the plate fires into (null = none found)
  x: number; z: number             // plate centre on the panel's inner face (zone frame)
  along: ShapePt                   // unit along the panel face, pointing toward the front
  into: ShapePt                    // unit bore direction, into the panel
  angleDeg: number                 // corner angle − 90° (0 = square gable)
}

export type MountResult = { mount: ShapedMount } | { error: string }

/** Where a side-hung door on a shaped cabinet hangs. */
export function hingeMount(
  cab: CabinetInput, ctx: ShapedHardwareCtx, z: ResolvedFaceZone, edge: 'left' | 'right',
  plateOffset: number, caseParts: ResolvedCasePart[],
): MountResult {
  const n = ctx.segs.length
  const i = facetIndex(ctx, z)
  if (i < 0) return { error: 'its front edge is not in the shape' }
  const s = ctx.segs[i]
  const j = edge === 'left' ? (i + 1) % n : (i - 1 + n) % n
  const nb = ctx.segs[j]
  if (!isPanel(nb)) {
    return { error: nb.edge.role === 'front' ? 'that end is a mitred / facet corner with no panel' : `that end is ${nb.edge.role === 'open' ? 'open' : 'curved'}` }
  }
  const f = edgeFrame(s), g = edgeFrame(nb)
  // Corner angle inside the cabinet between the facet and the panel.
  const [a, b] = edge === 'left' ? [f, g] : [g, f]
  const turn = Math.atan2(a.u.x * b.u.y - a.u.y * b.u.x, a.u.x * b.u.x + a.u.y * b.u.y)
  const angleDeg = Math.round((180 - turn / D - 90) * 10) / 10

  // Panel inner face: the edge line pushed in by the panel thickness.
  const P = toZone(z, { x: nb.p0.x + g.n.x * ctx.t, y: nb.p0.y + g.n.y * ctx.t })
  const U = dirToZone(z, g.u)
  if (Math.abs(U.y) < 1e-6) return { error: 'the panel runs parallel to the door' }
  const lam = (z.Z - P.y) / U.y
  const along = U.y > 0 ? U : { x: -U.x, y: -U.y }
  const nIn = dirToZone(z, g.n)
  return {
    mount: {
      part_key: panelPartKey(cab, nb, caseParts),
      x: P.x + U.x * lam - along.x * plateOffset,
      z: P.y + U.y * lam - along.y * plateOffset,
      along,
      into: { x: -nIn.x, y: -nIn.y },
      angleDeg: Math.abs(angleDeg) < 0.5 ? 0 : angleDeg,
    },
  }
}

// The case part standing on a footprint edge (resolveShapedCase naming).
function panelPartKey(cab: CabinetInput, s: FootprintSegment, caseParts: ResolvedCasePart[]): string | null {
  const keys = new Set(caseParts.map(p => p.part_key as string))
  const own = `${s.edge.role === 'back' ? 'back' : 'side'}:${s.edge.id}`
  if (keys.has(own)) return own
  const vertical = Math.abs(s.p0.x - s.p1.x) < NEAR
  if (s.edge.role !== 'back' && vertical && Math.abs(s.p0.x) < NEAR && keys.has('left_side')) return 'left_side'
  if (s.edge.role !== 'back' && vertical && Math.abs(s.p0.x - cab.DX) < NEAR && keys.has('right_side')) return 'right_side'
  if (s.edge.role === 'back' && Math.abs(s.p0.y - s.p1.y) < NEAR && Math.abs(s.p0.y) < NEAR && keys.has('back')) return 'back'
  return null
}

// ── Pie-corner bi-fold pairs (Phase L2) ────────────────────────
// Two doors meeting at a concave front-facet corner. The door hinged toward
// the corner is TRAILING (no cups — the bi-fold plate screws to its back); the
// door on the other facet at that corner, hinged to its own end panel, LEADS
// and carries every cup (Mark, 2026-10-15: either leg can lead, read from the
// hinge sides). Both hinged toward the corner → no lead, no pair.

export interface PiePartner {
  role: 'lead' | 'trailing'
  other: ResolvedFaceZone
  pieEdge: 'left' | 'right'   // this door's edge at the pie corner
}

export function piePairs(ctx: ShapedHardwareCtx, zones: ResolvedFaceZone[]): Map<string, PiePartner> {
  const n = ctx.segs.length
  const out = new Map<string, PiePartner>()
  const doors = zones.filter(z => z.face_type === 'door' && (z.hinge_side === 'left' || z.hinge_side === 'right'))
  const facetOf = (z: ResolvedFaceZone) => z.facet ?? ctx.primary
  // Is the zone in the end column of its facet on that side? (left = col 0)
  const atEnd = (z: ResolvedFaceZone, side: 'left' | 'right') => side === 'left'
    ? z.col_index === 0
    : z.col_index === Math.max(...zones.filter(o => facetOf(o) === facetOf(z)).map(o => o.col_index))
  for (const t of doors) {
    const i = facetIndex(ctx, t)
    if (i < 0) continue
    const edge = t.hinge_side as 'left' | 'right'
    const j = edge === 'left' ? (i + 1) % n : (i - 1 + n) % n
    const s = ctx.segs[i], nb = ctx.segs[j]
    if (nb.type !== 'line' || nb.edge.role !== 'front' || !atEnd(t, edge)) continue
    // Concave corner only (as resolveShapedFace): convex facet corners are mitred.
    const f = edgeFrame(s), g = edgeFrame(nb)
    const cross = edge === 'left' ? f.u.x * g.u.y - f.u.y * g.u.x : g.u.x * f.u.y - g.u.y * f.u.x
    if (cross > -1e-9) continue
    const leadEdge = edge === 'left' ? 'right' : 'left'
    const lead = doors.find(z => facetOf(z) === nb.edge.id && atEnd(z, leadEdge)
      && z.Y < t.Y + t.DY - NEAR && t.Y < z.Y + z.DY - NEAR)
    if (!lead || lead.hinge_side === leadEdge) continue
    out.set(zoneKey(t), { role: 'trailing', other: lead, pieEdge: edge })
    out.set(zoneKey(lead), { role: 'lead', other: t, pieEdge: leadEdge })
  }
  return out
}

// ── Drawers ────────────────────────────────────────────────────

export interface ZoneOpening {
  /** Depth (from the front edge line) a box can run back before it leaves the carcass. */
  availableDepth: number
  /** Clear width (zone-frame x) over the front `depth` of the opening, or null. */
  span(depth: number): { x0: number; x1: number } | null
  /** Does a square panel back up this x over the front `depth`? (else: packer) */
  squarePanelAt(x: number, depth: number): boolean
}

const MIN_BOX = 100

/** The opening behind a drawer front on a shaped cabinet, in the zone frame. */
export function drawerOpening(ctx: ShapedHardwareCtx, z: ResolvedFaceZone, r: ConstructionRules): ZoneOpening | null {
  const i = facetIndex(ctx, z)
  if (i < 0) return null
  const s = ctx.segs[i]
  const poly = ctx.inner.map(p => toZone(z, p))
  const zFront = toZone(z, s.p1).y
  const lo = z.X, hi = z.X + z.DX, xc = (lo + hi) / 2

  // Inside of the polygon along the line z = zc, the run containing the zone centre.
  const slice = (zc: number): [number, number] | null => {
    const xs: number[] = []
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k], b = poly[(k + 1) % poly.length]
      if ((a.y > zc) === (b.y > zc)) continue
      xs.push(a.x + (zc - a.y) / (b.y - a.y) * (b.x - a.x))
    }
    xs.sort((p, q) => p - q)
    for (let k = 0; k + 1 < xs.length; k += 2) if (xs[k] <= xc && xc <= xs[k + 1]) return [xs[k], xs[k + 1]]
    return null
  }
  const span = (depth: number) => {
    let x0 = lo, x1 = hi
    const N = 16
    for (let k = 0; k <= N; k++) {
      const sl = slice(zFront - 0.5 - (depth - 0.5) * k / N)
      if (!sl) return null
      x0 = Math.max(x0, sl[0]); x1 = Math.min(x1, sl[1])
    }
    return x1 - x0 > 0 ? { x0, x1 } : null
  }
  const fits = (d: number) => { const sp = span(d); return !!sp && sp.x1 - sp.x0 >= MIN_BOX }
  const reach = zFront - Math.min(...poly.map(p => p.y))
  if (!fits(1)) return { availableDepth: 0, span, squarePanelAt: () => false }
  let a = 1, b = reach
  for (let k = 0; k < 30; k++) { const m = (a + b) / 2; if (fits(m)) a = m; else b = m }

  return {
    availableDepth: a - r.SCRBK - r.SLIDE_SETBACK,
    span,
    squarePanelAt(x, depth) {
      const z0 = zFront - depth, z1 = zFront
      let cover = 0
      for (let k = 0; k < poly.length; k++) {
        const p = poly[k], q = poly[(k + 1) % poly.length]
        if (Math.abs(p.x - x) > NEAR || Math.abs(q.x - x) > NEAR) continue
        cover += Math.max(0, Math.min(z1, Math.max(p.y, q.y)) - Math.max(z0, Math.min(p.y, q.y)))
      }
      return cover >= depth * 0.8
    },
  }
}

// ── Drawer clash ───────────────────────────────────────────────
// Boxes on different facets can run into each other behind the corner. Plan
// footprint of each box (runners included) in cabinet coords; SAT on the
// convex quads, only for boxes that overlap in height.

function stackQuad(s: ResolvedDrawerStack): ShapePt[] {
  const run = s.slides[0]?.runner_thickness ?? 0
  const x0 = s.box_X - run, x1 = s.box_X + s.box_width + run
  const z0 = s.box_Z, z1 = s.box_Z + s.box_depth
  return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, zz]) => {
    const [X, , Z] = turnPoint(s.turn, x, 0, zz)
    return { x: X, y: Z }
  })
}

function overlap(a: ShapePt[], b: ShapePt[]): boolean {
  for (const poly of [a, b]) {
    for (let k = 0; k < poly.length; k++) {
      const p = poly[k], q = poly[(k + 1) % poly.length]
      const ax = { x: q.y - p.y, y: p.x - q.x }
      const proj = (pts: ShapePt[]) => pts.map(v => v.x * ax.x + v.y * ax.y)
      const pa = proj(a), pb = proj(b)
      if (Math.max(...pa) <= Math.min(...pb) + 1 || Math.max(...pb) <= Math.min(...pa) + 1) return false
    }
  }
  return true
}

export function drawerClashes(stacks: ResolvedDrawerStack[]): ResolverError[] {
  const out: ResolverError[] = []
  const where = (s: ResolvedDrawerStack) => s.facet ? `the ${s.facet} facet` : 'the front'
  // One warning per pair of facets, listing the rows that clash.
  const pairs = new Map<string, { a: ResolvedDrawerStack; b: ResolvedDrawerStack; rows: string[] }>()
  for (let i = 0; i < stacks.length; i++) {
    for (let j = i + 1; j < stacks.length; j++) {
      const a = stacks[i], b = stacks[j]
      if ((a.facet ?? '') === (b.facet ?? '')) continue
      if (a.box_Y + a.box_height <= b.box_Y || b.box_Y + b.box_height <= a.box_Y) continue
      if (!overlap(stackQuad(a), stackQuad(b))) continue
      const k = `${a.facet ?? ''}|${b.facet ?? ''}`
      const e = pairs.get(k) ?? { a, b, rows: [] }
      e.rows.push(`[${a.face_zone_row},${a.face_zone_col}]↔[${b.face_zone_row},${b.face_zone_col}]`)
      pairs.set(k, e)
    }
  }
  for (const { a, b, rows } of pairs.values()) {
    out.push({
      code: 'DRAWER_FACET_CLASH',
      message: `Drawers on ${where(a)} and ${where(b)} run into each other behind the corner (${rows.join(', ')}) — use shorter runners or make one side doors`,
      part: 'drawer_box',
    })
  }
  return out
}
