import { describe, it, expect } from 'vitest'
import type { CadLayer } from '@/src/lib/types'
import { jobRowsFromShop, cadLayerView, ALL_CAD_LAYERS, sortCadLayers, annotationsForPrint } from '@/src/lib/annotations/cadLayers'
import { resolveStyle } from '@/src/lib/annotations/style'

const layer = (id: string, o: Partial<CadLayer> = {}): CadLayer => ({
  id, name: id, color: '#000000', visible: true, print: true, is_default: false, sort_order: 0, ...o,
})

const shop = [
  layer('s-gen', { name: 'General', is_default: true, color: '#dc2626', sort_order: 0 }),
  layer('s-elec', { name: 'Electrical', color: '#d97706', sort_order: 1 }),
  layer('s-con', { name: 'Construction', print: false, sort_order: 2 }),
]

describe('jobRowsFromShop', () => {
  it('copies the whole list into an empty job, keeping the default', () => {
    const rows = jobRowsFromShop('p1', shop, [])
    expect(rows.map(r => r.name)).toEqual(['General', 'Electrical', 'Construction'])
    expect(rows.map(r => r.sort_order)).toEqual([0, 1, 2])
    expect(rows[0]).toMatchObject({ project_id: 'p1', shop_layer_id: 's-gen', is_default: true })
    expect(rows[2].print).toBe(false)
  })
  it('Add from shop list: only missing layers, after the job\'s own, no second default', () => {
    const job = [
      layer('j-gen', { shop_layer_id: 's-gen', is_default: true, sort_order: 0 }),
      layer('j-mine', { shop_layer_id: null, sort_order: 4 }),
    ]
    const rows = jobRowsFromShop('p1', shop, job)
    expect(rows.map(r => r.shop_layer_id)).toEqual(['s-elec', 's-con'])
    expect(rows.map(r => r.sort_order)).toEqual([5, 6])
    expect(rows.every(r => !r.is_default)).toBe(true)
  })
})

describe('cadLayerView', () => {
  const v = cadLayerView([
    layer('gen', { is_default: true, color: '#dc2626' }),
    layer('off', { visible: false }),
    layer('np', { print: false, color: '#9ca3af' }),
  ])
  it('null and unknown ids are General', () => {
    expect(v.layerOf({ cad_layer_id: null })?.id).toBe('gen')
    expect(v.layerOf({ cad_layer_id: 'deleted' })?.id).toBe('gen')
    expect(v.color({ cad_layer_id: undefined })).toBe('#dc2626')
  })
  it('off layers neither show nor print; no-print layers show but don\'t print', () => {
    expect(v.show({ cad_layer_id: 'off' })).toBe(false)
    expect(v.printable({ cad_layer_id: 'off' })).toBe(false)
    expect(v.show({ cad_layer_id: 'np' })).toBe(true)
    expect(v.printable({ cad_layer_id: 'np' })).toBe(false)
  })
  it('no layers loaded: everything shows', () => {
    expect(ALL_CAD_LAYERS.show({ cad_layer_id: 'x' })).toBe(true)
    expect(ALL_CAD_LAYERS.printable({ cad_layer_id: null })).toBe(true)
    expect(ALL_CAD_LAYERS.color({ cad_layer_id: null })).toBeUndefined()
  })
  it('General first, then list order', () => {
    expect(sortCadLayers([layer('b', { sort_order: 1 }), layer('a', { sort_order: 0 }), layer('g', { is_default: true, sort_order: 9 })])
      .map(l => l.id)).toEqual(['g', 'a', 'b'])
  })
})

describe('ByLayer colour', () => {
  it('unset colours take the layer colour', () => {
    const s = resolveStyle('rect', {}, '#2563eb')
    expect([s.color, s.borderColor, s.fillColor]).toEqual(['#2563eb', '#2563eb', '#2563eb'])
  })
  it('a colour set on the item wins', () => {
    const s = resolveStyle('text', { color: '#111111' }, '#2563eb')
    expect(s.color).toBe('#111111')
    expect(s.borderColor).toBe('#2563eb')
  })
  it('no layer colour: the built-in red, as before', () => {
    expect(resolveStyle('line', {}).color).toBe('#dc2626')
  })
})

describe('annotationsForPrint', () => {
  const v = cadLayerView([
    { id: 'gen', name: 'General', color: '#dc2626', visible: true, print: true, is_default: true, sort_order: 0 },
    { id: 'np', name: 'Construction', color: '#9ca3af', visible: true, print: false, is_default: false, sort_order: 1 },
    { id: 'pl', name: 'Plumbing', color: '#2563eb', visible: true, print: true, is_default: false, sort_order: 2 },
  ])
  const a = (id: string, cad_layer_id: string | null, style = {}) => ({
    id, room_id: 'r', view: 'plan' as const, wall_id: null, cabinet_id: null, sheet_view: null, kind: 'line' as const,
    geom: { pts: [] } as never, text: null, style, sort_order: 0, cad_layer_id, created_at: '', updated_at: '',
  })
  it('drops no-print layers and fills ByLayer colours', () => {
    const out = annotationsForPrint([a('1', null), a('2', 'np'), a('3', 'pl', { color: '#000000' })], v)
    expect(out.map(x => x.id)).toEqual(['1', '3'])
    expect(out[0].style).toMatchObject({ color: '#dc2626', fillColor: '#dc2626' })
    expect(out[1].style).toMatchObject({ color: '#000000', borderColor: '#2563eb' })
  })
})
