import { describe, it, expect } from 'vitest'
import { zonePartId, parseZonePartId, zoneKey } from '../partKeys'

describe('zone part ids', () => {
  it('primary front keeps the legacy id', () => {
    expect(zonePartId({ row_index: 1, col_index: 2 })).toBe('zone_1_2')
    expect(zonePartId({ row_index: 1, col_index: 2, facet: '' })).toBe('zone_1_2')
    expect(parseZonePartId('zone_1_2')).toEqual({ row: 1, col: 2 })
  })

  it('facet zones round-trip and never parse as a primary zone the legacy way', () => {
    const id = zonePartId({ row_index: 0, col_index: 1, facet: 'facet' })
    expect(id).toBe('zone_facet.0_1')
    expect(parseZonePartId(id)).toEqual({ facet: 'facet', row: 0, col: 1 })
    expect(zoneKey({ row_index: 0, col_index: 1, facet: 'facet' })).toBe('facet.0_1')
    // Legacy parser: id.slice(5).split('_').map(Number) → [NaN, 1] → matches no row.
    expect(Number.isNaN(id.slice(5).split('_').map(Number)[0])).toBe(true)
  })

  it('rejects non-zone ids', () => {
    expect(parseZonePartId('case_back')).toBeNull()
    expect(parseZonePartId('zone_x')).toBeNull()
  })
})
