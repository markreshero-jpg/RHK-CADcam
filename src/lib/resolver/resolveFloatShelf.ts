// ============================================================
// Floating shelf parts (z_floating_shelf/FLOATING-SHELF-SPEC.md, phase FS2).
//
// Cabinet frame: X along the width (0 = left), Y up from the shelf's underside,
// Z from the wall (0) toward the room. Every part is a horizontal box-frame
// panel (DY along X, DX along Z, DZ thickness; X / Y / Z its min corner).
// Rects below are in the horizontal shape frame — x along the width, y back
// from the front edge — the frame `outline` and `pockets` use.
//
//   fs:bot / fs:top        full boards, exposed board, not taped (the glued
//                          blank is edged after — "build up then edge")
//   fs:mid                 triple solid: the middle board, cut back round the slot
//   fs:rail_f / fs:rail_b  triple build-up: middle-layer rails (back rail sits
//   fs:strip_l / _r        forward by the rebate depth), side strips between
//   fs:cross_<n>           them, cross strips at ≤ strip_spacing centres
//   fs:cleat_b / _l / _r   hand-cut cleats sized to the slot (never on the CNC)
//
// Front corner radii (radius_l / radius_r) round the full boards' outlines
// (fs:bot / fs:top, and the double build's pockets stay inside them). A triple
// build's middle layer stays square — trimmed to the round by hand.
//
// The cleat slot runs `rebate_depth` in from the back and from each unseen
// side; it stops `stop` short of the front and of a seen side. Double: a
// `rebate_h` pocket on each board's inner face. Triple: the middle layer.
// ============================================================

import type { CabinetInput, ResolvedCasePart, EdgeBanding } from './types'
import type { OutlinePt } from '../shapePath'
import { fsLayers, fsCornerRadii, fsRoundedBoard, type FloatShelfSettings } from '../floatShelf'

type Rect = { x0: number; x1: number; y0: number; y1: number }

export function resolveFloatShelf(cab: CabinetInput): ResolvedCasePart[] {
  const s = cab.float_shelf
  if (!s) return []
  const W = cab.DX, D = cab.DZ
  const t = cab.exposed_material.DZ
  const exp = cab.exposed_material.id
  const noBand: EdgeBanding = { top: false, bottom: false, left: false, right: false, id: s.tape_id ?? cab.exposed_edgeband_id }
  const out: ResolvedCasePart[] = []

  // A board / strip of exposed board from a shape-frame rect at height Y.
  const board = (key: ResolvedCasePart['part_key'], r: Rect, Y: number, extra: Partial<ResolvedCasePart> = {}) => {
    const p: ResolvedCasePart = {
      part_key: key,
      DX: r.y1 - r.y0, DY: r.x1 - r.x0, DZ: t,
      X: r.x0, Y, Z: D - r.y1, AX: 0, AY: 0, AZ: 0,
      material_id: exp, edge_band: { ...noBand },
      ...extra,
    }
    if (p.DX > 0 && p.DY > 0) out.push(p)
  }

  const [rl, rr] = fsCornerRadii(s, W, D)
  const round = fsRoundedBoard(W, D, rl, rr)
  const full = round ? { outline: round as OutlinePt[] } : {}

  const L = !s.seen_left, R = !s.seen_right       // unseen = slotted
  const rd = Math.min(s.rebate_depth, D), stop = s.stop
  const layers = fsLayers(s.build)

  if (layers === 2) {
    const slot = slotRects(s, W, D, stop)
    const pockets = slot.map(r => ({ ...r, depth: s.rebate_h }))
    board('fs:bot', { x0: 0, x1: W, y0: 0, y1: D }, 0, { pockets, ...full })
    board('fs:top', { x0: 0, x1: W, y0: 0, y1: D }, t, { pockets, ...full })
    if (s.cleat) cleats(out, s, W, D, t - s.rebate_h, 2 * s.rebate_h, stop, stop, cab)
    return out
  }

  board('fs:bot', { x0: 0, x1: W, y0: 0, y1: D }, 0, full)
  board('fs:top', { x0: 0, x1: W, y0: 0, y1: D }, 2 * t, full)

  if (s.build === 'triple_solid') {
    board('fs:mid', { x0: 0, x1: W, y0: 0, y1: D }, t, { outline: cutBack(s, W, D, rd, stop) })
    if (s.cleat) cleats(out, s, W, D, t, t, stop, stop, cab)
    return out
  }

  // Triple build-up: rails front + back, perimeter strips between them, cross strips.
  const sw = s.strip_w
  const back = D - rd                               // back rail's back edge (y)
  const xl = L ? rd : 0, xr = R ? W - rd : W        // outer faces of the side strips
  board('fs:rail_f', { x0: 0, x1: W, y0: 0, y1: sw }, t)
  board('fs:rail_b', { x0: L ? rd : sw, x1: R ? W - rd : W - sw, y0: back - sw, y1: back }, t)
  // An unseen side's strip sits in by the slot, between the rails; a seen side's
  // runs from the front rail to the back edge.
  board('fs:strip_l', { x0: xl, x1: xl + sw, y0: sw, y1: L ? back - sw : D }, t)
  board('fs:strip_r', { x0: xr - sw, x1: xr, y0: sw, y1: R ? back - sw : D }, t)
  // Cross strips evenly between the side strips, centres ≤ strip_spacing apart.
  const a = xl + sw / 2, span = (xr - sw / 2) - a
  const bays = span > sw ? Math.ceil(span / s.strip_spacing) : 0
  for (let i = 1; i < bays; i++) {
    const c = a + (span * i) / bays
    board(`fs:cross_${i}` as ResolvedCasePart['part_key'], { x0: c - sw / 2, x1: c + sw / 2, y0: sw, y1: back - sw }, t)
  }
  // A seen side's strip closes the slot at the strip width.
  if (s.cleat) cleats(out, s, W, D, t, t, sw, sw, cab)
  return out
}

