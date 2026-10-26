import { describe, it, expect } from 'vitest'
import { resolveLayerView, sparseViewSettings } from '../resolve'
import type { LayerSet, ViewLayerSettings } from '../registry'

const set = (plan: ViewLayerSettings): LayerSet => ({ id: 's', name: 'S', sort_order: 0, settings: { plan } })

describe('wall layers', () => {
  it('walls, wall fill and wall names default on in plan + elevation', () => {
    for (const v of ['plan', 'elevation'] as const) {
      const lv = resolveLayerView(undefined, v)
      expect(lv.show('walls') && lv.show('wall_fill') && lv.show('wall_names')).toBe(true)
    }
  })

  it('pattern falls back to the renderer default, else the stored one', () => {
    expect(resolveLayerView(set({}), 'plan').pattern('wall_fill', 'solid')).toBe('solid')
    expect(resolveLayerView(set({}), 'plan').pattern('wall_fill', 'hatch')).toBe('hatch')
    const lv = resolveLayerView(set({ items: { wall_fill: { pattern: 'cross' } } }), 'plan')
    expect(lv.pattern('wall_fill', 'solid')).toBe('cross')
  })

  it('sparse save keeps a pattern and drops an unset one', () => {
    expect(sparseViewSettings({ items: { wall_fill: { visible: true, style: 'solid', pattern: 'hatch' } } }, 'plan').items)
      .toEqual({ wall_fill: { pattern: 'hatch' } })
    expect(sparseViewSettings({ items: { wall_fill: { visible: true, style: 'solid', pattern: undefined } } }, 'plan').items)
      .toEqual({})
  })
})
