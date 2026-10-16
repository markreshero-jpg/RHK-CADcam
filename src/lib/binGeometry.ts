// Generic pull-out bin shape (z_bin_cabinet B5) — stands in for a real model
// until a GLB exists. Pure geometry in cabinet-space mm, built from the
// resolved bin stack so it always matches the pick: runners on the mounting
// faces, a tray on top of them, and the bins standing on the tray.
//
// Teramo layout: two bins front-to-back, or four (2 × 2) in the 600 module.

import type { ResolvedDrawerStack } from './resolver/types'

export interface BinBox {
  kind: 'runner' | 'tray' | 'bin'
  x: number; y: number; z: number   // min corner (cabinet coords; z = back face)
  w: number; h: number; d: number   // along X / Y / Z
}

const RUNNER_W = 12   // runner thickness against the gable / division
const RUNNER_H = 40
const TRAY_T   = 3
const SIDE_GAP = 15   // bins in from the runners
const BIN_GAP  = 10   // between bins
const END_GAP  = 10   // tray in from the front / back of the runners

// Inside widths at or above this take four bins (the 600 module: 562–580).
const FOUR_BIN_WIDTH = 500

export function binShape(stack: ResolvedDrawerStack): BinBox[] {
  if (stack.drawer_type !== 'bin') return []
  const x0 = stack.box_X, W = stack.box_width
  const y0 = stack.box_Y, H = stack.box_height
  const z0 = stack.box_Z, D = stack.box_depth
  if (W <= 2 * RUNNER_W || H <= RUNNER_H || D <= 2 * END_GAP) return []

  const out: BinBox[] = [
    { kind: 'runner', x: x0, y: y0, z: z0, w: RUNNER_W, h: RUNNER_H, d: D },
    { kind: 'runner', x: x0 + W - RUNNER_W, y: y0, z: z0, w: RUNNER_W, h: RUNNER_H, d: D },
    { kind: 'tray', x: x0 + RUNNER_W, y: y0 + RUNNER_H - TRAY_T, z: z0 + END_GAP, w: W - 2 * RUNNER_W, h: TRAY_T, d: D - 2 * END_GAP },
  ]

  const cols = W >= FOUR_BIN_WIDTH ? 2 : 1
  const rows = 2
  const bx0 = x0 + RUNNER_W + SIDE_GAP, bw = W - 2 * (RUNNER_W + SIDE_GAP)
  const bz0 = z0 + END_GAP, bd = D - 2 * END_GAP
  const by = y0 + RUNNER_H, bh = H - RUNNER_H
  const cw = (bw - (cols - 1) * BIN_GAP) / cols
  const rd = (bd - (rows - 1) * BIN_GAP) / rows
  if (cw <= 0 || rd <= 0 || bh <= 0) return out
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      out.push({ kind: 'bin', x: bx0 + c * (cw + BIN_GAP), y: by, z: bz0 + r * (rd + BIN_GAP), w: cw, h: bh, d: rd })
    }
  }
  return out
}
