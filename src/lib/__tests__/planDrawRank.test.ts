import { describe, it, expect } from 'vitest'
import { planDrawRank } from '../geometry'

const cab = (o: Record<string, unknown>) => ({ assembly_class: 'base', pos_z: 0, ...o }) as Parameters<typeof planDrawRank>[0]

describe('planDrawRank', () => {
  it('draws low → high: kick, bases, desk top / bench, overheads, bulkheads', () => {
    const kick = cab({ is_kick_assembly: true })
    const base = cab({ pos_z: 100 })
    const desk = cab({ pos_z: 697.5, rule_overrides: { UNDER_PANEL: true } })
    const oh = cab({ assembly_class: 'wall' })
    const bh = cab({ assembly_class: 'wall', bulkhead: { kind: 'bulkhead' } })
    const order = [bh, oh, desk, base, kick].sort((a, b) => planDrawRank(a) - planDrawRank(b))
    expect(order).toEqual([kick, base, desk, bh, oh])
  })

  it('an overhead under panel sits below the overheads; a floating run under panel below its carcass', () => {
    expect(planDrawRank(cab({ assembly_class: 'wall', pos_z: 1500, rule_overrides: { UNDER_PANEL: true } })))
      .toBeLessThan(planDrawRank(cab({ assembly_class: 'wall' })))
    expect(planDrawRank(cab({ pos_z: 184, rule_overrides: { UNDER_PANEL: true } })))
      .toBeLessThan(planDrawRank(cab({ pos_z: 200 })))
  })
})
