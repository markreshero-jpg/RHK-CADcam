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

export function railBlockEnds(caseParts: ResolvedCasePart[], internalParts: ResolvedInternalPart[]): RailBlockEnd[] {
  const panels: { key: string; X: number; DZ: number }[] = [
    ...caseParts.filter(p => p.part_key === 'left_side' || p.part_key === 'right_side')
      .map(p => ({ key: `case_${p.part_key}`, X: p.X, DZ: p.DZ })),
    ...internalParts.filter(p => p.part_type === 'divider')
      .map(p => ({ key: `int_divider_${p.sort_order}`, X: p.X, DZ: p.DZ })),
  ]
  const out: RailBlockEnd[] = []
  for (const rail of caseParts) {
    const m = rail.fprail
    if (!rail.part_key.startsWith('fprail:') || !m || m.shaped || m.noBlocks) continue
    const y = rail.Y + rail.DX / 2
    const z = rail.Z - m.blockSetback
    const x0 = rail.X, x1 = rail.X + rail.DY
    const left = panels.find(p => p.X <= x0 + EPS && p.X + p.DZ > x0 + EPS)
    const right = panels.find(p => p.X < x1 - EPS && p.X + p.DZ >= x1 - EPS)
    if (left) out.push({ railKey: rail.part_key, panelKey: left.key, x: left.X + left.DZ, y, z, axis: 'x-', dia: m.blockDia, depth: m.blockDepth })
    if (right) out.push({ railKey: rail.part_key, panelKey: right.key, x: right.X, y, z, axis: 'x+', dia: m.blockDia, depth: m.blockDepth })
  }
  return out
}
