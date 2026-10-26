// Part solids — each resolved part as the 3D view builds it (box + turn + shape),
// in cabinet coords, so 2D drawings (cabinet sheets) can show true shapes.
//
// Cabinet frame: origin bottom-left-back, +X right, +Y up, +Z front (mm).
// A part = a box-local solid ([0..w]×[0..h]×[0..d]) placed at its box corner
// and turned by an XYZ Euler rotation about that corner (PartViewer <Part>).
// A shaped part replaces the box with its outline extruded through the panel,
// in the frames documented on PartShape (PartViewer.buildShapedGeometry does
// the same mapping for the mesh — keep the two in step).

import type { ResolvedCabinet, ResolvedToekickPart, ResolvedInternalPart, ResolvedFaceZone } from './resolver/types'
import type { ShapePt, ShapeSegmentLike, EdgeTag } from './shapePath'
import { sampleOutline, sampleShapeOutline, outlineEdges } from './shapePath'
import { caseBox, zoneBevelOutline, caseBevelOutline, tkBevelOutline, rotEulerXYZ } from './jointDrilling'
import { sharknoseProfile } from './handleGeometry'
import { isShapedPanelKey, zonePartId, dbPartId } from './cabinetShape/partKeys'
import { dbBox } from './drawerHardwareBoxes'

export type Box3D = { x: number; y: number; z: number; w: number; h: number; d: number }
export type PanelKind = 'side' | 'horizontal' | 'face'

// A part's drawn outline, sampled, in the shape frame: mm, x across, y DOWN from
// the part's visual top, authored face-front in the Part Editor. `mirror` = right-hand
// side twins (authored on the mirrored display frame). `extrude: 'up'` = a top-view
// outline (x across, y DOWN from the front face) extruded up the part's height.
// `extrude: 'across'` = a side profile (x = depth from the back face, y = up from the
// bottom) extruded across the part's width. `holes` = inner loops, same frame.
// `tape` = draw its edge tape in 3D, cut to the outline (linear strip handles).
// `edges` = which outline edges carry which edge-band flag (resolver outlines of a
// shaped cabinet's horizontals, bevelled panel ends): the 3D view draws tape and
// edge-banding targets along them. `caps` (extrude 'up' only) = the flags on the
// extrusion's two ends (a bevelled panel's bottom / top edges).
export type ShapeEdge = { pts: ShapePt[]; e: EdgeTag }
export type PartShape = {
  pts: ShapePt[]; mirror?: boolean; extrude?: 'up' | 'across'; holes?: ShapePt[][]; tape?: boolean
  edges?: ShapeEdge[]; caps?: { lo: EdgeTag; hi: EdgeTag }
}

// ── Boxes (same as the cabinet 3D view) ──────────────────────────────────────

export function tkBox(p: ResolvedToekickPart): Box3D {
  return p.part_key === 'spreader_horizontal'
    ? { x: p.X, y: p.Y, z: p.Z, w: p.DX, h: p.DY, d: p.DZ }
    : { x: p.X, y: p.Y, z: p.Z, w: p.DY, h: p.DX, d: p.DZ }
}

export function intBox(p: ResolvedInternalPart): Box3D {
  // Inner-drawer / pull-out parts carry the drawer-box dimension convention
  // (Z = front face); shelf-like parts store Z at the back edge.
  switch (p.part_type) {
    case 'divider':
      return { x: p.X, y: p.Y, z: p.Z, w: p.DZ, h: p.DY, d: p.DX }
    case 'inner_drawer_side':
    case 'pull_out_side':
      return { x: p.X, y: p.Y, z: p.Z - p.DX, w: p.DZ, h: p.DY, d: p.DX }
    case 'inner_drawer_front':
    case 'inner_drawer_back':
    case 'pull_out_back':
      return { x: p.X, y: p.Y, z: p.Z - p.DZ, w: p.DY, h: p.DX, d: p.DZ }
    case 'inner_drawer_bottom':
    case 'pull_out_bottom':
      return { x: p.X, y: p.Y, z: p.Z - p.DX, w: p.DY, h: p.DZ, d: p.DX }
    default:   // adj_shelf, fixed_shelf, accessory
      return { x: p.X, y: p.Y, z: p.Z, w: p.DY, h: p.DZ, d: p.DX }
  }
}

export function zoneBox(z: ResolvedFaceZone): Box3D {
  return { x: z.X, y: z.Y, z: z.Z, w: z.DX, h: z.DY, d: z.DZ }   // face: DX=width, DY=height
}

