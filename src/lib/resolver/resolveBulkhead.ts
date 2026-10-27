// ============================================================
// Bulkhead parts (z_bulkhead/BULKHEAD-SPEC.md, phase B2).
//
// Cabinet frame: X along the width (0 = left), Y up from the bulkhead's
// underside, Z from the wall (0) toward the room. The fascia's front face sits
// at the carcase front (DZ) or flush with the overhead doors' front.
//
//   bh:fascia            full width × full height, exposed board
//   bh:ret_l / bh:ret_r  side returns, full height, running back `depth` from
//                        the front (capped at the wall)
//   bh:ret_b             bottom return (under-panel) between the side returns
//   bh:cleat_v / _h      L fixing cleat (two 100 mm legs, carcass board) behind
//                        the fascia's bottom edge — lifted by the bottom
//                        return's thickness when that's on; none when the
//                        bulkhead is lower than a leg
//   bh:split             shadowline split rail (B7): flat, its own board, under
//                        everything else, front edge `setback` behind the
//                        front face; the parts above lift by its thickness
//
// Joints to the fascia: mitre = both blanks run to the outer corner with 45°
// ends (bevel_lo / bevel_hi, + = inner face shorter); butt = the fascia runs
// through and the return stops behind it.
//
// Upright parts use the side:/back:<edge> face-kind frame (DY length, DX
// height, DZ thickness, turned AY about the outer start corner, local z = 0 the
// outer face); the flat parts use the box frame of `bottom` (DY along X, DX
// along Z, DZ thickness). Hand-fixed: no seams / drilling.
// ============================================================

import type { CabinetInput, ConstructionRules, ResolvedCasePart, EdgeBanding } from './types'
import { resolveFaceZ } from './mergeRules'
import { BH_CLEAT_LEG } from '../bulkhead'

const MITRE = 45

