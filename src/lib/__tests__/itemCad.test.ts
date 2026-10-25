import { describe, it, expect } from 'vitest'
import type { RoomAnnotation } from '@/src/lib/types'
import type { TextGeom, LineGeom } from '@/src/lib/annotations/geometry'
import {
  anchorPoint, nearestAnchor, toItemCadItems, placeItemCad, itemsForOwner, missingJobCopies, ownerId,
  type LibraryCad, type JobItemCad,
} from '@/src/lib/annotations/itemCad'
import { ownedBy, cabinetSheetOwner, elevationOwner } from '@/src/lib/annotations/owner'

const note = (id: string, kind: RoomAnnotation['kind'], geom: unknown, text: string | null = null): RoomAnnotation => ({
  id, room_id: 'r', view: 'cabinet_sheet', wall_id: null, cabinet_id: 'c1', sheet_view: 'front', wall_side: null,
  kind, geom: geom as RoomAnnotation['geom'], text, style: {}, sort_order: 0, created_at: '', updated_at: '',
})

// A 450 wide bin front from 150 to 870 high (frame y down from the cabinet bottom).
const front = { minX: 0, maxX: 450, minY: -870, maxY: -150 }

describe('item CAD anchors', () => {
  it('9 points on the box, y down', () => {
    expect(anchorPoint(front, 'tl')).toEqual({ x: 0, y: -870 })
    expect(anchorPoint(front, 'mc')).toEqual({ x: 225, y: -510 })
    expect(anchorPoint(front, 'br')).toEqual({ x: 450, y: -150 })
  })
  it('nearest anchor to a point', () => {
    expect(nearestAnchor(front, { x: 230, y: -500 })).toBe('mc')
    expect(nearestAnchor(front, { x: 440, y: -860 })).toBe('tr')
  })
})

describe('item CAD round trip', () => {
  const k = 20   // 1:20
  const line = note('l', 'line', { pts: [{ x: 25, y: -150 }, { x: 425, y: -870 }] })

  it('a line from corner to corner anchors at the centre, in paper mm', () => {
    const [it0] = toItemCadItems([line], front, k)
    expect(it0.anchor).toBe('mc')
    expect((it0.geom as LineGeom).pts[0]).toEqual({ x: -10, y: 18 })
  })

  it('placed on a wider front it keeps its paper size, centred (fixed size)', () => {
    const items = toItemCadItems([line], front, k)
    const wide = { minX: 0, maxX: 900, minY: -870, maxY: -150 }
    const [p] = placeItemCad(items, wide, k)
    expect((p.geom as LineGeom).pts[0]).toEqual({ x: 250, y: -150 })
    expect((p.geom as LineGeom).pts[1]).toEqual({ x: 650, y: -870 })
  })

  it('placed at the same scale on the same box returns the same geometry', () => {
    const t = note('t', 'text', { at: { x: 200, y: -520 } } satisfies Partial<TextGeom>, 'PULLOUT BIN')
    const [p] = placeItemCad(toItemCadItems([t], front, k), front, k)
    expect((p.geom as TextGeom).at.x).toBeCloseTo(200)
    expect((p.geom as TextGeom).at.y).toBeCloseTo(-520)
    expect(p.text).toBe('PULLOUT BIN')
  })
})

describe('item CAD pinning (decision 4)', () => {
  const lib: LibraryCad[] = [{ id: 'L1', owner_kind: 'front_type', owner_key: 'bin', view: 'elevation', version: 3, created_at: '2026-10-25T10:00:00Z',
    items: [{ kind: 'text', geom: { at: { x: 0, y: 0 } } as TextGeom, text: 'NEW', style: {}, anchor: 'mc' }] }]
  const pinned: JobItemCad[] = [{ id: 'J1', project_id: 'p', library_cad_id: 'L1', version: 2,
    items: [{ kind: 'text', geom: { at: { x: 0, y: 0 } } as TextGeom, text: 'OLD', style: {}, anchor: 'mc' }] }]

  it('a job draws its pinned copy, not the newer library', () => {
    expect(itemsForOwner(lib, pinned, 'front_type', 'bin', 'elevation')[0].text).toBe('OLD')
  })
  it('no job (room outside a project) draws the library', () => {
    expect(itemsForOwner(lib, null, 'front_type', 'bin', 'elevation')[0].text).toBe('NEW')
  })
  it('a job without a copy yet draws nothing until it is pinned, and asks for one only when it uses the owner', () => {
    expect(itemsForOwner(lib, [], 'front_type', 'bin', 'elevation')).toEqual([])
    expect(missingJobCopies(lib, [], new Set([ownerId('front_type', 'bin')])).map(l => l.id)).toEqual(['L1'])
    expect(missingJobCopies(lib, [], new Set())).toEqual([])
    expect(missingJobCopies(lib, pinned, new Set([ownerId('front_type', 'bin')]))).toEqual([])
  })
  it('a job started before the item CAD existed does not pick it up by itself', () => {
    const used = new Set([ownerId('front_type', 'bin')])
    expect(missingJobCopies(lib, [], used, '2026-10-01T00:00:00Z')).toEqual([])
    expect(missingJobCopies(lib, [], used, '2026-11-01T00:00:00Z').map(l => l.id)).toEqual(['L1'])
  })
})

describe('cabinet sheet owner', () => {
  it('owns only its cabinet + view', () => {
    const n = note('a', 'text', { at: { x: 0, y: 0 } })
    expect(ownedBy(n, cabinetSheetOwner('c1', 'front'))).toBe(true)
    expect(ownedBy(n, cabinetSheetOwner('c1', 'top'))).toBe(false)
    expect(ownedBy(n, cabinetSheetOwner('c2', 'front'))).toBe(false)
    expect(ownedBy(n, elevationOwner('w1', 'face'))).toBe(false)
  })
})
