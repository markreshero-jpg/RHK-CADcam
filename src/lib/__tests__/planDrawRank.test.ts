import { describe, it, expect } from 'vitest'
import { planDrawOrder } from '../geometry'
import type { CabinetInstance, Room, Wall } from '../types'

const room = { room_dy: 2383, wall_cabinet_top: 2353 } as unknown as Room
const walls = [{ id: 'w', height: 2383 } as unknown as Wall]
let n = 0
const cab = (o: Partial<CabinetInstance> & Record<string, unknown>) =>
  ({ id: `c${n++}`, wall_id: 'w', assembly_class: 'base', pos_z: 0, dy: 720, ...o }) as unknown as CabinetInstance

describe('planDrawOrder — looking down from the ceiling', () => {
  it('sorts by real top height, highest last; kicks always under', () => {
    const kick = cab({ is_kick_assembly: true, dy: 100 })
    const panel = cab({ dy: 697.5 })                                                     // desk end panel, top 697.5
    const desk = cab({ pos_z: 697.5, dy: 62.5, rule_overrides: { UNDER_PANEL: true } })  // desk top 760
    const oh = cab({ assembly_class: 'wall', dy: 853 })                                  // overhead to 2353
    const bh = cab({ assembly_class: 'wall', dy: 30, bulkhead: { kind: 'bulkhead' } as unknown as CabinetInstance['bulkhead'] })   // 2353–2383
    const tall = cab({ assembly_class: 'tall', dy: 2100 })
    expect(planDrawOrder([bh, oh, tall, desk, panel, kick], walls, room)).toEqual([kick, panel, desk, tall, oh, bh])
  })

  it('a bench on its bases and an under panel below its overheads', () => {
    const base = cab({ pos_z: 100, dy: 767 })                                                       // top 867
    const bench = cab({ assembly_class: 'wall', pos_z: 867, dy: 33, rule_overrides: { UNDER_PANEL: true } }) // top 900
    const up = cab({ assembly_class: 'wall', pos_z: 1500, dy: 16.5, rule_overrides: { UNDER_PANEL: true } })
    const oh = cab({ assembly_class: 'wall', dy: 853 })
    expect(planDrawOrder([oh, up, bench, base], walls, room)).toEqual([base, bench, up, oh])
  })
})
