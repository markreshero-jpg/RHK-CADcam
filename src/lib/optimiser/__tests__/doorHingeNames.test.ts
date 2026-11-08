import { describe, it, expect, vi } from 'vitest'
vi.mock('@/src/lib/supabase', () => ({ supabase: {} }))
import { normalizeProject } from '../normalize'

// Doors are named by hinge side so the sticker says which way it hangs
// (Mark, 2026-11-08): "Left Door (R1C1)", "Right Door (R1C2)".

const zone = (i: number, col: number, face_type: string, hinge_side: string | null) => ({
  id: `z${i}`, cabinet_instance_id: 'c1', facet: null, row_index: 0, col_index: col, face_type, hinge_side,
  dx: 447, dy: 720, dz: 18, material_id: 'm', grain_direction: null, output_to_cnc: true,
})

function names(zones: ReturnType<typeof zone>[]) {
  return normalizeProject({ id: 'p', name: 'p', job_number: null }, [{ id: 'room', name: 'R' }],
    [{ id: 'c1', label: 'C', assembly_class: 'base', room_id: 'room' }],
    [], [], [], zones, [], new Map(), [], new Map(), new Map(), {}, new Map(), new Map()).parts.map(p => p.label)
}

describe('door names by hinge side', () => {
  it('names left / right / top / bottom doors', () => {
    expect(names([zone(0, 0, 'door', 'left'), zone(1, 1, 'door', 'right'), zone(2, 2, 'door', 'top'), zone(3, 3, 'door', 'bottom')]))
      .toEqual(['Left Door (R1C1)', 'Right Door (R1C2)', 'Top Door (R1C3)', 'Bottom Door (R1C4)'])
  })
  it('no hinge side → plain Door; drawer fronts never get a side', () => {
    expect(names([zone(0, 0, 'door', null), zone(1, 1, 'drawer_face', 'left')]))
      .toEqual(['Door (R1C1)', 'Drawer Face (R1C2)'])
  })
})
