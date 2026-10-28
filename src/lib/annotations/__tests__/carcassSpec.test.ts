import { describe, it, expect } from 'vitest'
import { carcassSpec, isCarcassPartKey } from '../carcassSpec'
import type { ResolvedCabinet } from '../../resolver/types'

// {carcass}: boxes only; Internal = the usual box board + odd cabinets named;
// External only when a box is built in the exposed board.
const names: Record<string, string> = { grey: 'Diamond Grey 16', white: 'White 16', oak: 'Boston Oak 16' }
const res = (parts: [string, string][]) => ({ case_parts: parts.map(([part_key, material_id]) => ({ part_key, material_id })) }) as unknown as ResolvedCabinet
const box = (m: string) => res([['left_side', m], ['right_side', m], ['bottom', m], ['back', m]])
const run = (cabs: { id: string; label: string; exposed_interior?: boolean; material_overrides?: Record<string, unknown> }[], r: Record<string, ResolvedCabinet>) =>
  carcassSpec(cabs, new Map(Object.entries(r)), id => names[id] ?? null)

describe('carcass spec', () => {
  it('one board: Internal only, no External line', () => {
    const s = run([{ id: 'a', label: 'BC-01' }, { id: 'b', label: 'WC-01' }], { a: box('grey'), b: box('grey') })
    expect(s.text).toBe('Internal: Diamond Grey 16')
    expect(s.external).toBe('')
  })

  it('end panels, fillers, bulkheads are not carcass', () => {
    expect(['left_side', 'bottom', 'side:side_b', 'back:back2', 'split:left_side:0'].every(isCarcassPartKey)).toBe(true)
    expect(['bh:fascia', 'fs:top', 'ap:side_a', 'cleat:side_a', 'kick_front_face'].some(isCarcassPartKey)).toBe(false)
    const s = run([{ id: 'a', label: 'BC-01' }, { id: 'p', label: 'BC-02' }],
      { a: box('grey'), p: res([['bh:fascia', 'oak']]) })
    expect(s.text).toBe('Internal: Diamond Grey 16')
  })

  it('exposed-interior box → External names it', () => {
    const s = run([{ id: 'a', label: 'BC-01' }, { id: 'b', label: 'BC-07', exposed_interior: true }], { a: box('grey'), b: box('oak') })
    expect(s.text).toBe('Internal: Diamond Grey 16\nExternal: Boston Oak 16 (BC-07)')
  })

  it('a cabinet changed to another board is named; the job colour wins over a majority', () => {
    const s = run([
      { id: 'a', label: 'BC-01' },
      { id: 'b', label: 'BC-03', material_overrides: { carcass: 'grey' } },
      { id: 'c', label: 'WC-02', material_overrides: { carcass: 'grey' } },
    ], { a: box('white'), b: box('grey'), c: box('grey') })
    expect(s.internal).toBe('White 16 (BC-03, WC-02: Diamond Grey 16)')
  })

  it('a finished gable in the exposed board shows under External', () => {
    const s = run([{ id: 'a', label: 'BC-10' }], { a: res([['left_side', 'oak'], ['right_side', 'grey'], ['bottom', 'grey'], ['back', 'grey']]) })
    expect(s.text).toBe('Internal: Diamond Grey 16\nExternal: Boston Oak 16 (BC-10)')
  })
})
