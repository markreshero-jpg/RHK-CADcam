import { describe, it, expect } from 'vitest'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type KickRunInput, type Material } from '../types'
import {
  kickRunSegments, roundSubSeams, seamsToSegments, mirrorSeams, isKickJoinPiece, resolveKickRunParts, kickFaceMaxLength,
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
  it('resolves the split pieces, no extra spreaders at the seams', () => {
    const { parts } = resolveKickRunParts(asm(2984, run({ face_splits: [2059.5], sub_splits: [2400] })), rules)
    const of = (k: string) => parts.filter(p => p.part_key === k)
    expect(of('kick_front_face').map(p => p.DY)).toEqual([2059.5, 924.5])
    expect(of('kick_sub_front').map(p => p.DY)).toEqual([2400, 584])
    expect(of('kick_back').map(p => p.DY)).toEqual([584, 2400])
    expect(of('kick_back')[1].X).toBe(584)
    const unsplit = resolveKickRunParts(asm(2984, run({ face_splits: [], sub_splits: [] })), rules)
    expect(of('spreader_vertical').map(p => p.X))
      .toEqual(unsplit.parts.filter(p => p.part_key === 'spreader_vertical').map(p => p.X))
  })
  it('JOIN only on a kick assembly\'s split face / sub / back', () => {
    expect(isKickJoinPiece('kick_back', 2, true)).toBe(true)
    expect(isKickJoinPiece('kick_back', 1, true)).toBe(false)
    expect(isKickJoinPiece('kick_front_face', 3, false)).toBe(false)
    expect(isKickJoinPiece('spreader_vertical', 6, true)).toBe(false)
  })
})

describe('vertical-grain face max (sheet width)', () => {
  const walnut = { has_grain: true, sheet_dx: 2415, sheet_dy: 1211 }
  it('1200 for a grained vertical face, none for plain or horizontal', () => {
    expect(kickFaceMaxLength(walnut, 'vertical')).toBe(1200)
    expect(kickFaceMaxLength(walnut, undefined)).toBe(1200)
    expect(kickFaceMaxLength(walnut, 'horizontal')).toBeNull()
    expect(kickFaceMaxLength({ ...walnut, has_grain: false }, 'vertical')).toBeNull()
  })
  it('even / full split the face to fit, the sub and back stay as set', () => {
    const s = kickRunSegments(2843.5, run({ split_mode: 'equal', max_segment_length: 2400 }), 1200)
    expect(s.face.length).toBe(3)
    expect(s.face.every(x => x.len <= 1200)).toBe(true)
    expect(lens(s.sub)).toEqual([1421.8, 1421.8])
    const one = kickRunSegments(1800, run({ split_mode: 'equal' }), 1200)
    expect(lens(one.face)).toEqual([900, 900])
    expect(lens(one.sub)).toEqual([1800])
  })
  it('hand-set face seams are kept as entered', () => {
    expect(lens(kickRunSegments(2843.5, run({ face_splits: [1287], sub_splits: [2400] }), 1200).face)).toEqual([1287, 1556.5])
  })
})
