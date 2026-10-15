import { describe, it, expect } from 'vitest'
import { resolveLayerView, selectedFill, sparseViewSettings } from '../resolve'
import { CAB_FILL, CAB_FILL_SEL } from '../../geometry'
import type { LayerSet } from '../registry'

const set = (cabinetFill: Record<string, string | undefined>): LayerSet =>
  ({ id: 's', name: 'S', sort_order: 0, settings: { plan: { cabinetFill } } })

describe('cabinet fill', () => {
  it('falls back to the built-in colours', () => {
    const lv = resolveLayerView(set({}), 'plan')
    expect(lv.cabFill('wall')).toBe(CAB_FILL.wall)
    expect(lv.cabFillSel('tall_corner')).toBe(CAB_FILL_SEL.tall)
    expect(lv.cabFill('unknown')).toBe(CAB_FILL.base)
  })

  it('uses the override for the class and its corner class', () => {
    const lv = resolveLayerView(set({ base: '#336699' }), 'plan')
    expect(lv.cabFill('base')).toBe('#336699')
    expect(lv.cabFill('base_corner')).toBe('#336699')
    expect(lv.cabFillSel('base')).toBe(selectedFill('#336699'))
    expect(lv.cabFill('wall')).toBe(CAB_FILL.wall)
    // other views are untouched
    expect(resolveLayerView(set({ base: '#336699' }), 'elevation').cabFill('base')).toBe(CAB_FILL.base)
  })

  it('selected fill is brighter', () => {
    const lum = (h: string) => parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16)
    expect(lum(selectedFill('#1e3a5f'))).toBeGreaterThan(lum('#1e3a5f'))
    expect(selectedFill('#808080')).toMatch(/^#([0-9a-f]{2})\1\1$/)   // grey stays grey
  })

  it('sparse settings drop cleared classes', () => {
    expect(sparseViewSettings({ cabinetFill: { base: undefined } }, 'plan').cabinetFill).toBeUndefined()
    expect(sparseViewSettings({ cabinetFill: { wall: '#123456', base: undefined } }, 'plan').cabinetFill)
      .toEqual({ wall: '#123456' })
  })
})

describe('cabinet fill opacity', () => {
  it('defaults to 1 and reads the per-view value', () => {
    expect(resolveLayerView(set({}), 'plan').cabFillOpacity).toBe(1)
    const s: LayerSet = { id: 's', name: 'S', sort_order: 0, settings: { plan: { cabinetFillOpacity: 0.5 } } }
    expect(resolveLayerView(s, 'plan').cabFillOpacity).toBe(0.5)
    expect(resolveLayerView(s, 'elevation').cabFillOpacity).toBe(1)
  })

  it('sparse settings drop the default', () => {
    expect(sparseViewSettings({ cabinetFillOpacity: 1 }, 'plan').cabinetFillOpacity).toBeUndefined()
    expect(sparseViewSettings({ cabinetFillOpacity: 0.25 }, 'plan').cabinetFillOpacity).toBe(0.25)
  })
})

describe('dimension offset', () => {
  it('defaults to 0, reads the stored value, and stays sparse', () => {
    const s: LayerSet = { id: 's', name: 'S', sort_order: 0, settings: { plan: { items: { dim_kicks: { offset: 200 } } } } }
    expect(resolveLayerView(s, 'plan').offset('dim_kicks')).toBe(200)
    expect(resolveLayerView(s, 'plan').offset('dim_base_chain')).toBe(0)
    expect(sparseViewSettings({ items: { dim_kicks: { offset: 0 } } }, 'plan').items).toEqual({})
    expect(sparseViewSettings({ items: { dim_kicks: { offset: 150 } } }, 'plan').items).toEqual({ dim_kicks: { offset: 150 } })
  })
})
