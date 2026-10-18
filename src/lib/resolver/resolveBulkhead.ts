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
  const W = cab.DX, H = cab.DY
  const t = cab.exposed_material.DZ
  const tc = cab.material.DZ
  const exp = cab.exposed_material.id
  const ebId = cab.exposed_edgeband_id
  const band = (e: Partial<EdgeBanding>): EdgeBanding =>
    ({ top: !!e.top, bottom: !!e.bottom, left: !!e.left, right: !!e.right, id: ebId })

  // Front face line (distance from the wall).
  const ft = cab.resolved_doors?.['*']?.thickness_mm ?? cab.door_material.DZ
  const Zf = b.front === 'doors' ? resolveFaceZ(cab.DZ, ft, r) + ft : cab.DZ
  const { left: L, right: R, bottom: B } = b
  const mL = L.on && L.joint === 'mitre', mR = R.on && R.joint === 'mitre', mB = B.on && B.joint === 'mitre'
  // Return length from the front face, never through the wall.
  const len = (depth: number) => Math.min(depth, Zf)

  const out: ResolvedCasePart[] = []
  const push = (p: Omit<ResolvedCasePart, 'AX' | 'AZ'>) => {
    if (p.DX > 0 && p.DY > 0 && p.DZ > 0) out.push({ AX: 0, AZ: 0, ...p })
  }

  // Fascia — turned 180°: runs right → left from (W, Zf), outer face at the front.
  // Local x = 0 is the right end (bevel_lo / `left` edge), x = W the left end.
  push({
    part_key: 'bh:fascia',
    DX: H, DY: W, DZ: t,
    X: W, Y: 0, Z: Zf, AY: 180,
    ...(mR ? { bevel_lo: MITRE } : {}), ...(mL ? { bevel_hi: MITRE } : {}),
    material_id: exp,
    // Ends show unless mitred; the bottom edge shows unless mitred to the bottom return.
    edge_band: band({ bottom: !mB, left: !mR, right: !mL }),
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
      DX: d, DY: x1 - x0, DZ: t,
      X: x0, Y: 0, Z: front - d, AY: 0,
      material_id: exp,
      edge_band: band({ bottom: full < Zf - 0.5, left: !L.on, right: !R.on }),
    })
  }

  // L fixing cleat against the fascia's back face at its bottom edge.
  const y0 = B.on ? t : 0
  if (b.cleat && H >= y0 + BH_CLEAT_LEG) {
    const back = Zf - t           // fascia back face
    push({
      part_key: 'bh:cleat_h',
      DX: BH_CLEAT_LEG, DY: x1 - x0, DZ: tc,
      X: x0, Y: y0, Z: back - BH_CLEAT_LEG, AY: 0,
      material_id: cab.material.id,
      edge_band: band({}),
    })
    push({
      part_key: 'bh:cleat_v',
      DX: BH_CLEAT_LEG - tc, DY: x1 - x0, DZ: tc,
      X: x1, Y: y0 + tc, Z: back, AY: 180,
      material_id: cab.material.id,
      edge_band: band({}),
    })
  }
  return out
}
