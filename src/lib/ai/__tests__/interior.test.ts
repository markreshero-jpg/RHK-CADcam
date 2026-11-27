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
    expect(shortInterior(tc02)).toBe('[267 inner drawer] ═ [1683.5 hanging rail] ═ [fill] · drawer auto')
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

// Test Kitchen TC-01 bay 1: three inner drawers, each in its own auto-height bay.
  const open = (f: unknown[] = []) => ({ type: 'open', fittings: f })
  const tc01 = {
    tree: {
      type: 'hsplit', children: [
        { size: 750, separator: 'fixed_shelf', section: { type: 'hsplit', children: [
          { separator: 'none', section: { type: 'hsplit', children: [
            { size: 2, separator: 'none', section: open() },
            { auto_height: true, separator: 'none', section: open([{ type: 'inner_drawer', y_locked: false, y_position: 173 }]) },
            { equalise_group: 'A', section: open() },
          ] } },
          { auto_height: true, separator: 'none', section: open([{ type: 'inner_drawer', y_locked: true, y_position: 470 }]) },
          { section: { type: 'hsplit', children: [
            { equalise_group: 'A', separator: 'none', section: open() },
            { auto_height: true, separator: 'none', section: open([{ type: 'inner_drawer', y_locked: true, y_position: 695 }]) },
            { equalise_group: 'A', section: open() },
          ] } },
        ] } },
        { section: open() },
      ],
    } as Section,
  }
  const at = (t: Section, path: number[]) => path.reduce<Section>((s, i) => { if (s.type === 'open') throw new Error('open'); return s.children[i].section }, t)

  it('shows drawers with their box bottoms and resolved fronts', () => {
    const t = renderInterior(tc01, [{ y: 697, h: 145 }, { y: 170.5, h: 145 }, { y: 472, h: 145 }]).join('\n')
    expect(t).toContain('Bay 1.1.2 — sized to its drawer: inner drawer [box bottom auto, 168.5 as resolved, front as resolved 170.5–315.5 (145 high)]')
    expect(t).toContain('Bay 1.2 — sized to its drawer: inner drawer [box bottom 470 (locked), front as resolved 472–617 (145 high)]')
    expect(t).toContain('Bay 1.3.2 — sized to its drawer: inner drawer [box bottom 695 (locked), front as resolved 697–842 (145 high)]')
    expect(shortInterior(tc01)).toContain('· drawer auto, drawer at 470, drawer at 695')
  })

  it('moves a drawer up, sets its height, and back to auto', () => {
    let t = tree(applyInteriorActions(tc01, [{ do: 'move_drawer', bay: '1.1.2', bottom: 220.5 }, { do: 'move_drawer', bay: '1.2', height: 120 }]))
    expect((at(t, [0, 0, 1]) as { fittings: unknown[] }).fittings[0]).toEqual({ type: 'inner_drawer', y_locked: true, y_position: 220.5 })
    expect((at(t, [0, 1]) as { fittings: unknown[] }).fittings[0]).toEqual({ type: 'inner_drawer', y_locked: true, y_position: 470, height: 120 })
    t = tree(applyInteriorActions({ tree: t }, [{ do: 'move_drawer', bay: '1.1.2', bottom: null }]))
    expect((at(t, [0, 0, 1]) as { fittings: unknown[] }).fittings[0]).toEqual({ type: 'inner_drawer', y_locked: false })
  })

  it('up moves a drawer the editor way: the bay under it grows', () => {
    // Bottom drawer is on auto: bay 1.1.1 (2 high) grows to 52, the drawer stays auto.
    let t = tree(applyInteriorActions(tc01, [{ do: 'move_drawer', bay: '1.1.2', up: 50 }]))
    const s11 = at(t, [0, 0])
    if (s11.type === 'open') throw new Error('split expected')
    expect(s11.children[0].size).toBe(52)
    expect((s11.children[1].section as { fittings: unknown[] }).fittings[0]).toEqual({ type: 'inner_drawer', y_locked: false, y_position: 173 })
    // Locked drawer in a bay with no sized neighbour: its locked bottom moves.
    t = tree(applyInteriorActions(tc01, [{ do: 'move_drawer', bay: '1.2', up: -20 }]))
    expect((at(t, [0, 1]) as { fittings: unknown[] }).fittings[0]).toEqual({ type: 'inner_drawer', y_locked: true, y_position: 450 })
    // Too far down for the 2 mm bay under it.
    const r = applyInteriorActions(tc01, [{ do: 'move_drawer', bay: '1.1.2', up: -10 }])
    expect('error' in r && r.error).toMatch(/only 2 high/)
  })

  it('refuses a drawer move on a bay with no drawer', () => {
    const r = applyInteriorActions(tc01, [{ do: 'move_drawer', bay: '1.1.1', bottom: 100 }])
    expect('error' in r && r.error).toMatch(/no drawer or rollout in bay 1.1.1/)
  })

  it('removes a drawer and closes the empty bays up', () => {
    const t = tree(applyInteriorActions(tc01, [{ do: 'remove_drawer', bay: '1.1.2' }]))
    expect(at(t, [0, 0])).toEqual({ type: 'open', fittings: [] })
    expect((at(t, [0]) as { children: unknown[] }).children).toHaveLength(3)
  })

  it('adds an inner drawer or a rollout as its own bay', () => {
    // Halfway (as the editor adds one), with a box height.
    let t = tree(applyInteriorActions(tc01, [{ do: 'add_drawer', bay: '2', drawer: 'rollout', height: 90 }]))
    let s = at(t, [1])
    if (s.type === 'open') throw new Error('split expected')
    expect(s.children.map(c => [c.separator, !!c.auto_height, c.size])).toEqual([['none', false, undefined], ['none', true, undefined], [undefined, false, undefined]])
    expect((s.children[1].section as { fittings: unknown[] }).fittings[0]).toEqual({ type: 'pull_out', y_locked: false, height: 90 })
    // On the bay's bottom.
    t = tree(applyInteriorActions(tc01, [{ do: 'add_drawer', bay: '2', below: 0 }]))
    s = at(t, [1])
    if (s.type === 'open') throw new Error('split expected')
    expect(s.children.map(c => [c.separator, !!c.auto_height])).toEqual([['none', true], [undefined, false]])
    // 100 up from the bay's bottom.
    t = tree(applyInteriorActions(tc01, [{ do: 'add_drawer', bay: '2', below: 100 }]))
    s = at(t, [1])
    if (s.type === 'open') throw new Error('split expected')
    expect(s.children[0].size).toBe(100)
  })

  it('spaces hinges with the rule insets', () => {
    const rules = [{ max_height_mm: 2400, hinge_count: 4, top_inset_mm: 100, bottom_inset_mm: 100 }]
    expect(hingePositions(2, 2150, rules)).toEqual([100, 2050])
    expect(hingePositions(4, 2150, rules)).toEqual([100, 750, 1400, 2050])
  })
})