// The slot as shape-frame rects on a full board: back strip + each unseen side.
export function slotRects(s: FloatShelfSettings, W: number, D: number, stop: number): Rect[] {
  const rd = Math.min(s.rebate_depth, D)
  const rects: Rect[] = [{ x0: s.seen_left ? stop : 0, x1: s.seen_right ? W - stop : W, y0: D - rd, y1: D }]
  if (!s.seen_left) rects.push({ x0: 0, x1: Math.min(rd, W), y0: stop, y1: D })
  if (!s.seen_right) rects.push({ x0: Math.max(W - rd, 0), x1: W, y0: stop, y1: D })
  return rects.filter(r => r.x1 > r.x0 && r.y1 > r.y0)
}

// Triple solid middle board: the full board less the slot (front → right → back → left).
function cutBack(s: FloatShelfSettings, W: number, D: number, rd: number, stop: number): OutlinePt[] {
  const pts: OutlinePt[] = [{ x: 0, y: 0 }, { x: W, y: 0 }]
  if (s.seen_right) pts.push({ x: W, y: D }, { x: W - stop, y: D }, { x: W - stop, y: D - rd })
  else pts.push({ x: W, y: stop }, { x: W - rd, y: stop }, { x: W - rd, y: D - rd })
  if (s.seen_left) pts.push({ x: stop, y: D - rd }, { x: stop, y: D }, { x: 0, y: D })
  else pts.push({ x: rd, y: D - rd }, { x: rd, y: stop }, { x: 0, y: stop })
  return pts
}

// Hand-cut cleats filling the slot: back (`stopSide` short of a seen side) and
// one per unseen side, in front of the back cleat to `stopFront` short of the front.
function cleats(out: ResolvedCasePart[], s: FloatShelfSettings, W: number, D: number,
  Y: number, h: number, stopFront: number, stopSide: number, cab: CabinetInput) {
  const rd = Math.min(s.rebate_depth, D)
  const band: EdgeBanding = { top: false, bottom: false, left: false, right: false }
  const push = (key: ResolvedCasePart['part_key'], x0: number, x1: number, z0: number, z1: number) => {
    if (x1 - x0 > 0 && z1 - z0 > 0 && h > 0) out.push({
      part_key: key, DX: z1 - z0, DY: x1 - x0, DZ: h,
      X: x0, Y, Z: z0, AX: 0, AY: 0, AZ: 0,
      material_id: cab.material.id, edge_band: band, hand_cut: true,
    })
  }
  push('fs:cleat_b', s.seen_left ? stopSide : 0, s.seen_right ? W - stopSide : W, 0, rd)
  if (!s.seen_left) push('fs:cleat_l', 0, rd, rd, D - stopFront)
  if (!s.seen_right) push('fs:cleat_r', W - rd, W, rd, D - stopFront)
}
