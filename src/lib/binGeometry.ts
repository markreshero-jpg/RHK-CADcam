// Parametric pull-out bin (z_bin_cabinet B5) — a port of the shop's
// build_bin.py generator (z_bin_cabinet/build_bin.py), driven by the
// resolved bin stack instead of a CLI. Pure geometry in cabinet-space mm.
//
// Envelope = the bin pick: clear width × bin height × nominal depth, from the
// floor-back-left corner (box_X, box_Y, box_Z). Like the script:
//   • a fixed frame hangs from the top (plate, side skirts, back) with the
//     runners just under the plate;
//   • a moving carrier (side rails + front / mid / back bars) rides under the
//     runners;
//   • bins stand on the floor up to the carrier, tapered, with a rim, a lid
//     and a lid handle.
// Hardware sections keep the script's fixed sizes; width / depth stretch the
// frame and carrier; height stretches the bin bodies.
//
// Differences from the script: the bin plan size scales with the space (the
// script's fixed 320 × 246 rim only suits one product), and the 600 module
// takes four bins (2 × 2).

import type { ResolvedDrawerStack } from './resolver/types'

export type BinPartKind = 'frame' | 'runner' | 'carrier' | 'bin' | 'rim' | 'lid'

export interface BinBox {
  shape: 'box'
  kind: BinPartKind
  moving: boolean                   // carrier + bins (slides out); frame + runners stay
  x: number; y: number; z: number   // min corner (cabinet coords; z = back face)
  w: number; h: number; d: number   // along X / Y / Z
}

// A tapered bin body: rectangular bottom and top, centred on (cx, cz).
export interface BinFrustum {
  shape: 'frustum'
  kind: 'bin'
  moving: true
  cx: number; cz: number
  y0: number; y1: number
  bottom: [w: number, d: number]
  top:    [w: number, d: number]
}

export type BinPart = BinBox | BinFrustum

// Fixed section sizes (mm) — build_bin.py ProductSpec defaults.
const FRAME_DROP = 130
const PLATE_T    = 2
const SKIRT_T    = 1.5
const RUNNER_W   = 10
const RUNNER_H   = 35
const RUNNER_GAP = 3      // runner top below the plate
const CARRIER_H  = 25
const RAIL_W     = 12
const RIM_H      = 12
const LID_H      = 12
const HANDLE     = [100, 10, 20] as const   // W × H × D
const END_GAP    = 5

// Bin plan size from the space (script: 320 × 246 rim in a 370 × 520 space).
const RIM_SIDE   = 13.5   // rim in from the runner faces, each side
const RIM_PITCH  = 9      // rim shorter than its front-to-back pitch
const LID_IN     = 2      // lid / bin top in from the rim, each side
const TAPER      = [13, 12] as const        // bottom in from the top, each side (W, D)
const FOUR_BIN_WIDTH = 500   // clear widths at / above this take 2 × 2 bins (600 module)

