import { describe, it, expect } from 'vitest'
import {
  effectiveSplashbackRows, benchtopPanelMaterial, pickSplashbackScheduleId, splashbackPanelIsBoard,
} from '../splashbackMaterials'

const row = (part_role: 'panel' | 'substrate' | 'packer', m: string | null, b: string | null) =>
  ({ part_role, material_id: m, benchtop_material_id: b, edgeband_id: null })

describe('splashback material cascade', () => {
  it('picks the first schedule id set', () => {
    expect(pickSplashbackScheduleId(null, undefined, 'room', 'job')).toBe('room')
    expect(pickSplashbackScheduleId(null, null)).toBeNull()
  })

  it('inherits the benchtop stone when the panel is empty and the setting is on', () => {
    const bp = benchtopPanelMaterial([
      { part_role: 'worktop_panel', material_id: null, benchtop_material_id: 'wt' },
      { part_role: 'stone_slab', material_id: null, benchtop_material_id: 'snb' },
    ])
    expect(bp).toEqual({ material_id: null, benchtop_material_id: 'snb' })
    const rows = effectiveSplashbackRows({ scheduleRows: [], inheritBenchtop: true, benchtopPanel: bp })
    expect(rows).toEqual([{ ...row('panel', null, 'snb'), source: 'benchtop' }])
  })

  it('does not inherit when the setting is off', () => {
    const rows = effectiveSplashbackRows({
      scheduleRows: [], inheritBenchtop: false, benchtopPanel: { material_id: null, benchtop_material_id: 'snb' },
    })
    expect(rows).toEqual([])
  })

  it('schedule panel beats inherit (glass on a stone bench)', () => {
    const rows = effectiveSplashbackRows({
      scheduleRows: [row('panel', null, 'glass')], inheritBenchtop: true,
      benchtopPanel: { material_id: null, benchtop_material_id: 'snb' },
    })
    expect(rows[0].benchtop_material_id).toBe('glass')
    expect(rows[0].source).toBe('schedule')
  })

  it('room override beats job; a board override clears the stone id', () => {
    const rows = effectiveSplashbackRows({
      scheduleRows:  [row('panel', null, 'stone'), row('substrate', 'wb', null)],
      jobOverrides:  [row('panel', null, 'glass')],
      roomOverrides: [row('panel', 'board', 'leftover')],
      inheritBenchtop: true,
    })
    const panel = rows.find(r => r.part_role === 'panel')!
    expect(panel).toMatchObject({ material_id: 'board', benchtop_material_id: null, source: 'room' })
    expect(splashbackPanelIsBoard(panel)).toBe(true)
    expect(rows.map(r => r.part_role)).toEqual(['panel', 'substrate'])
  })
})
