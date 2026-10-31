// ============================================================
// Shaped-cabinet fronts (z_cabinet_shape Phase 3a).
//
// Every straight `front` edge of the footprint is a facet with its own face
// grid. The primary facet — the straight front (y = DZ), else the longest
// front edge — uses cab.face_grid and keeps the zone_<r>_<c> ids; the others
// use cab.faces[edgeId] (default: one door hinged toward its side panel).
//
// Each facet runs the ordinary resolveFace in a facet-local frame (X from the
// facet's left end as seen from the front), then its zones are turned onto
// the facet: AY about the zone's min corner, local +X → along the facet to the
// right, local +Z → out of the cabinet. For a facet on y = DZ that is exactly
// the box front (AY = 0, same X/Z), so a rectangle-like footprint resolves
// identically to the plain cabinet.
//
// Facet ends: next to a side panel → the usual neighbour reveal (the box's
// left/right neighbour on x = 0 / x = DX, an end reveal elsewhere), measured
// in from the panel's outer face to the door's outermost corner (an angled
// side would otherwise have the door's front corner past the cabinet side); next to
// another front facet at a convex corner → mitred doors (decision 9): the door
// runs past the corner by tan(φ/2)·(mid-thickness offset) less half the column
// gap, and the zone carries bevel_l / bevel_r = φ/2.
// ============================================================

import type {
  CabinetInput, ConstructionRules, FaceGridInput, ResolvedFaceZone, ResolvedFaceRow, ResolvedFaceCol,
} from './types'
import { resolveFace, type FaceResolution } from './resolveFace'
import { resolveReveal, resolveFaceZ } from './mergeRules'
import { shapedInterior } from './resolveShapedCase'
import { edgeFrame, type EdgeFrame } from '../cabinetShape/construct'
import { edgeSub, getJoin, type FootprintSegment } from '../cabinetShape/footprint'

const NEAR = 0.5

const isPanel = (s: FootprintSegment) =>
  s.type === 'line' && (s.edge.role === 'side' || s.edge.role === 'back')
const isFrontLine = (s: FootprintSegment) => s.type === 'line' && s.edge.role === 'front'
// A front set to Open (no doors, z_cabinet_shape_edit E1) builds no face; its
// neighbours treat it as an open edge.
const isDoorFront = (s: FootprintSegment) => isFrontLine(s) && edgeSub(s.edge) !== 'open'

/** Edge id of the primary front facet, or null when the footprint has no straight front. */
export function primaryFacetId(segs: FootprintSegment[], DZ: number): string | null {
  const fronts = segs.filter(isFrontLine)
  if (!fronts.length) return null
  const len = (s: FootprintSegment) => edgeFrame(s).len
  const straight = fronts.filter(s => Math.abs(s.p0.y - DZ) < NEAR && Math.abs(s.p1.y - DZ) < NEAR)
  const pool = straight.length ? straight : fronts
  return pool.reduce((a, b) => (len(b) > len(a) ? b : a)).edge.id
}

// Clearance past the other door's thickness at an inside (pie) corner.
const PIE_CORNER_GAP = 2

// Door thickness + back-plane offset out of the edge line (overlay > 0, inset < 0).
function doorPlane(cab: CabinetInput, r: ConstructionRules) {
  const ft = cab.resolved_doors?.['*']?.thickness_mm ?? cab.door_material.DZ
  return { ft, backOff: resolveFaceZ(cab.DZ, ft, r) - cab.DZ }
}

// Reveal at a facet end that is not another front facet.
function endReveal(cab: CabinetInput, r: ConstructionRules, nb: FootprintSegment, vertex: { x: number }, side: 'left' | 'right') {
  if (isPanel(nb) && Math.abs(vertex.x) < NEAR) return resolveReveal('left', cab.left_neighbour, r)
  if (isPanel(nb) && Math.abs(vertex.x - cab.DX) < NEAR) return resolveReveal('right', cab.right_neighbour, r)
  return side === 'left' ? r.REVENDL : r.REVENDR
}

