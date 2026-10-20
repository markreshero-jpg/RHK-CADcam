// ============================================================
// Curved end joints (z_curved_end C3) — the library joints that drill the
// kit's fixing holes (kit SPEC §5) on the generator-declared seams. Seeded by
// z_curved_end/migration_c3_curved_end_joints.sql (keep the two in step) and
// set as every construction-method schedule's defaults for the crv_* seams;
// after that they are ordinary library joints, edited in Library → Joints.
//
// The kit's spread(len, inset, maxPitch) as joint formulas over D (the joint
// length): holes `inset` in from each end, evenly, at most `maxPitch` apart;
// one centred hole when D ≤ 2 × inset. CW/2 centres a hole on the contact
// (the mating part's thickness, or a fixing block's width).
// ============================================================

import type { JointTypeOp } from '../resolver/types'
import { CRV_SEAMS } from '../resolver/resolveCurvedEnd'
import { HOLE_D } from './geometry'

const spreadExprs = (inset: number, maxPitch: number) => {
  const span = `(D - ${2 * inset})`
  const n = `Math.ceil(${span} / ${maxPitch} - 1e-9)`
  return {
    qty:         `D > ${2 * inset} ? ${n} + 1 : 1`,
    spacing_mm:  `D > ${2 * inset} ? ${span} / ${n} : 0`,
    offset_z_mm: `D > ${2 * inset} ? ${inset} : D / 2`,
    offset_y_mm: 'CW / 2',
  }
}

export interface CurvedEndJointSeed {
  name: string
  description: string
  seams: string[]   // CRV_SEAMS generic keys this joint is the default for
  ops: Omit<JointTypeOp, 'id' | 'joint_type_id' | 'operation_order'>[]
}

const op = (expressions: Record<string, string>, skip: number | null = null): CurvedEndJointSeed['ops'][number] => ({
  target_part: 'part_b', machine_operation: 'drill', face: 'normal',
  tool_diameter_mm: HOLE_D, depth_mm: 16.7,     // part B face drills bore right through
  offset_x_mm: 0, offset_y_mm: 0, offset_z_mm: 0, qty: 1, spacing_mm: null, qty2: 1, spacing2_mm: null,
  router_tool_id: null, drill_id: null, auto_tool: true, notes: null,
  expressions, skip_near_mm: skip,
})

export const CURVED_END_JOINTS: CurvedEndJointSeed[] = [
  {
    name: 'CRV screw 50/250',
    description: 'Curved end: Ø5 through the panel into the mating edge, 50 in from each end, at most 250 apart, centred on the mating board.',
    seams: [CRV_SEAMS.fixFormer, CRV_SEAMS.fixBack],
    ops: [op(spreadExprs(50, 250))],
  },
  {
    name: 'CRV screw 40/250',
    description: 'Curved end back into the formers: Ø5 through, 40 in from each end, at most 250 apart.',
    seams: [CRV_SEAMS.backFormer],
    ops: [op(spreadExprs(40, 250))],
  },
  {
    name: 'CRV block face screw',
    description: 'Curved end fixing block out into the face board: Ø5 through up the block centre, 50 in, at most 250 apart; gives way to a block end hole within 20.',
    seams: [CRV_SEAMS.blockFace],
    ops: [op(spreadExprs(50, 250), 20)],
  },
  {
    name: 'CRV block end screw',
    description: 'Curved end fixing block back into each former’s notch edge: two Ø5 through 25 in from each side on a block 80+ wide, else one centred.',
    seams: [CRV_SEAMS.blockFormer],
    ops: [op({ qty: 'D >= 80 ? 2 : 1', spacing_mm: 'D - 50', offset_z_mm: 'D >= 80 ? 25 : D / 2', offset_y_mm: 'CW / 2' })],
  },
]
