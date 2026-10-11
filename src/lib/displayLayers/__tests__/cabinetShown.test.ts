import { describe, it, expect } from 'vitest'
import { planShowsCabinet, elevationShowsCabinet } from '../cabinetShown'
import { resolveLayerView } from '../resolve'
import type { LayerSet, ViewLayerSettings } from '../registry'
import type { CabinetInstance } from '../../types'
import type { ResolvedCabinet } from '../../resolver/types'

// Only the fields the predicates read.
const cab = (over: Partial<CabinetInstance> = {}) =>
  ({ id: 'c1', assembly_class: 'base', has_face: true, has_internal: true, has_toekick: true, ...over }) as CabinetInstance

const rp = {
  case_parts: [{ part_key: 'left_side' }, { part_key: 'bottom' }],
  toekick_parts: [{ part_key: 'kick_front_face' }],
  internal_parts: [{ part_type: 'adj_shelf' }],
  internal_slides: [],
  drawer_stacks: [],
  face_zones: [{ face_type: 'door' }],
  custom_parts: [],
} as unknown as ResolvedCabinet

// A set that hides every listed item and shows only `keep`.
const only = (view: 'plan' | 'elevation', keep: string[]) => {
  const ids = ['carcass_outline', 'carcass_gables', 'carcass_top', 'carcass_bottom', 'carcass_back',
    'kick_faces', 'kick_spreaders', 'doors', 'drawer_fronts', 'false_panels', 'internal_outline',
    'adj_shelves', 'fixed_shelves', 'dividers', 'inner_drawers', 'accessories', 'drawer_boxes', 'drawer_runners',
    'inner_drawer_runners', 'applied_panels', 'fillers', 'custom_panels']
  const vs: ViewLayerSettings = { items: Object.fromEntries(ids.map(id => [id, { visible: keep.includes(id) }])) }
  const set: LayerSet = { id: 's', name: 's', sort_order: 0, settings: { [view]: vs } }
  return resolveLayerView(set, view)
}

describe('planShowsCabinet', () => {
  it('hides a cabinet when nothing of it is drawn', () => {
    expect(planShowsCabinet(cab(), only('plan', []), rp)).toBe(false)
  })
  it('shows a cabinet through its kick parts (Kicks set)', () => {
    expect(planShowsCabinet(cab(), only('plan', ['kick_faces']), rp)).toBe(true)
  })
  it('kick assemblies are not shown by the carcase outline alone', () => {
    expect(planShowsCabinet(cab({ is_kick_assembly: true, has_face: false, has_internal: false }), only('plan', ['carcass_outline']), undefined)).toBe(false)
  })
})

describe('elevationShowsCabinet', () => {
  it('shows through a face zone', () => {
    expect(elevationShowsCabinet(cab(), only('elevation', ['doors']), rp)).toBe(true)
  })
  it('ignores the back panel', () => {
    const backOnly = { ...rp, case_parts: [{ part_key: 'back' }], toekick_parts: [], internal_parts: [], face_zones: [] } as unknown as ResolvedCabinet
    expect(elevationShowsCabinet(cab(), only('elevation', ['carcass_back', 'carcass_top']), backOnly)).toBe(false)
  })
  it('falls back to flags when unresolved', () => {
    expect(elevationShowsCabinet(cab(), only('elevation', ['kick_faces']), undefined)).toBe(true)
    expect(elevationShowsCabinet(cab({ assembly_class: 'wall' }), only('elevation', ['kick_faces']), undefined)).toBe(false)
  })
})

describe('3D alpha', () => {
  const view = (items: Record<string, { style?: string; opacity?: number }>) =>
    resolveLayerView({ id: 's', name: 's', sort_order: 0, settings: { '3d': { items } } } as LayerSet, '3d')

  it('is 1 for a plain solid item', () => {
    expect(view({}).alpha('doors')).toBe(1)
  })
  it('ghost goes see-through', () => {
    expect(view({ doors: { style: 'ghost' } }).alpha('doors')).toBeCloseTo(0.25)
  })
  it('multiplies ghost by opacity', () => {
    expect(view({ doors: { style: 'ghost', opacity: 0.5 } }).alpha('doors')).toBeCloseTo(0.125)
  })
  it('dashed draws solid in 3D', () => {
    expect(view({ doors: { style: 'dashed' } }).alpha('doors')).toBe(1)
  })
})