// A door end next to a panel / open edge: run the door along the facet until
// its outermost corner (back or front face — the front leans out past an
// angled side) is `rev` inside that edge's outer plane. A square corner gives
// exactly `rev`. `away` = along the facet from the vertex.
function doorRun(rev: number, f: EdgeFrame, nb: FootprintSegment, away: { x: number; y: number }, backOff: number, ft: number) {
  const g = edgeFrame(nb)
  const k = away.x * g.n.x + away.y * g.n.y
  if (k < 1e-3) return rev               // (near) in line, e.g. a face filler beside an open front
  const lean = f.n.x * g.n.x + f.n.y * g.n.y
  return Math.max(...[backOff, backOff + ft].map(off => (rev + off * lean) / k))
}

/**
 * How far along front facet `facet` (from its vertex V with neighbour `nb`) the
 * door at that end starts — the case resolver brings a square-fronted side
 * panel forward to it (z_cabinet_shape 4a).
 */
export function facetDoorRun(cab: CabinetInput, r: ConstructionRules, facet: FootprintSegment, nb: FootprintSegment, V: { x: number; y: number }): number {
  const f = edgeFrame(facet)
  const atP1 = Math.hypot(V.x - facet.p1.x, V.y - facet.p1.y) < NEAR
  const side = atP1 ? 'left' : 'right'
  const away = atP1 ? { x: -f.u.x, y: -f.u.y } : f.u
  const { ft, backOff } = doorPlane(cab, r)
  return doorRun(endReveal(cab, r, nb, V, side), f, nb, away, backOff, ft)
}

function singleDoor(hinge: 'left' | 'right'): FaceGridInput {
  return {
    rows: [{ row_index: 0, height_locked: false }],
    cols: [{ col_index: 0, width_locked: false }],
    zones: [{ row_index: 0, col_index: 0, face_type: 'door', hinge_side: hinge }],
  }
}

function fillerPanel(): FaceGridInput {
  return {
    rows: [{ row_index: 0, height_locked: false }],
    cols: [{ col_index: 0, width_locked: false }],
    zones: [{ row_index: 0, col_index: 0, face_type: 'false_panel' }],
  }
}

