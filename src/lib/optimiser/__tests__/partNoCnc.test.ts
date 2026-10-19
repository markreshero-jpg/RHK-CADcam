// Per-part "No CNC" ticks (z_display_layers/PART-HIDE-SPEC.md): a part id in
// cabinet_instances.part_no_cnc is listed but not sent to the CNC.

import { describe, it, expect } from 'vitest'
import { normalizeProject } from '../normalize'

const project = { id: 'p', name: 'P', job_number: null }
const rooms = [{ id: 'r', name: 'Kitchen' }]
const casePart = (id: string, part_key: string) => ({
  id, cabinet_instance_id: 'c', part_key, dx: 560, dy: 720, dz: 16,
  material_id: 'm', grain_direction: null, nest_priority: 0, output_to_cnc: true,
})

describe('normalizeProject — part_no_cnc', () => {
  it('turns off output_to_cnc for ticked parts only', () => {
    const cabs = [{ id: 'c', label: 'B1', assembly_class: 'base', room_id: 'r', part_no_cnc: ['case_left_side'] }]
    const { parts } = normalizeProject(project, rooms, cabs,
      [casePart('1', 'left_side'), casePart('2', 'right_side')], [], [], [])
    const cut = Object.fromEntries(parts.map(p => [p.source_part_key, p.output_to_cnc]))
    expect(cut).toEqual({ case_left_side: false, case_right_side: true })
  })

  it('treats a missing list as nothing ticked', () => {
    const cabs = [{ id: 'c', label: 'B1', assembly_class: 'base', room_id: 'r' }]
    const { parts } = normalizeProject(project, rooms, cabs, [casePart('1', 'left_side')], [], [], [])
    expect(parts[0].output_to_cnc).toBe(true)
  })
})

describe('normalizeProject — removed parts (hidden in all views)', () => {
  it('leaves removed parts out entirely; partial hides are still made', () => {
    const cabs = [{ id: 'c', label: 'B1', assembly_class: 'base', room_id: 'r',
      part_hide_views: { case_left_side: ['plan', 'elevation', '3d'], case_right_side: ['plan'] } as Record<string, ('plan' | 'elevation' | '3d')[]> }]
    const custom = [
      { id: 'x', cabinet_instance_id: 'c', name: 'Panel', dx: 600, dy: 900, dz: 18, hide_views: ['plan', 'elevation', '3d'] },
      { id: 'y', cabinet_instance_id: 'c', name: 'Filler', dx: 70, dy: 900, dz: 18, hide_views: [] },
    ]
    const { parts } = normalizeProject(project, rooms, cabs,
      [casePart('1', 'left_side'), casePart('2', 'right_side')], [], [], [], [], new Map(), custom)
    expect(parts.map(p => p.source_part_key)).toEqual(['case_right_side', 'custom_y'])
  })
})
