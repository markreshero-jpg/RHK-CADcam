import { describe, it, expect, vi } from 'vitest'
vi.mock('@/src/lib/supabase', () => ({ supabase: {} }))
import { normalizeProject } from '../normalize'

// Front names (Mark, 2026-11-08): doors by hinge side ("Left Door"), drawer
// fronts numbered 1, 2, 3… from the top, no R1C1 position on the name.

const zone = (i: number, row: number, col: number, face_type: string, hinge_side: string | null) => ({
  id: `z${i}`, cabinet_instance_id: 'c1', facet: null, row_index: row, col_index: col, face_type, hinge_side,
  dx: 447, dy: 720, dz: 18, material_id: 'm', grain_direction: null, output_to_cnc: true,
})
const dbPart = (i: number, row: number, part_type: string) => ({
  id: `d${i}`, cabinet_instance_id: 'c1', facet: null, face_zone_row: row, face_zone_col: 0, part_type,
  dx: 400, dy: 500, dz: 16, material_id: 'm', grain_direction: null, output_to_cnc: true,
})

function names(zones: ReturnType<typeof zone>[], db: ReturnType<typeof dbPart>[] = []) {
  return normalizeProject({ id: 'p', name: 'p', job_number: null }, [{ id: 'room', name: 'R' }],
    [{ id: 'c1', label: 'C', assembly_class: 'base', room_id: 'room' }],
    [], [], [], zones, db, new Map(), [], new Map(), new Map(), {}, new Map(), new Map()).parts.map(p => p.label)
}

describe('front names', () => {
  it('names doors by hinge side', () => {
    expect(names([zone(0, 0, 0, 'door', 'left'), zone(1, 0, 1, 'door', 'right'), zone(2, 0, 2, 'door', 'top'), zone(3, 0, 3, 'door', 'bottom')]))
      .toEqual(['Left Door', 'Right Door', 'Top Door', 'Bottom Door'])
  })
  it('no hinge side → plain Door', () => {
    expect(names([zone(0, 0, 0, 'door', null)])).toEqual(['Door'])
  })
  it('numbers drawer fronts from the top (rows stored bottom-up); boxes share the number', () => {
    // 3-drawer bank: row 2 is the top drawer.
    expect(names([zone(0, 0, 0, 'drawer_face', 'left'), zone(1, 1, 0, 'drawer_face', 'left'), zone(2, 2, 0, 'drawer_face', 'left')],
      [dbPart(0, 2, 'db_bottom'), dbPart(1, 0, 'db_bottom')]))
      .toEqual(['Drawer Face 3', 'Drawer Face 2', 'Drawer Face 1', 'Drawer Box Bottom 1', 'Drawer Box Bottom 3'])
  })
})
