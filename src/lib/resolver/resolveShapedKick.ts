// ============================================================
// Shaped-cabinet toe kick (z_cabinet_shape Phase 4b).
//
// The kick follows the footprint: its outline K is the footprint pushed in by
// the toe setbacks (front / open edges TOESCF, back TOESCB, the end at x = 0 /
// x = DX TOESCL / TOESCR, other sides 0). Arcs are kicked along their chord.
//   - every front edge of K gets a kick face (TF) and, behind it, a sub front
//     (TI, lifted TOEFC); where two front edges meet the boards are mitred
//     (decision 13), against a side / back they end square inside K;
//   - every back edge gets a kick back (TI), butted like the carcass backs;
//   - every side edge gets an end spreader along it (turned with the edge),
//     internal spreaders sit at TOESP centres across the width (front-to-back,
//     cut square to fit), each with its horizontal brace.
// Frames (AY about the part's min corner, three.js Y — see caseRot):
//   kick face / sub front  zone-like: +X along the edge to the right seen from
//                          the front, +Z outward (back face at z = 0)
//   kick back              +X along the edge, +Z inward (outer face at z = 0)
//   spreaders / braces     thickness on local x, length on local z
// Boards are listed at their blank; bevel_lo / bevel_hi = degrees from square
// at local x = 0 / x = DY, + = the back (inner) face shorter.
// ============================================================

import type { CabinetInput, ConstructionRules, ResolvedToekickPart, ResolverError, EdgingDefaults } from './types'
import { edgeSidesToBanding, DEFAULT_EDGING } from './types'
import type { FootprintSegment } from '../cabinetShape/footprint'
import type { ShapePt } from '../shapePath'
import { canonicalSegments, edgeFrame, insetPolygon, vertexTrim, angledEnd, interiorAngle, type EdgeFrame } from '../cabinetShape/construct'

const NEAR = 0.5
const D = 180 / Math.PI

type Kind = 'front' | 'back' | 'side'
interface KEdge { kind: Kind; seg: FootprintSegment }

const kindOf = (s: FootprintSegment): Kind =>
  s.edge.role === 'front' || s.edge.role === 'open' ? 'front' : s.edge.role === 'back' ? 'back' : 'side'

/**
 * Where line P + d·t (d a unit vector) is inside the polygon — any polygon,
 * convex or not (an angled filler's kick has an inside corner, z_angled_filler:
 * the old half-plane cut let the far facet's line clip the end spreaders short).
 * Crossings, even–odd; returns the inside stretch containing `tRef`, else the
 * longest. A line lying exactly on an edge is ambiguous — callers nudge it in.
 */
function lineInterval(poly: ShapePt[], P: ShapePt, d: ShapePt, tRef?: number): [number, number] | null {
  const ts: number[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const sa = d.x * (a.y - P.y) - d.y * (a.x - P.x), sb = d.x * (b.y - P.y) - d.y * (b.x - P.x)
    if ((sa > 0) === (sb > 0)) continue
    const k = sa / (sa - sb)
    const q = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
    ts.push((q.x - P.x) * d.x + (q.y - P.y) * d.y)
  }
  ts.sort((u, v) => u - v)
  let best: [number, number] | null = null
  for (let i = 0; i + 1 < ts.length; i += 2) {
    const iv: [number, number] = [ts[i], ts[i + 1]]
    if (iv[1] - iv[0] <= 1e-6) continue
    if (tRef != null && tRef >= iv[0] - 1e-6 && tRef <= iv[1] + 1e-6) return iv
    if (!best || iv[1] - iv[0] > best[1] - best[0]) best = iv
  }
  return best
}

const NUDGE = 0.01   // mm — keeps a spreader's line off the outline it runs along

const isect = (a: [number, number] | null, b: [number, number] | null): [number, number] | null =>
  a && b && Math.min(a[1], b[1]) - Math.max(a[0], b[0]) > 1e-6 ? [Math.max(a[0], b[0]), Math.min(a[1], b[1])] : null

const bev = (c: { sOut: number; sIn: number }, t: number) => {
  const d = Math.atan2(c.sIn - c.sOut, t) * D
  return Math.abs(d) < 0.01 ? 0 : Math.round(d * 100) / 100
}