export const INT_PANEL_KIND: Record<string, PanelKind> = {
  divider: 'side', inner_drawer_side: 'side', pull_out_side: 'side',
  inner_drawer_front: 'face', inner_drawer_back: 'face', pull_out_back: 'face',
  // adj_shelf, fixed_shelf, inner_drawer_bottom, pull_out_bottom, accessory → horizontal
}

// ── Shapes (resolver outlines, bevels, sharknose, Shape Editor overrides) ────

/** part id → shape, exactly as the cabinet 3D view draws them. A Shape Editor
 *  override replaces the resolver's outline for the same part. */
export function partShapes(rp: ResolvedCabinet, overrides?: Record<string, { segments?: ShapeSegmentLike[] }>): Map<string, PartShape> {
  const m = new Map<string, PartShape>()
  // Resolver outlines (shaped cabinets' bottom / top / shelves); turned per-edge
  // panels carry theirs in their own face frame.
  for (const p of rp.case_parts) if (p.outline && (!p.AY || isShapedPanelKey(p.part_key))) m.set(`case_${p.part_key}`, {
    pts: sampleOutline(p.outline, 2),
    edges: outlineEdges(p.outline, 2),
    ...(p.cutouts?.length ? { holes: p.cutouts.map(c => sampleOutline(c.pts, 2)) } : {}),   // rib cut-outs (z_curved_end C4)
  })
  // Curved end face board (z_curved_end): its bent plan shape extruded up.
  for (const p of rp.case_parts) {
    if (!p.wrap) continue
    const b = caseBox(p)
    m.set(`case_${p.part_key}`, { pts: sampleOutline(p.wrap.pts, 2).map(q => ({ x: q.x - b.x, y: b.z + b.d - q.y })), extrude: 'up' })
  }
  // Angled panel ends (4a): top-view outline extruded up.
  for (const p of rp.case_parts) {
    const o = caseBevelOutline(p)
    // Its ends (o[1]→o[2] the far end, o[3]→o[0] the near one) are the right /
    // left edges; bottom / top are the extrusion's ends.
    if (o) m.set(`case_${p.part_key}`, {
      pts: o, extrude: 'up',
      edges: [{ pts: [o[1], o[2]], e: 'right' }, { pts: [o[3], o[0]], e: 'left' }],
      caps: { lo: 'bottom', hi: 'top' },
    })
  }
  // Mitred kick boards on shaped cabinets (4b).
  for (const p of rp.toekick_parts) {
    const o = tkBevelOutline(p)
    if (o) m.set(`tk_${p.part_key}_${p.sort_order}`, { pts: o, extrude: 'up' })
  }
  for (const p of rp.internal_parts ?? []) if (p.outline) m.set(`int_${p.part_type}_${p.sort_order}`, { pts: sampleOutline(p.outline, 2), edges: outlineEdges(p.outline, 2) })
  for (const z of rp.face_zones) {
    // Mitred doors where two facets meet: top-view outline extruded up.
    const o = zoneBevelOutline(z)
    if (o) m.set(zonePartId(z), { pts: o.map(q => ({ x: q.x, y: z.DZ - q.z })), extrude: 'up' })
    // Sharknose fronts (z_handles H3): side profile with the back bevel.
    const sn = sharknoseProfile(z)
    if (sn) m.set(zonePartId(z), { pts: sn, extrude: 'across' })
  }
  // Linear strip handles (z_handles D17): the sharknose on the strip's finger edge.
  for (const p of rp.case_parts) {
    const s = linearStripShape(p)
    if (s) m.set(`case_${p.part_key}`, s)
  }
  for (const [pid, ov] of Object.entries(overrides ?? {})) {
    if (pid.startsWith('slide_')) continue
    if ((ov.segments?.length ?? 0) > 2) m.set(pid, { pts: sampleShapeOutline(ov.segments!), mirror: pid.includes('right_side') })
  }
  return m
}

/** A linear strip handle's sharknose (z_handles D17): the back of its finger
 *  edge cut away at the saw tilt, leaving `land` at the front — like a sharknose
 *  front (sharknoseProfile). Box: w = length / width along X, h = height, d =
 *  thickness, back face against the door. A horizontal strip (bevel bottom /
 *  top) is a side profile across its length; a vertical one (bevel left / right)
 *  a top-view outline extruded up its height. */
