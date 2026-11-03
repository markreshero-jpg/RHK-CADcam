import { describe, it, expect } from 'vitest'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type KickRunInput, type Material } from '../types'
import {
  kickRunSegments, roundSubSeams, seamsToSegments, mirrorSeams, isKickJoinPiece, resolveKickRunParts,
} from '../resolveKickRun'

// z_kick_join KS1: manual kick seams — face and sub front split separately, the
// back mirrored from the sub front; split pieces named JOIN.
const board = (t: number): Material => ({ id: `m${t}`, name: `Board ${t}`, DZ: t, sheet_dx: 2400, sheet_dy: 1200, has_grain: false })
const rules = mergeRules({ ...DEFAULT_RULES, TOESCL: 0, TOESCR: 0 })
const run = (o: Partial<KickRunInput> = {}): KickRunInput =>
  ({ run_id: 'r', role: 'assembly', max_segment_length: null, split_mode: 'manual', ...o })
const asm = (L: number, kick_run: KickRunInput) => ({
  id: 'k', assembly_class: 'base', DX: L, DY: 80, DZ: 580,
  toekick_face_material: board(16), toekick_interior_material: board(16),
  kick_run,
}) as unknown as CabinetInput
const lens = (xs: { len: number }[]) => xs.map(s => Math.round(s.len * 10) / 10)

describe('kick seam helpers', () => {
  it('round sub seams: full 2400 pieces then the remainder', () => {
    expect(roundSubSeams(2984, 2400)).toEqual([2400])
    expect(roundSubSeams(5200, 2450)).toEqual([2400, 4800])
    expect(roundSubSeams(2000, 2400)).toEqual([])
  })
  it('seams → segments drop out-of-range and duplicate seams', () => {
    expect(lens(seamsToSegments(2984, [2059.5, 2059.5, 0, 3000]))).toEqual([2059.5, 924.5])
    expect(mirrorSeams(2984, [2400])).toEqual([584])
  })
  it('equal / exact keep one seam set for all three boards', () => {
    const s = kickRunSegments(2984, run({ split_mode: 'equal', max_segment_length: 2400 }))
    expect(lens(s.face)).toEqual([1492, 1492])
    expect(lens(s.back)).toEqual([1492, 1492])
  })
})

describe('Danny\'s Robe KICK 1 (2984)', () => {
  const s = kickRunSegments(2984, run({ face_splits: [2059.5], sub_splits: [2400] }))
  it('face on the cabinet joint, sub round, back mirrored (long pieces at opposite ends)', () => {
    expect(lens(s.face)).toEqual([2059.5, 924.5])
    expect(lens(s.sub)).toEqual([2400, 584])
    expect(lens(s.back)).toEqual([584, 2400])
  })
  it('sub defaults to round numbers when no seams are set', () => {
    expect(lens(kickRunSegments(2984, run({ face_splits: [2059.5] })).sub)).toEqual([2400, 584])
  })
  it('resolves pieces with a spreader on every seam', () => {
    const { parts } = resolveKickRunParts(asm(2984, run({ face_splits: [2059.5], sub_splits: [2400] })), rules)
    const of = (k: string) => parts.filter(p => p.part_key === k)
    expect(of('kick_front_face').map(p => p.DY)).toEqual([2059.5, 924.5])
    expect(of('kick_sub_front').map(p => p.DY)).toEqual([2400, 584])
    expect(of('kick_back').map(p => p.DY)).toEqual([584, 2400])
    expect(of('kick_back')[1].X).toBe(584)
    const TI = 16
    const spr = of('spreader_vertical').map(p => p.X + TI / 2)
    for (const seam of [2059.5, 2400, 584]) expect(spr.some(x => Math.abs(x - seam) < 0.01)).toBe(true)
  })
  it('JOIN only on a kick assembly\'s split face / sub / back', () => {
    expect(isKickJoinPiece('kick_back', 2, true)).toBe(true)
    expect(isKickJoinPiece('kick_back', 1, true)).toBe(false)
    expect(isKickJoinPiece('kick_front_face', 3, false)).toBe(false)
    expect(isKickJoinPiece('spreader_vertical', 6, true)).toBe(false)
  })
})
