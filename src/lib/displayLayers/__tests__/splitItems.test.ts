import { describe, it, expect } from 'vitest'
import { resolveLayerView } from '../resolve'
import { internalPartItem, type LayerSet } from '../registry'

const set = (items: Record<string, object>): LayerSet =>
  ({ id: 's', name: 's', sort_order: 0, settings: { elevation: { items } } }) as LayerSet

describe('shelves split', () => {
  it('maps each shelf type to its own item', () => {
    expect(internalPartItem('adj_shelf')).toBe('adj_shelves')
    expect(internalPartItem('fixed_shelf')).toBe('fixed_shelves')
  })

  it('carries a saved combined "shelves" setting over to both new items', () => {
    const lv = resolveLayerView(set({ shelves: { visible: false, color: '#ff0000' } }), 'elevation')
    expect(lv.show('adj_shelves')).toBe(false)
    expect(lv.show('fixed_shelves')).toBe(false)
    expect(lv.colorOf('fixed_shelves')).toBe('#ff0000')
  })

  it('lets each item be edited independently once it has its own setting', () => {
    const lv = resolveLayerView(set({ shelves: { visible: false }, fixed_shelves: { visible: true, style: 'dashed' } }), 'elevation')
    expect(lv.show('adj_shelves')).toBe(false)
    expect(lv.show('fixed_shelves')).toBe(true)
    expect(lv.style('fixed_shelves')).toBe('dashed')
  })

  it('defaults both to shown with no saved setting', () => {
    const lv = resolveLayerView(set({}), 'elevation')
    expect(lv.show('adj_shelves')).toBe(true)
    expect(lv.show('fixed_shelves')).toBe(true)
  })
})

describe('shelves split — saving', () => {
  it('migrates the retired item on save so a child reset to default sticks', async () => {
    const { sparseViewSettings, effectiveSetting } = await import('../resolve')
    // Saved: shelves hidden. User turns adjustable shelves back on (= default).
    const edited = { items: { shelves: { visible: false }, adj_shelves: { visible: true, style: 'solid' as const } } }
    const saved = sparseViewSettings(edited, 'elevation')
    expect(saved.items?.shelves).toBeUndefined()
    expect(effectiveSetting(saved, 'adj_shelves', 'elevation').visible).toBe(true)
    expect(effectiveSetting(saved, 'fixed_shelves', 'elevation').visible).toBe(false)
  })
})
