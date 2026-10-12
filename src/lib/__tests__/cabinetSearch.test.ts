import { describe, it, expect } from 'vitest'
import { searchDefs, searchTokens } from '../cabinetSearch'

const LIB = [
  { name: 'B2D',     assembly_class: 'base', description: 'Base, pair of doors, one adjustable shelf.', path: 'Base › Doors' },
  { name: 'D3-SLL',  assembly_class: 'base', description: 'Base, 3 drawers: shallow over two equal larges.', path: 'Base › Drawers' },
  { name: 'BEPF',    assembly_class: 'base', description: 'Base end panel, runs to the floor.', path: 'Base › End Panels' },
  { name: 'TEPF',    assembly_class: 'tall', description: 'Tall end panel, runs to the floor.', path: 'Tall › End Panels' },
  { name: 'TFF',     assembly_class: 'tall', description: 'Tall filler, runs to the floor.', path: 'Tall' },
  { name: 'WOPN',    assembly_class: 'wall', description: 'Wall, open shelf unit (no fronts).', path: 'Wall' },
]
const names = (q: string) => searchDefs(LIB, q, d => d.path).map(d => d.name)

describe('cabinet search', () => {
  it('matches descriptions, not just codes', () => {
    expect(names('panel')).toEqual(['BEPF', 'TEPF'])
  })
  it('folds plurals both ways', () => {
    expect(names('panels')).toEqual(['BEPF', 'TEPF'])
    expect(names('drawer')).toEqual(['D3-SLL'])
  })
  it('requires every word (AND across fields)', () => {
    expect(names('tall panel')).toEqual(['TEPF'])
    expect(names('floor filler')).toEqual(['TFF'])
  })
  it('ranks code hits above description hits', () => {
    expect(names('d3')[0]).toBe('D3-SLL')
    expect(names('shelf')).toEqual(['B2D', 'WOPN'])
  })
  it('empty query returns everything in order', () => {
    expect(names('  ')).toEqual(LIB.map(d => d.name))
    expect(searchTokens('  Tall   PANELS ')).toEqual(['tall', 'panel'])
  })
})