export function linearStripShape(p: ResolvedCaseLike): PartShape | null {
  const lh = p.lh
  if (!lh) return null
  const b = caseBox(p)
  const d = b.d, land = Math.min(Math.max(lh.land, 0), d)
  const run = (d - land) * Math.tan((lh.angle_deg * Math.PI) / 180)
  if (lh.bevel_edge === 'bottom' || lh.bevel_edge === 'top') {
    const r = Math.min(run, b.h)   // across: x = depth from the back face, y = up
    return { extrude: 'across', tape: true, pts: lh.bevel_edge === 'bottom'
      ? [{ x: 0, y: r }, { x: d - land, y: 0 }, { x: d, y: 0 }, { x: d, y: b.h }, { x: 0, y: b.h }]
      : [{ x: 0, y: 0 }, { x: d, y: 0 }, { x: d, y: b.h }, { x: d - land, y: b.h }, { x: 0, y: b.h - r }] }
  }
  const r = Math.min(run, b.w)     // up: x across, y down from the front face
  return { extrude: 'up', tape: true, pts: lh.bevel_edge === 'left'
    ? [{ x: 0, y: 0 }, { x: b.w, y: 0 }, { x: b.w, y: d }, { x: r, y: d }, { x: 0, y: land }]
    : [{ x: 0, y: 0 }, { x: b.w, y: 0 }, { x: b.w, y: land }, { x: b.w - r, y: d }, { x: 0, y: d }] }
}
type ResolvedCaseLike = ResolvedCabinet['case_parts'][number]

// ── Solids in cabinet coords ─────────────────────────────────────────────────

export type V3 = [number, number, number]
/** A prism: `outer` (+ `holes`) is one cap, `ext` runs it to the other cap. */
export interface Prism { outer: V3[]; holes: V3[][]; ext: V3 }

/** Box-local cap loop + extrusion of a shaped part (buildShapedGeometry's mapping). */
function localPrism(shape: PartShape, b: Box3D, kind: PanelKind): Prism {
  const map = (f: (p: ShapePt) => V3) => ({ outer: shape.pts.map(f), holes: (shape.holes ?? []).filter(h => h.length > 2).map(h => h.map(f)) })
  if (shape.extrude === 'across') return { ...map(p => [b.w, p.y, p.x]), ext: [-b.w, 0, 0] }   // profile in (Z, Y), across X
  const k: PanelKind = shape.extrude === 'up' ? 'horizontal' : kind
  if (k === 'side') return shape.mirror
    ? { ...map(p => [0, b.h - p.y, b.d - p.x]), ext: [b.w, 0, 0] }
    : { ...map(p => [b.w, b.h - p.y, p.x]), ext: [-b.w, 0, 0] }
  if (k === 'horizontal') return { ...map(p => [p.x, b.h, b.d - p.y]), ext: [0, -b.h, 0] }
  return { ...map(p => [p.x, b.h - p.y, 0]), ext: [0, 0, b.d] }   // face: profile XY, thickness +Z
}

/** A part as a prism in cabinet coords: its shape (or box) at its box corner,
 *  turned by `rotDeg` (XYZ Euler, degrees) about that corner. */
export function partPrism(b: Box3D, kind: PanelKind, shape?: PartShape | null, rotDeg?: V3 | null): Prism {
  const local: Prism = shape && shape.pts.length > 2
    ? localPrism(shape, b, kind)
    : { outer: [[0, 0, 0], [b.w, 0, 0], [b.w, b.h, 0], [0, b.h, 0]], holes: [], ext: [0, 0, b.d] }
  const rot = rotDeg && (rotDeg[0] || rotDeg[1] || rotDeg[2]) ? rotDeg : null
  const turn = (v: V3): V3 => rot ? rotEulerXYZ(rot[0], rot[1], rot[2], v[0], v[1], v[2]) : v
  const place = (v: V3): V3 => { const r = turn(v); return [b.x + r[0], b.y + r[1], b.z + r[2]] }
  return { outer: local.outer.map(place), holes: local.holes.map(h => h.map(place)), ext: turn(local.ext) }
}

// ── Every resolved part as a solid ───────────────────────────────────────────

export type SolidRole = 'case' | 'kick' | 'spreader' | 'face' | 'int' | 'db'
/** `special` = its rect isn't its true shape (shaped, or turned by AY / a rotation override). */
export type PartSolid = { id: string; role: SolidRole; prism: Prism; shaped: boolean; special: boolean }
type PosOv = { ox: number; oy: number; oz: number; oax?: number; oay?: number; oaz?: number; sw?: number; sh?: number; sd?: number }

/** part id → solid, as the cabinet 3D view builds it (position / size / rotation
 *  overrides, AY turns, shapes). Shared by the cabinet sheets and the editor's
 *  ortho views. */