export function resolveShapedFaces(cab: CabinetInput, r: ConstructionRules): FaceResolution {
  const shape = shapedInterior(cab)
  if (!shape) return resolveFace(cab, r)
  const { segs } = shape
  const n = segs.length
  const primary = primaryFacetId(segs, cab.DZ)

  const rows: ResolvedFaceRow[] = [], cols: ResolvedFaceCol[] = [], zones: ResolvedFaceZone[] = []
  const errors: FaceResolution['errors'] = []

  // Door back-plane offset out of the edge line (overlay > 0, inset < 0) and a
  // nominal mid-thickness for the mitre run-past.
  const { ft, backOff } = doorPlane(cab, r)
  const midOff = backOff + ft / 2

  // Concave facet corner (L / pie corner): both doors stop door thickness + 2
  // back from the doors' inside corner (where their back planes meet, FACBUF
  // out from the carcass corner), so each end is 2 clear of the other door's
  // face (Mark, 2026-10-15). Inset doors sit behind the facet lines and keep
  // the plain gap.
  const concaveRev = () => backOff < 0 ? r.GAPC / 4 : backOff + ft + PIE_CORNER_GAP

  segs.forEach((s, i) => {
    if (!isDoorFront(s)) return
    const isPrimary = s.edge.id === primary
    const f = edgeFrame(s)
    const prev = segs[(i - 1 + n) % n], next = segs[(i + 1) % n]

    // Local left end = p1 (next edge), local right end = p0 (previous edge).
    const end = (nb: FootprintSegment, vertex: { x: number }, side: 'left' | 'right', convexCross: number) => {
      const phi = () => {
        const g = edgeFrame(nb)
        return Math.acos(Math.max(-1, Math.min(1, f.u.x * g.u.x + f.u.y * g.u.y)))
      }
      // Square doors at an outside facet corner (joins 'reveal',
      // z_cabinet_shape_edit E2): each door stops where its back face meets the
      // corner line, less the gap — the doors' regions split on that line, so
      // they can't touch; the corner shows a small open triangle.
      if (isDoorFront(nb) && convexCross > 1e-9 && getJoin(cab.footprint, s.edge.id, nb.edge.id) === 'reveal')
        return { rev: r.GAPC / 4 - Math.tan(phi() / 2) * backOff, bevel: 0 }
      if (isDoorFront(nb) && convexCross > 1e-9) {
        const p = phi()
        return { rev: r.GAPC / 4 - Math.tan(p / 2) * midOff, bevel: (p / 2) * 180 / Math.PI }
      }
      // Two face fillers at an inside corner (z_angled_filler): a tight mitre.
      // The mid-thickness lines meet short of the vertex; negative bevel = the
      // front face is the shorter.
      if (isDoorFront(nb) && s.edge.filler && nb.edge.filler) {
        const p = phi()
        return { rev: Math.tan(p / 2) * midOff, bevel: -(p / 2) * 180 / Math.PI }
      }
      if (isDoorFront(nb)) return { rev: concaveRev(), bevel: 0 }
      const away = side === 'left' ? { x: -f.u.x, y: -f.u.y } : f.u
      return { rev: doorRun(endReveal(cab, r, nb, vertex, side), f, nb, away, backOff, ft), bevel: 0 }
    }
    const crossNext = f.u.x * edgeFrame(next).u.y - f.u.y * edgeFrame(next).u.x
    const crossPrev = edgeFrame(prev).u.x * f.u.y - edgeFrame(prev).u.y * f.u.x
    const L = end(next, s.p1, 'left', crossNext)
    const R = end(prev, s.p0, 'right', crossPrev)

    // A face filler is always one false panel whose front face is exactly
    // filler.width wide: the end that isn't mitred takes up the difference
    // between the nominal face offset / reveal the shape was drawn with and
    // the real ones. Front width = DX + (ft/2)·(tan bevel_l + tan bevel_r).
    if (s.edge.filler) {
      const tb = (b: number) => Math.tan(b * Math.PI / 180) * ft / 2
      const DX = s.edge.filler.width - tb(L.bevel) - tb(R.bevel)
      if (L.bevel && !R.bevel) R.rev = f.len - L.rev - DX
      else if (!L.bevel) L.rev = f.len - R.rev - DX
    }
    const grid = s.edge.filler
      ? fillerPanel()
      : isPrimary
        ? cab.face_grid
        : cab.faces?.[s.edge.id] ?? singleDoor(isPanel(prev) ? 'right' : 'left')

    const res = resolveFace({ ...cab, face_grid: grid }, r, {
      width: f.len, revL: L.rev, revR: R.rev, doorKeyPrefix: isPrimary ? '' : s.edge.id,
    })
    const facet = isPrimary ? undefined : s.edge.id
    for (const e of res.errors) errors.push({ ...e, message: facet ? `Facet "${facet}": ${e.message}` : e.message })
    for (const row of res.rows) rows.push(facet ? { ...row, facet } : row)
    for (const col of res.cols) cols.push(facet ? { ...col, facet } : col)

    // Turn the facet-local zones onto the facet: +X → -u, +Z → -n (outward).
    const ay = Math.atan2(f.u.y, -f.u.x) * 180 / Math.PI
    const lastCol = Math.max(...grid.cols.map(c => c.col_index))
    for (const z of res.zones) {
      const xl = z.X, zo = z.Z - cab.DZ
      const X = s.p1.x - f.u.x * xl - f.n.x * zo
      const Z = s.p1.y - f.u.y * xl - f.n.y * zo
      const out: ResolvedFaceZone = { ...z, X, Z, AY: Math.abs(ay) < 1e-9 ? 0 : ay }
      if (facet) out.facet = facet
      if (L.bevel && z.col_index === 0) out.bevel_l = L.bevel
      if (R.bevel && z.col_index === lastCol) out.bevel_r = R.bevel
      zones.push(out)
    }
  })

  if (!primary && !segs.some(isFrontLine) && cab.has_face)
    errors.push({ code: 'SHAPE_NO_FRONT', message: 'Shape has no straight front edge — no doors or drawer fronts', part: 'face' })

  return { rows, cols, zones, errors }
}