export function resolveBulkhead(cab: CabinetInput, r: ConstructionRules): ResolvedCasePart[] {
  const b = cab.bulkhead
  if (!b) return []
  if (b.kind === 'shadowline') return resolveShadowline(cab)
  const W = cab.DX
  // Shadowline split (B7): the rail takes the bottom of the height.
  const ts = splitThickness(cab)
  const H = cab.DY - ts
  const t = cab.exposed_material.DZ
  const tc = cab.material.DZ
  const exp = cab.exposed_material.id
  const ebId = cab.exposed_edgeband_id
  const band = (e: Partial<EdgeBanding>): EdgeBanding =>
    ({ top: !!e.top, bottom: !!e.bottom, left: !!e.left, right: !!e.right, id: ebId })

  // Front face line (distance from the wall).
  // The doors actually made: the room / job style's blank, not the schedule board.
  const ft = cab.resolved_doors?.['*']?.thickness_mm ?? cab.door_thickness ?? cab.door_material.DZ
  const Zf = b.front === 'doors' ? resolveFaceZ(cab.DZ, ft, r) + ft : cab.DZ
  // Angled ends (B8): the end meets a wall at `angle`; its line runs through the
  // fascia's front corner. That end has no return, and every part behind the
  // fascia stops at the line at its deepest point (hand-fixed, cut square).
  const aL = b.left.angle ?? 0, aR = b.right.angle ?? 0
  const tanL = Math.tan(aL * Math.PI / 180), tanR = Math.tan(aR * Math.PI / 180)
  const xLo = (z: number) => aL > 0 ? Math.max(0, (Zf - z) * tanL) : 0
  const xHi = (z: number) => aR > 0 ? Math.min(W, W - (Zf - z) * tanR) : W
  const L = aL > 0 ? { ...b.left, on: false } : b.left
  const R = aR > 0 ? { ...b.right, on: false } : b.right
  const B = b.bottom
  const mL = L.on && L.joint === 'mitre', mR = R.on && R.joint === 'mitre', mB = B.on && B.joint === 'mitre'
  // Return length from the front face, never through the wall.
  const len = (depth: number) => Math.min(depth, Zf)

  const out: ResolvedCasePart[] = []
  const push = (p: Omit<ResolvedCasePart, 'AX' | 'AZ'>) => {
    if (p.DX > 0 && p.DY > 0 && p.DZ > 0) out.push({ AX: 0, AZ: 0, ...p, Y: p.Y + ts })
  }

  // Fascia — turned 180°: runs right → left from (W, Zf), outer face at the front.
  // Local x = 0 is the right end (bevel_lo / `left` edge), x = W the left end.
  push({
    part_key: 'bh:fascia',
    DX: H, DY: W, DZ: t,
    X: W, Y: 0, Z: Zf, AY: 180,
    ...(mR ? { bevel_lo: MITRE } : aR > 0 ? { bevel_lo: aR } : {}),
    ...(mL ? { bevel_hi: MITRE } : aL > 0 ? { bevel_hi: aL } : {}),
    material_id: exp,
    // Ends show unless mitred or scribed to a wall; the bottom edge shows
    // unless mitred to the bottom return.
    edge_band: band({ bottom: !mB, left: !mR && !(aR > 0), right: !mL && !(aL > 0) }),
  })

  // Side returns, full height. Mitred: from the front corner; butt: behind the fascia.
  const side = (key: 'bh:ret_l' | 'bh:ret_r', ret: typeof L, mitre: boolean) => {
    if (!ret.on) return
    const full = len(ret.depth)
    const l = mitre ? full : full - t
    const atWall = full >= Zf - 0.5
    const front = mitre ? Zf : Zf - t
    // Left: turned +90° (runs front → back at X = 0, outer face at X = 0) — the
    // front end is local x = 0. Right: turned −90° (runs back → front at X = W,
    // outer face at X = W) — the front end is local x = l.
    const isL = key === 'bh:ret_l'
    push({
      part_key: key,
      DX: H, DY: l, DZ: t,
      X: isL ? 0 : W, Y: 0, Z: isL ? front : front - l, AY: isL ? 90 : -90,
      ...(mitre ? (isL ? { bevel_lo: MITRE } : { bevel_hi: MITRE }) : {}),
      material_id: exp,
      // Bottom edge always shows (the bottom return sits between the sides);
      // the back end shows when the return stops short of the wall.
      edge_band: band({ bottom: true, ...(isL ? { right: !atWall } : { left: !atWall }) }),
    })
  }
  side('bh:ret_l', L, mL)
  side('bh:ret_r', R, mR)

  // Between the side returns.
  const x0 = L.on ? t : 0, x1 = R.on ? W - t : W

  // Bottom return — flat, between the sides. `top` = its front edge, `bottom` = back.
  if (B.on) {
    const full = len(B.depth)
    const d = mB ? full : full - t
    const front = mB ? Zf : Zf - t
    push({
      part_key: 'bh:ret_b',
      DX: d, DY: Math.min(x1, xHi(front - d)) - Math.max(x0, xLo(front - d)), DZ: t,
      X: Math.max(x0, xLo(front - d)), Y: 0, Z: front - d, AY: 0,
      material_id: exp,
      edge_band: band({ bottom: full < Zf - 0.5, left: !L.on, right: !R.on }),
    })
  }

  // L fixing cleat against the fascia's back face at its bottom edge.
  const y0 = B.on ? t : 0
  if (b.cleat && H >= y0 + BH_CLEAT_LEG) {
    const back = Zf - t           // fascia back face
    const hx0 = Math.max(x0, xLo(back - BH_CLEAT_LEG)), hx1 = Math.min(x1, xHi(back - BH_CLEAT_LEG))
    const vx0 = Math.max(x0, xLo(back - tc)), vx1 = Math.min(x1, xHi(back - tc))
    push({
      part_key: 'bh:cleat_h',
      DX: BH_CLEAT_LEG, DY: hx1 - hx0, DZ: tc,
      X: hx0, Y: y0, Z: back - BH_CLEAT_LEG, AY: 0,
      material_id: cab.material.id,
      edge_band: band({}),
    })
    push({
      part_key: 'bh:cleat_v',
      DX: BH_CLEAT_LEG - tc, DY: vx1 - vx0, DZ: tc,
      X: vx1, Y: y0 + tc, Z: back, AY: 180,
      material_id: cab.material.id,
      edge_band: band({}),
    })
  }
  if (ts > 0) {
    // Full width under the fascia (not round the returns yet), front edge set back.
    const s = b.split, d = Math.min(s.width, Zf - s.setback)
    const sz = Zf - s.setback - d, sx0 = xLo(sz), sx1 = xHi(sz)
    if (d > 0 && sx1 > sx0) out.push({
      part_key: 'bh:split',
      DX: d, DY: sx1 - sx0, DZ: ts,
      X: sx0, Y: 0, Z: Zf - s.setback - d, AX: 0, AY: 0, AZ: 0,
      material_id: cab.split_material!.id,
      edge_band: band({}),
    })
  }
  return out
}