export function binShape(stack: ResolvedDrawerStack): BinPart[] {
  if (stack.drawer_type !== 'bin') return []
  const X = stack.box_X, Y = stack.box_Y, Z = stack.box_Z
  const W = stack.box_width, H = stack.box_height, D = stack.box_depth
  const inner = W - 2 * (SKIRT_T + RUNNER_W)
  if (inner <= 2 * RAIL_W || H <= FRAME_DROP || D <= 2 * END_GAP + 20) return []

  const out: BinPart[] = []
  const box = (kind: BinPartKind, moving: boolean, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) =>
    out.push({ shape: 'box', kind, moving, x: X + x0, y: Y + y0, z: Z + z0, w: x1 - x0, h: y1 - y0, d: z1 - z0 })

  // Vertical stack, measured down from the top.
  const yPlate0 = H - PLATE_T
  const yRun1 = yPlate0 - RUNNER_GAP, yRun0 = yRun1 - RUNNER_H
  const yCar1 = yRun0, yCar0 = yCar1 - CARRIER_H
  const yLid1 = yCar1 + LID_H - 5, yLid0 = yLid1 - LID_H
  const yBin1 = yLid0
  const g = END_GAP

  // Fixed frame.
  box('frame', false, 0, yPlate0, 0, W, H, D)
  box('frame', false, 0, H - FRAME_DROP, 0, SKIRT_T, yPlate0, D)
  box('frame', false, W - SKIRT_T, H - FRAME_DROP, 0, W, yPlate0, D)
  box('frame', false, 0, H - FRAME_DROP, 0, W, yPlate0, SKIRT_T)
  const xr0 = SKIRT_T, xr1 = SKIRT_T + RUNNER_W
  box('runner', false, xr0, yRun0, g, xr1, yRun1, D - g)
  box('runner', false, W - xr1, yRun0, g, W - xr0, yRun1, D - g)

  // Moving carrier.
  const cx0 = xr1, cx1 = W - xr1
  box('carrier', true, cx0, yCar0, g, cx0 + RAIL_W, yCar1, D - g)
  box('carrier', true, cx1 - RAIL_W, yCar0, g, cx1, yCar1, D - g)
  box('carrier', true, cx0, yCar0, g, cx1, yCar1, g + 10)
  box('carrier', true, cx0, yCar0, D - g - 10, cx1, yCar1, D - g)

  // Bins: rows front-to-back, columns across (2 in the 600 module).
  const cols = W >= FOUR_BIN_WIDTH ? 2 : 1
  const rows = 2
  const pitchZ = (D - 2 * g) / rows
  const colW = (inner - 2 * RIM_SIDE) / cols
  const rimW = colW - (cols > 1 ? RIM_SIDE / 2 : 0)
  const rimD = pitchZ - RIM_PITCH
  if (rimW <= 2 * TAPER[0] + 2 * LID_IN || rimD <= 2 * TAPER[1] + 2 * LID_IN || yBin1 - RIM_H <= 0) return out
  const topW = rimW - 2 * LID_IN, topD = rimD - 2 * LID_IN
  for (let r = 0; r < rows; r++) {
    const cz = g + pitchZ * (r + 0.5)
    if (r < rows - 1) {
      const zc = g + pitchZ * (r + 1)
      box('carrier', true, cx0, yCar0, zc - 5, cx1, yCar1, zc + 5)
    }
    for (let c = 0; c < cols; c++) {
      const cx = xr1 + RIM_SIDE + colW * (c + 0.5)
      out.push({
        shape: 'frustum', kind: 'bin', moving: true,
        cx: X + cx, cz: Z + cz, y0: Y, y1: Y + yBin1 - RIM_H,
        bottom: [topW - 2 * TAPER[0], topD - 2 * TAPER[1]], top: [topW, topD],
      })
      box('rim', true, cx - rimW / 2, yBin1 - RIM_H, cz - rimD / 2, cx + rimW / 2, yBin1, cz + rimD / 2)
      box('lid', true, cx - topW / 2, yLid0, cz - topD / 2, cx + topW / 2, yLid1, cz + topD / 2)
      const [hw, hh, hd] = HANDLE
      box('lid', true, cx - hw / 2, yLid1, cz + topD / 2 - 5 - hd, cx + hw / 2, yLid1 + hh, cz + topD / 2 - 5)
    }
  }
  return out
}

// ── 2D outlines (elevation / side view) ────────────────────────────────────────
// The bin flattened onto a view plane, in cabinet coords: front = (X, Y),
// side = (Z, Y), top = (X, Z). Boxes become rectangles, tapered bins
// trapezoids (their top footprint from above). Identical outlines (bins one
// behind the other in the front view) are drawn once.
export interface BinOutline {
  kind: BinPartKind
  pts:  [h: number, v: number][]   // front (X, Y) · side (Z, Y) · top (X, Z)
}

export function binOutlines(stack: ResolvedDrawerStack, view: 'front' | 'side' | 'top'): BinOutline[] {
  const out: BinOutline[] = []
  const seen = new Set<string>()
  const add = (kind: BinPartKind, pts: [number, number][]) => {
    const key = kind + pts.map(([h, y]) => `${h.toFixed(1)},${y.toFixed(1)}`).join(' ')
    if (seen.has(key)) return
    seen.add(key); out.push({ kind, pts })
  }
  for (const p of binShape(stack)) {
    if (view === 'top') {
      const [x0, z0, w, d] = p.shape === 'box' ? [p.x, p.z, p.w, p.d]
        : [p.cx - p.top[0] / 2, p.cz - p.top[1] / 2, p.top[0], p.top[1]]
      add(p.kind, [[x0, z0], [x0 + w, z0], [x0 + w, z0 + d], [x0, z0 + d]])
    } else if (p.shape === 'box') {
      const [h0, len] = view === 'front' ? [p.x, p.w] : [p.z, p.d]
      add(p.kind, [[h0, p.y], [h0 + len, p.y], [h0 + len, p.y + p.h], [h0, p.y + p.h]])
    } else {
      const c = view === 'front' ? p.cx : p.cz
      const i = view === 'front' ? 0 : 1
      const b = p.bottom[i] / 2, t = p.top[i] / 2
      add('bin', [[c - b, p.y0], [c + b, p.y0], [c + t, p.y1], [c - t, p.y1]])
    }
  }
  return out
}