export function buildPartSolids(rp: ResolvedCabinet, partOverrides?: Record<string, PosOv>,
  shapeOvs?: Record<string, { segments?: ShapeSegmentLike[] }>): Map<string, PartSolid> {
  const shapes = partShapes(rp, shapeOvs)
  const out = new Map<string, PartSolid>()
  const applyOv = <T extends { X: number; Y: number; Z: number }>(p: T, id: string): T => {
    const o = partOverrides?.[id]; return o ? { ...p, X: p.X + o.ox, Y: p.Y + o.oy, Z: p.Z + o.oz } : p
  }
  const add = (id: string, role: SolidRole, b0: Box3D, kind: PanelKind, ay = 0) => {
    const o = partOverrides?.[id]
    const b = o ? { ...b0, w: o.sw ?? b0.w, h: o.sh ?? b0.h, d: o.sd ?? b0.d } : b0
    const r: V3 = [o?.oax ?? 0, (o?.oay ?? 0) + ay, o?.oaz ?? 0]
    const rot = r[0] || r[1] || r[2] ? r : null
    const shape = shapes.get(id)
    out.set(id, { id, role, prism: partPrism(b, kind, shape, rot), shaped: !!shape, special: !!shape || !!rot })
  }
  const caseKind = (p: ResolvedCabinet['case_parts'][number]): PanelKind =>
    p.wrap ? 'face' : p.part_key === 'left_side' || p.part_key === 'right_side' ? 'side'
      : p.part_key === 'back' || isShapedPanelKey(p.part_key) || p.upright ? 'face' : 'horizontal'
  rp.case_parts.forEach(p => { const id = `case_${p.part_key}`; add(id, 'case', caseBox(applyOv(p, id)), caseKind(p), p.AY ?? 0) })
  rp.toekick_parts.forEach(p => {
    const id = `tk_${p.part_key}_${p.sort_order}`
    add(id, p.part_key.startsWith('spreader') ? 'spreader' : 'kick', tkBox(applyOv(p, id)),
      p.part_key === 'spreader_horizontal' ? 'horizontal' : p.part_key === 'spreader_vertical' ? 'side' : 'face', p.AY ?? 0)
  })
  rp.face_zones.filter(z => z.face_type !== 'open').forEach(z => { const id = zonePartId(z); add(id, 'face', zoneBox(applyOv(z, id)), 'face', z.AY ?? 0) })
  ;(rp.internal_parts ?? []).forEach(p => { const id = `int_${p.part_type}_${p.sort_order}`; add(id, 'int', intBox(applyOv(p, id)), INT_PANEL_KIND[p.part_type] ?? 'horizontal') })
  ;(rp.drawer_stacks ?? []).forEach(stk => stk.box_parts.forEach(p => add(dbPartId(stk, p.part_type), 'db', dbBox(p),
    p.part_type === 'db_left_side' || p.part_type === 'db_right_side' ? 'side' : p.part_type === 'db_bottom' ? 'horizontal' : 'face')))
  return out
}

// ── Orthographic projection ──────────────────────────────────────────────────

export type View2D = 'front' | 'side' | 'plan'
type P2 = { x: number; y: number }
/** front: (x, y up) · side: (z, y up), looking from the right · plan: (x, z), from above. */
const project = (v: V3, view: View2D): P2 =>
  view === 'front' ? { x: v[0], y: v[1] } : view === 'side' ? { x: v[2], y: v[1] } : { x: v[0], y: v[2] }

function hull(points: P2[]): P2[] {
  const pts = points.slice().sort((p, q) => p.x - q.x || p.y - q.y)
  if (pts.length < 3) return pts
  const cross = (o: P2, a: P2, b: P2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: P2[] = [], upper: P2[] = []
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p) }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p) }
  lower.pop(); upper.pop()
  return lower.concat(upper)
}

/** A prism's outline in an ortho view, in that view's mm (y up for front / side,
 *  z down-page for plan). Seen face-on (extrusion along the view axis) it's the true
 *  outline with its holes; otherwise the silhouette (hull of both caps). */
export function prismOutline(pr: Prism, view: View2D): { outer: P2[]; holes: P2[][] } {
  const e = project(pr.ext, view)
  if (Math.hypot(e.x, e.y) < 0.5) return { outer: pr.outer.map(v => project(v, view)), holes: pr.holes.map(h => h.map(v => project(v, view))) }
  const caps = pr.outer.flatMap(v => [project(v, view), project([v[0] + pr.ext[0], v[1] + pr.ext[1], v[2] + pr.ext[2]], view)])
  return { outer: hull(caps), holes: [] }
}

/** Highest point of a prism (plan-view painter order: lower parts first). */
export function prismTop(pr: Prism): number {
  let t = -Infinity
  for (const v of pr.outer) t = Math.max(t, v[1], v[1] + pr.ext[1])
  return t
}
