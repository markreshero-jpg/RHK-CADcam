import { describe, expect, it } from 'vitest'
import { applyInteriorActions, hingePositions, renderInterior, shortInterior } from '../interior'
import type { Section } from '@/src/lib/resolver/types'

// RHK6583 TC-02 shape: drawer bay, fixed shelf, rail bay, fixed shelf, top bay (fills).
const tc02 = {
  tree: {
    type: 'hsplit', children: [
      { size: 267, section: { type: 'open', fittings: [{ type: 'inner_drawer', y_locked: true }] }, separator: 'fixed_shelf' },
      { size: 1683.5, section: { type: 'open', fittings: [{ type: 'accessory', key: 'HANGING_RAIL_OVAL', y_locked: true }] }, separator: 'fixed_shelf' },
      { section: { type: 'open', fittings: [] } },
    ],
  } as Section,
}
const tree = (r: ReturnType<typeof applyInteriorActions>) => { if ('error' in r) throw new Error(r.error); return r.grid.tree as Section }

describe('interior', () => {
  it('renders numbered bays bottom to top', () => {
    const t = renderInterior(tc02).join('\n')
    expect(t).toContain('Bay 1 — 267 high: inner drawer')
    expect(t).toContain('↑ above bay 1: fixed shelf')
    expect(t).toContain('Bay 2 — 1683.5 high: hanging rail')
    expect(t).toContain('Bay 3 — fills the rest: empty')
    expect(shortInterior(tc02)).toBe('[267 inner drawer] ═ [1683.5 hanging rail] ═ [fill]')
  })

  it('sizes a bay, sets adjustable shelves, keeps the rest', () => {
    const t = tree(applyInteriorActions(tc02, [{ do: 'size', bay: '2', size: 1563.5 }, { do: 'adj_shelves', bay: '3', count: 2 }]))
    if (t.type === 'open') throw new Error('split expected')
    expect(t.children[1].size).toBe(1563.5)
    expect(t.children[0]).toEqual(tc02.tree.type !== 'open' ? tc02.tree.children[0] : null)
    const top = t.children[2].section
    expect(top.type === 'open' && top.fittings.filter(f => f.type === 'adj_shelf').length).toBe(2)
  })

  it('adds a fixed shelf as a sibling bay with the size under it', () => {
    const t = tree(applyInteriorActions(tc02, [{ do: 'add_shelf', bay: '3', below: 150 }]))
    if (t.type === 'open') throw new Error('split expected')
    expect(t.children).toHaveLength(4)
    expect(t.children[2].size).toBe(150)
    expect(t.children[2].separator).toBe('fixed_shelf')
  })

  it('splits a plain open interior and removes the shelf again', () => {
    const one = tree(applyInteriorActions({ tree: { type: 'open', fittings: [] } }, [{ do: 'add_shelf', bay: '0', below: 400 }]))
    expect(one.type).toBe('hsplit')
    const back = tree(applyInteriorActions({ tree: one }, [{ do: 'remove_shelf', bay: '1' }]))
    expect(back).toEqual({ type: 'open', fittings: [] })
  })

  it('remove_shelf keeps both bays contents', () => {
    const t = tree(applyInteriorActions(tc02, [{ do: 'remove_shelf', bay: '2' }]))
    if (t.type === 'open') throw new Error('split expected')
    expect(t.children).toHaveLength(2)
    expect(t.children[1].section.type === 'open' && t.children[1].section.fittings[0].type).toBe('accessory')
  })

  it('refuses a bad bay', () => {
    const r = applyInteriorActions(tc02, [{ do: 'size', bay: '7', size: 100 }])
    expect('error' in r && r.error).toMatch(/no such bay/)
  })

  it('spaces hinges with the rule insets', () => {
    const rules = [{ max_height_mm: 2400, hinge_count: 4, top_inset_mm: 100, bottom_inset_mm: 100 }]
    expect(hingePositions(2, 2150, rules)).toEqual([100, 2050])
    expect(hingePositions(4, 2150, rules)).toEqual([100, 750, 1400, 2050])
  })
})
