import { describe, it, expect } from 'vitest'
import {
  opsForLibrary, opsForInstance, keyedForLibrary, keyedForInstance, fromLibraryKey, remapCustomKey,
} from '../libraryPartData'

const hole = (key: string, extra: Record<string, unknown> = {}) => ({
  id: `op-${key}`, created_at: 't', source_cabinet_id: 'cabA', source_part_key: key, source_part_id: 'p',
  source_table: 'cabinet_custom_parts', operation_type: 'drill', diameter: 5, pos_x: 40, pos_y: 50, ...extra,
})

describe('library part data (z_wot K0)', () => {
  it('a drilled custom part goes to the library by index and comes back on the new part ids', () => {
    const ops = [hole('custom_u1'), hole('custom_u2'), hole('case_left_side'),
      hole('custom_u1', { parameters: { generated: 'seam' } }), hole('custom_gone')]
    const lib = opsForLibrary(ops, ['u1', 'u2'])
    expect(lib.map(o => o.source_part_key)).toEqual(['custom_@0', 'custom_@1', 'case_left_side'])
    expect(lib[0]).not.toHaveProperty('id')
    expect(lib[0]).not.toHaveProperty('source_cabinet_id')
    expect(lib[0]).toMatchObject({ diameter: 5, pos_x: 40, pos_y: 50 })

    const placed = opsForInstance(lib, 'cabB', fromLibraryKey(['n1', 'n2']))
    expect(placed.map(o => o.source_part_key)).toEqual(['custom_n1', 'custom_n2', 'case_left_side'])
    expect(placed.every(o => o.source_cabinet_id === 'cabB')).toBe(true)
  })

  it('copy / paste moves ops and comments onto the copied custom parts', () => {
    const map = remapCustomKey(new Map([['u1', 'n1']]))
    const copied = opsForInstance([hole('custom_u1'), hole('back')], 'cabC', map)
    expect(copied.map(o => o.source_part_key)).toEqual(['custom_n1', 'back'])
    expect(keyedForInstance({ custom_u1: 'edge in black', case_top: 'x', custom_old: 'y' }, map))
      .toEqual({ custom_n1: 'edge in black', case_top: 'x' })
  })

  it('comments round-trip through the library', () => {
    const lib = keyedForLibrary({ custom_u2: 'edge in black', case_back: 'b' }, ['u1', 'u2'])
    expect(lib).toEqual({ 'custom_@1': 'edge in black', case_back: 'b' })
    expect(keyedForInstance(lib, fromLibraryKey(['n1', 'n2']))).toEqual({ custom_n2: 'edge in black', case_back: 'b' })
  })
})
