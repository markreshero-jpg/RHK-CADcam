// ============================================================
// Knock-in blocks behind finger-pull rails (z_handles H6 / D20).
// One block at each rail end that sits in a panel (side or divider), on
// that panel's inner face, RAILBLK behind the back of the rail and centred
// on the rail's height. A rail running through a division gets none there.
// A rail marked noBlocks (the top rail against an on-edge front rail, which
// fixes it instead) gets none at all.
// Shared by the CNC hole (seamDrillSync) and the 3D block model, so both
// always agree. Box-front rails only — shaped facet rails are drilled in
// seamDrillSync's own frame.
// ============================================================

import type { ResolvedCasePart, ResolvedInternalPart } from './types'

export interface RailBlockEnd {
  railKey:  string                          // fprail:<n>
  panelKey: string                          // case_left_side / case_right_side / int_divider_<n>
  x: number; y: number; z: number          // hole centre on the panel's inner face (cabinet coords)
  axis: 'x-' | 'x+'                         // into the panel
  dia: number; depth: number
}

const EPS = 0.01
// Block body about its hole centre (Furnware CCP): 19 tall, 14.5 forward to the
// square end (at the rail), 5.9 back to the sloped end.
const BLOCK_HALF_H = 9.5, BLOCK_FRONT = 14.5, BLOCK_BACK = 5.9
const BLOCK_GAP = 2   // clear under a flat front rail

/** The block model (Furnware CCP GLB, metres, Y up) — z_handles D20. */
export const RAIL_BLOCK_MODEL_URL = '/hardware-models/Furnware_CCP_Knockin_Block.glb'

/**
 * Model-local (metres) → cabinet coords (mm) for one block. Model: origin = peg
 * axis on the body's underside, peg down −Y, square end −X. Placed with the peg
 * running into the panel along the hole axis and the square end towards the
 * rail (+Z). Same placement as the 3D RailBlockModel.
 */
export function railBlockToCab(e: RailBlockEnd): (mx: number, my: number, mz: number) => [number, number, number] {
  const into = e.axis === 'x-' ? -1 : 1
  return (mx, my, mz) => [e.x - into * my * 1000, e.y + into * mz * 1000, e.z - mx * 1000]
}

export function railBlockEnds(caseParts: ResolvedCasePart[], internalParts: ResolvedInternalPart[]): RailBlockEnd[] {
  const panels: { key: string; X: number; DZ: number }[] = [
    ...caseParts.filter(p => p.part_key === 'left_side' || p.part_key === 'right_side')
      .map(p => ({ key: `case_${p.part_key}`, X: p.X, DZ: p.DZ })),
    ...internalParts.filter(p => p.part_type === 'divider')
      .map(p => ({ key: `int_divider_${p.sort_order}`, X: p.X, DZ: p.DZ })),
  ]
  // A flat front rail over the top finger rail: its underside (and depth span).
  const fr = caseParts.find(p => p.part_key === 'front_rail' && !p.upright)
  const out: RailBlockEnd[] = []
  for (const rail of caseParts) {
    const m = rail.fprail
    if (!rail.part_key.startsWith('fprail:') || !m || m.shaped || m.noBlocks) continue
    const z = rail.Z - m.blockSetback
    // Centred on the rail — unless the block would hit a flat front rail above
    // it: then it drops to sit BLOCK_GAP under the front rail (Mark,
    // 2026-10-29), kept on the rail.
    let y = rail.Y + rail.DX / 2
    if (fr && z - BLOCK_BACK < fr.Z + fr.DX && z + BLOCK_FRONT > fr.Z && y + BLOCK_HALF_H > fr.Y - BLOCK_GAP && y < fr.Y + fr.DZ) {
      y = Math.max(fr.Y - BLOCK_GAP - BLOCK_HALF_H, rail.Y + BLOCK_HALF_H)
    }
    const x0 = rail.X, x1 = rail.X + rail.DY
    const left = panels.find(p => p.X <= x0 + EPS && p.X + p.DZ > x0 + EPS)
    const right = panels.find(p => p.X < x1 - EPS && p.X + p.DZ >= x1 - EPS)
    if (left) out.push({ railKey: rail.part_key, panelKey: left.key, x: left.X + left.DZ, y, z, axis: 'x-', dia: m.blockDia, depth: m.blockDepth })
    if (right) out.push({ railKey: rail.part_key, panelKey: right.key, x: right.X, y, z, axis: 'x+', dia: m.blockDia, depth: m.blockDepth })
  }
  return out
}
