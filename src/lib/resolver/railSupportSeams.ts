// ============================================================
// Rail end support ↔ gable seams (z_accessories A8).
//
// An end support (fittings.railSupports) screws to the gable or divider at the
// rail's end. It declares that contact as a seam so its library joint (the
// support's joint_id, e.g. "Finista end support") drills the gable through the
// normal joint pipeline — holes follow the rail when it moves. Part A = the
// gable (drilled from its inner face, op depth), part B = the support.
// Declared frame: origin = the support's bottom on the gable face, centred
// front-to-back; `along` up (offset_z / spacing), `across` front-to-back.
// ============================================================

import type { DeclaredSeam, ResolvedCasePart, ResolvedInternalPart } from './types'

const EPS = 0.5
const near = (a: number, b: number) => Math.abs(a - b) <= EPS

export function railSupportSeams(caseParts: ResolvedCasePart[], internalParts: ResolvedInternalPart[]): DeclaredSeam[] {
  // Upright panels a support can sit on: the gables and the dividers (box x = X, width DZ).
  const uprights = [
    ...caseParts.filter(p => (p.part_key === 'left_side' || p.part_key === 'right_side') && !p.AY)
      .map(p => ({ key: p.part_key as string, p })),
    ...internalParts.filter(p => p.part_type === 'divider').map(p => ({ key: `int_divider_${p.sort_order}`, p })),
  ]
  const out: DeclaredSeam[] = []
  for (const s of internalParts) {
    const a = s.accessory
    if (s.part_type !== 'rail_support' || a?.role !== 'end_support' || !a.joint_id) continue
    const left = a.side === 'left'
    const face = left ? s.X : s.X + s.DY
    const hit = uprights.find(({ p }) =>
      near(left ? p.X + p.DZ : p.X, face) && p.Y <= s.Y + EPS && p.Y + p.DY >= s.Y + s.DZ - EPS)
    if (!hit) continue
    const supKey = `int_rail_support_${s.sort_order}`
    out.push({
      seam_key:      `${hit.key}|${supKey}`,
      generic_key:   'rail:end_support',
      part_a_key:    hit.key,
      part_b_key:    supKey,
      joint_type_id: a.joint_id,
      geom: {
        origin: { x: face, y: s.Y, z: s.Z + s.DX / 2 },
        along:  { x: 0, y: 1, z: 0 },
        across: { x: 0, y: 0, z: 1 },
        toward: { x: left ? -1 : 1, y: 0, z: 0 },
        length: s.DZ,
        width:  s.DX,
      },
    })
  }
  return out
}
