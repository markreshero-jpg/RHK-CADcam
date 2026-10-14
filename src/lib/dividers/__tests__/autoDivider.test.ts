import { describe, it, expect } from 'vitest'
import { drawerBoundaries, planAutoDivider, type SeamGeometry } from '../autoDivider'
import type { FaceGridInput, Section } from '@/src/lib/resolver/types'

const grid = (types: ('drawer_face' | 'door')[][]): FaceGridInput => ({
  rows: types.map((_, r) => ({ row_index: r, height_locked: false })),
  cols: types[0].map((_, c) => ({ col_index: c, width_locked: false })),
  zones: types.flatMap((row, r) => row.map((face_type, c) => ({ row_index: r, col_index: c, face_type }))),
})
const open: Section = { type: 'open', fittings: [] }
const geo = (over: Partial<SeamGeometry> = {}): SeamGeometry => ({
  seamX: new Map([[0, 450]]), intLeft: 18, T: 18, equalCols: true, dividers: [], ...over,
})

describe('drawerBoundaries', () => {
  it('finds boundaries with drawers both sides, and whether every row has them', () => {
    const g = grid([['drawer_face', 'drawer_face'], ['door', 'door']])
    expect([...drawerBoundaries(g)]).toEqual([[0, { full: false }]])
    expect(drawerBoundaries(grid([['drawer_face', 'drawer_face']])).get(0)).toEqual({ full: true })
    expect(drawerBoundaries(grid([['door', 'drawer_face']])).size).toBe(0)
  })
})

describe('planAutoDivider (z_dividers V4)', () => {
  it('open interior, equal columns: an unsized vsplit (equal bays centre the double)', () => {
    const p = planAutoDivider(open, [0], 2, geo(), () => true)
    expect(p).toEqual({ kind: 'created', tree: { type: 'vsplit', children: [{ section: open }, { section: open }] } })
  })

  it('open interior, unequal columns: the first bay is locked so the double centres on the seam', () => {
    const p = planAutoDivider(open, [0], 2, geo({ equalCols: false, seamX: new Map([[0, 300]]) }), () => true)
    expect(p?.kind).toBe('created')
    // Double left face = 300 − 18 = 282; bay = 282 − 18 = 264.
    expect(p?.kind === 'created' && p.tree.type === 'vsplit' && p.tree.children[0].size).toBe(264)
  })

  it('drawers only in some rows: ask the user', () => {
    expect(planAutoDivider(open, [0], 2, geo(), () => false)).toEqual({ kind: 'manual' })
  })

  it('an existing divider on the seam: automatic goes double, explicit single is left alone', () => {
    const tree: Section = { type: 'vsplit', children: [{ section: open }, { section: open }] }
    const d = { x: 455, key: ':0', child: tree.children[0] }
    expect(planAutoDivider(tree, [0], 2, geo({ dividers: [d] }), () => true)).toEqual({ kind: 'auto' })
    const single = { ...d, child: { ...d.child, divider: 'single' as const } }
    expect(planAutoDivider(tree, [0], 2, geo({ dividers: [single] }), () => true)).toEqual({ kind: 'single' })
    const far = { ...d, x: 200 }
    expect(planAutoDivider(tree, [0], 2, geo({ dividers: [far] }), () => true)).toEqual({ kind: 'manual' })
  })
})