/** Thickness of the bulkhead's shadowline split rail (B7); 0 when it's off or
 *  its board didn't load. */
export function splitThickness(cab: CabinetInput): number {
  return cab.bulkhead?.split.on && cab.split_material ? cab.split_material.DZ : 0
}

// Shadowline: a flat exposed-board strip on the overhead tops, flush with their
// carcase front (Z = DZ), `width` deep; optional flat returns at the ends run
// back to the wall, butted behind the strip. Box frame of `bottom`: DY along X,
// DX along Z, DZ thickness; band top = front edge, bottom = back, left / right =
// the X-min / X-max edges.
function resolveShadowline(cab: CabinetInput): ResolvedCasePart[] {
  const b = cab.bulkhead!
  const W = cab.DX, D = cab.DZ
  const t = cab.exposed_material.DZ
  const w = Math.min(b.width, D)
  const { left: L, right: R } = b
  const band = (e: Partial<EdgeBanding>): EdgeBanding =>
    ({ top: !!e.top, bottom: !!e.bottom, left: !!e.left, right: !!e.right, id: cab.exposed_edgeband_id })
  const out: ResolvedCasePart[] = []
  const push = (p: Omit<ResolvedCasePart, 'AX' | 'AY' | 'AZ'>) => {
    if (p.DX > 0 && p.DY > 0 && p.DZ > 0) out.push({ AX: 0, AY: 0, AZ: 0, ...p })
  }

  const mL = L.on && L.joint === 'mitre', mR = R.on && R.joint === 'mitre'

  // Front strip: front edge taped; an end shows unless a return turns there.
  // Mitred: the back edge stops `w` short at that end (45° in plan). Outline in
  // the horizontal shape frame: x along X, y back from the front edge.
  push({
    part_key: 'bh:sl_front',
    DX: w, DY: W, DZ: t,
    X: 0, Y: 0, Z: D - w,
    material_id: cab.exposed_material.id,
    edge_band: band({ top: true, left: !L.on, right: !R.on }),
    ...(mL || mR ? { outline: [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: mR ? W - w : W, y: w }, { x: mL ? w : 0, y: w }] } : {}),
  })

  // Returns, back `depth` from the front (capped at the wall). Mitred: from the
  // front corner, 45° across the strip width; butt: from behind the strip.
  const ret = (key: 'bh:sl_ret_l' | 'bh:sl_ret_r', r: typeof L) => {
    if (!r.on) return
    const full = Math.min(r.depth, D)
    const mitre = r.joint === 'mitre'
    const l = mitre ? full : full - w
    const isL = key === 'bh:sl_ret_l'
    push({
      part_key: key,
      DX: l, DY: w, DZ: t,
      X: isL ? 0 : W - w, Y: 0, Z: D - full,
      material_id: cab.exposed_material.id,
      // Outer long edge shows; the back end shows when it stops short of the wall.
      edge_band: band({ bottom: full < D - 0.5, ...(isL ? { left: true } : { right: true }) }),
      ...(mitre ? { outline: isL
        ? [{ x: 0, y: 0 }, { x: w, y: w }, { x: w, y: l }, { x: 0, y: l }]
        : [{ x: 0, y: w }, { x: w, y: 0 }, { x: w, y: l }, { x: 0, y: l }] } : {}),
    })
  }
  ret('bh:sl_ret_l', L)
  ret('bh:sl_ret_r', R)
  return out
}
