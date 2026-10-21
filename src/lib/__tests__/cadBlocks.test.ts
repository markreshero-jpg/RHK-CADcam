import { describe, it, expect } from 'vitest'
import type { RoomAnnotation } from '../types'
import { toBlockItems, placeBlockItems, blockInsertPoint, fillFields, annotationsBounds } from '../annotations/blocks'
import type { LineGeom, TextGeom, CircleGeom } from '../annotations/geometry'

const ann = (kind: RoomAnnotation['kind'], geom: RoomAnnotation['geom'], text: string | null = null, sort_order = 0): RoomAnnotation => ({
  id: `a${sort_order}`, room_id: 'r', view: 'plan', wall_id: null, cabinet_id: null, sheet_view: null,
  kind, geom, text, style: {}, sort_order, created_at: '', updated_at: '',
})

describe('CAD blocks', () => {
  const line = ann('line', { pts: [{ x: 1000, y: 2000 }, { x: 1400, y: 2000 }] }, null, 0)
  const circle = ann('circle', { c: { x: 1200, y: 2200 }, r: 100 }, null, 1)

  it('saves in paper mm from the top-left and drops back in at another scale', () => {
    const items = toBlockItems([line, circle], 20)
    expect((items[0].geom as LineGeom).pts).toEqual([{ x: 0, y: 0 }, { x: 20, y: 0 }])
    expect((items[1].geom as CircleGeom)).toMatchObject({ c: { x: 10, y: 10 }, r: 5 })
    const at50 = placeBlockItems(items, { x: 5000, y: 0 }, 50)
    expect((at50[0].geom as LineGeom).pts).toEqual([{ x: 5000, y: 0 }, { x: 6000, y: 0 }])
    expect((at50[1].geom as CircleGeom)).toMatchObject({ c: { x: 5500, y: 500 }, r: 250 })
  })

  it('keeps a text box width in paper mm', () => {
    const t = ann('text', { at: { x: 2000, y: 100 }, width: 75 } as TextGeom, 'SPEC')
    const items = toBlockItems([t], 20)
    expect(items[0].geom).toMatchObject({ at: { x: 0, y: 0 }, width: 75 })
    expect(placeBlockItems(items, { x: 300, y: 400 }, 20)[0].geom).toMatchObject({ at: { x: 300, y: 400 }, width: 75 })
  })

  it('drops right of the walls and below a note already in that column', () => {
    const items = toBlockItems([line], 20)                                   // 400 x 0 at 1:20
    const walls = { minX: -90, minY: -90, maxX: 1690, maxY: 1590 }
    expect(blockInsertPoint(items, walls, [], 20)).toEqual({ x: 2190, y: -90 })
    const note = annotationsBounds([ann('rect', { a: { x: 2100, y: -200 }, b: { x: 2800, y: 600 } })], 20)!
    expect(blockInsertPoint(items, walls, [note], 20)).toEqual({ x: 2190, y: 700 })
  })
})

describe('live fields', () => {
  it('fills known fields, dashes empty ones, leaves unknown tokens', () => {
    const v = { benchtop: '40mm Stone', handles: '' }
    expect(fillFields('{benchtop} - Alpha Opal Mist', v)).toBe('40mm Stone - Alpha Opal Mist')
    expect(fillFields('Handles: {handles}', v)).toBe('Handles: -')
    expect(fillFields('Runners: {runners}', v)).toBe('Runners: -')
    expect(fillFields('{not_a_field}', v)).toBe('{not_a_field}')
    expect(fillFields(null, v)).toBeNull()
  })
})