export function resolveShapedKick(
  cab: CabinetInput, r: ConstructionRules, toeType: 'ladder' | 'leg',
): { parts: ResolvedToekickPart[]; errors: ResolverError[] } {
  const parts: ResolvedToekickPart[] = []
  const errors: ResolverError[] = []
  const segs0 = canonicalSegments(cab.footprint!, cab.DX, cab.DZ)
  // Arcs → chords (the kick runs straight across a curved end).
  const edges: KEdge[] = segs0.map(s => ({
    kind: kindOf(s),
    seg: s.type === 'arc' ? { type: 'line', p0: s.p0, p1: s.p1, edge: s.edge } as FootprintSegment : s,
  }))
  const lines = edges.map(e => e.seg)
  const n = edges.length
  const edging: Required<EdgingDefaults> = { ...DEFAULT_EDGING, ...(r.EDGING ?? {}) }
  const TF = cab.toekick_face_material.DZ, TI = cab.toekick_interior_material.DZ
  const TK = r.TOEH, FC = r.TOEFC
  const fid = cab.toekick_face_material.id, iid = cab.toekick_interior_material.id

  const sideOff = (s: FootprintSegment) =>
    Math.abs(s.p0.x) < NEAR && Math.abs(s.p1.x) < NEAR ? r.TOESCL
    : Math.abs(s.p0.x - cab.DX) < NEAR && Math.abs(s.p1.x - cab.DX) < NEAR ? r.TOESCR : 0
  const off = (frontExtra: number, backExtra: number, sideExtra = 0) => (s: FootprintSegment) => {
    const k = kindOf(s)
    return k === 'front' ? r.TOESCF + frontExtra : k === 'back' ? r.TOESCB + backExtra : sideOff(s) + sideExtra
  }
  const K = insetPolygon(lines, off(0, 0))                 // kick face outer line
  const kEdge = (poly: ShapePt[], i: number) => ({ p0: poly[i], p1: poly[(i + 1) % n] })
  let sort = 0

  // One straight board on edge i of `poly`, `t` thick inward. Front boards mitre
  // into front neighbours; other ends are square and stay inside the polygon.
  const board = (poly: ShapePt[], i: number, t: number, mitreFronts: boolean, butt?: (j: number) => boolean) => {
    const e = kEdge(poly, i), f = edgeFrame(e)
    if (f.len < 1) return null
    const ip = (i - 1 + n) % n, inx = (i + 1) % n
    const end = (j: number, V: ShapePt, away: ShapePt, alpha: number) => {
      const nf: EdgeFrame = edgeFrame(kEdge(poly, j))
      if (mitreFronts && edges[j].kind === 'front' && Math.abs(alpha - 180) > 0.5)
        return angledEnd('mitre', V, away, f.n, nf, t)
      const s = vertexTrim(away, f.n, nf.n, t, butt?.(j) ?? false)
      return { sOut: s, sIn: s }
    }
    const c0 = end(ip, e.p0, f.u, interiorAngle(kEdge(poly, ip), e))
    const c1 = end(inx, e.p1, { x: -f.u.x, y: -f.u.y }, interiorAngle(e, kEdge(poly, inx)))
    const lo = Math.min(c0.sOut, c0.sIn), hi = f.len - Math.min(c1.sOut, c1.sIn)
    if (hi - lo < 1) return null
    return { e, f, lo, hi, b0: bev(c0, t), b1: bev(c1, t) }
  }

  // Kick face / sub front in the zone-like frame (+X = −u, +Z outward).
  const frontPart = (poly: ShapePt[], i: number, t: number, key: 'kick_front_face' | 'kick_sub_front', y: number, h: number, mat: string, eb: typeof edging.kick_front_face, ebId: string | null | undefined) => {
    const bd = board(poly, i, t, true)
    if (!bd) return
    const { e, f, lo, hi, b0, b1 } = bd
    const ay = Math.atan2(f.u.y, -f.u.x) * D
    parts.push({
      part_key: key, sort_order: sort++,
      DX: h, DY: hi - lo, DZ: t,
      X: e.p0.x + f.u.x * hi + f.n.x * t, Y: y, Z: e.p0.y + f.u.y * hi + f.n.y * t,
      AX: 0, AY: Math.abs(ay) < 1e-9 ? 0 : ay, AZ: 0,
      material_id: mat, edge_band: edgeSidesToBanding(eb, ebId ?? undefined), is_detached: false,
      // local x = 0 is the p1 end (hi); + = back face shorter
      ...(b1 ? { bevel_lo: b1 } : {}), ...(b0 ? { bevel_hi: b0 } : {}),
    })
  }

  const fronts = edges.map((e, i) => (e.kind === 'front' ? i : -1)).filter(i => i >= 0)
  for (const i of fronts)
    frontPart(K, i, TF, 'kick_front_face', 0, TK, fid, edging.kick_front_face, cab.toekick_face_edgeband_id)
  if (toeType === 'leg') return { parts, errors }

  const KS = insetPolygon(lines, off(TF, 0))               // sub front outer line
  for (const i of fronts)
    frontPart(KS, i, TI, 'kick_sub_front', FC, TK - FC, iid, edging.kick_sub_front, cab.toekick_interior_edgeband_id)

  // Kick backs: +X along the edge, +Z inward. Backs butt each other (earlier edge runs through).
  edges.forEach((ed, i) => {
    if (ed.kind !== 'back') return
    const bd = board(K, i, TI, false, j => edges[j].kind === 'back' && j < i)
    if (!bd) return
    const { e, f, lo, hi } = bd
    const ay = Math.atan2(-f.u.y, f.u.x) * D
    parts.push({
      part_key: 'kick_back', sort_order: sort++,
      DX: TK - FC, DY: hi - lo, DZ: TI,
      X: e.p0.x + f.u.x * lo, Y: FC, Z: e.p0.y + f.u.y * lo,
      AX: 0, AY: Math.abs(ay) < 1e-9 ? 0 : ay, AZ: 0,
      material_id: iid, edge_band: edgeSidesToBanding(edging.kick_back, cab.toekick_interior_edgeband_id), is_detached: false,
    })
  })

  // Spreaders live between the kick back and the sub front; internal ones also
  // stay clear of the end spreaders + their braces (a side edge that runs
  // across the width, e.g. a diagonal corner's, would otherwise be crossed).
  const sprH = TK - FC, sprBW = 100
  const KE = insetPolygon(lines, off(TF + TI, TI))
  const KI = insetPolygon(lines, off(TF + TI, TI, TI + sprBW))
  // A spreader (+ brace) between two parallel lines P0 + d·t and P0 + w·k + d·t
  // (k = TI for the spreader; the brace takes the next 100 on the inward side).
  // d is the length direction; `w` points across (thickness side).
  const spreader = (P0: ShapePt, d: ShapePt, w: ShapePt, KI: ShapePt[], tRef?: number) => {
    const across = (o: number) => ({ x: P0.x + w.x * o, y: P0.y + w.y * o })
    const iv = isect(lineInterval(KI, across(NUDGE), d, tRef), lineInterval(KI, across(TI - NUDGE), d, tRef))
    if (!iv || iv[1] - iv[0] < 50) return
    // Frame: local +Z = length dir (flip so AY stays in (−90°, 90°]); local +X = (dz, −dx).
    let dd = d, [t0, t1] = iv
    if (Math.atan2(d.x, d.y) * D <= -90 || Math.atan2(d.x, d.y) * D > 90) { dd = { x: -d.x, y: -d.y }; [t0, t1] = [-iv[1], -iv[0]] }
    const ay = Math.atan2(dd.x, dd.y) * D
    const lx = { x: dd.y, y: -dd.x }                       // local +X in plan
    const xPos = lx.x * w.x + lx.y * w.y > 0                // +X runs across the way w does
    const place = (o0: number, o1: number, tA: number, tB: number, key: 'spreader_vertical' | 'spreader_horizontal', y: number, h: number, wdt: number) => {
      const base = across(xPos ? o0 : o1)
      const start = { x: base.x + dd.x * tA, y: base.y + dd.y * tA }
      parts.push({
        part_key: key, sort_order: sort++,
        ...(key === 'spreader_vertical' ? { DX: h, DY: wdt } : { DX: wdt, DY: h }),
        DZ: tB - tA,
        X: start.x, Y: y, Z: start.y,
        AX: 0, AY: Math.abs(ay) < 1e-9 ? 0 : ay, AZ: 0,
        material_id: iid,
        edge_band: edgeSidesToBanding(key === 'spreader_vertical' ? edging.spreader_vertical : edging.spreader_horizontal, cab.toekick_interior_edgeband_id),
        is_detached: false,
      })
    }
    // Positions along dd use the flipped parameter: P0 + d·t = P0 + dd·(−t).
    place(0, TI, t0, t1, 'spreader_vertical', FC, sprH, TI)
    const bv = isect(lineInterval(KI, across(TI + NUDGE), d, tRef), lineInterval(KI, across(TI + sprBW - NUDGE), d, tRef))
    if (bv && bv[1] - bv[0] > 20) {
      const [b0, b1] = dd === d ? bv : [-bv[1], -bv[0]]
      place(TI, TI + sprBW, b0, b1, 'spreader_horizontal', TK - TI, TI, sprBW)
    }
  }

  // End spreaders along every side edge of K (inward = +n).
  edges.forEach((ed, i) => {
    if (ed.kind !== 'side') return
    const e = kEdge(K, i), f = edgeFrame(e)
    if (f.len < 1) return
    spreader(e.p0, f.u, f.n, KE, f.len / 2)
  })

  // Internal spreaders at TOESP centres across the kick's width, front-to-back.
  const xs = K.map(p => p.x)
  const kx0 = Math.min(...xs), W = Math.max(...xs) - kx0
  const qty = Math.max(0, Math.floor(W / r.TOESP) - 1)
  const spacing = W / (qty + 1)
  for (let i = 1; i <= qty; i++) spreader({ x: kx0 + spacing * i - TI / 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }, KI)

  if (!parts.some(p => p.part_key === 'kick_front_face'))
    errors.push({ code: 'SHAPE_NO_KICK_FRONT', message: 'Shape has no front edge for a toe kick face', part: 'toekick' })
  return { parts, errors }
}
