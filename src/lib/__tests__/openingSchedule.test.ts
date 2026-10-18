import { describe, it, expect } from 'vitest'
import type { Room, Wall, RoomFixture } from '../types'
import { buildOpeningSchedule } from '../../../app/canvas/[roomId]/OpeningScheduleReport'

const room = { id: 'r', name: 'Kitchen' } as Room
const walls = [{ id: 'a', room_id: 'r', name: null }, { id: 'b', room_id: 'r', name: 'Back' }] as unknown as Wall[]
const op = (o: Partial<RoomFixture>) => ({
  room_id: 'r', category: 'opening', name: 'x', width: 820, height: 2040, z: 0, x: 0, label: null,
  wall_id: 'a', hinge_side: 'left', swing: 'in', ...o,
}) as RoomFixture

describe('door & window schedule', () => {
  it('marks D / W per room, doors first, sill + head + hinge', () => {
    const [d] = buildOpeningSchedule([room], [
      op({ kind: 'Window', width: 1200, height: 1200, z: 900, wall_id: 'b' }),
      op({ kind: 'Door', hinge_side: 'right', swing: 'out' }),
      { ...op({ kind: 'Door' }), category: 'appliance' } as RoomFixture,
    ], walls)
    expect(d.lines.map(l => l.mark)).toEqual(['D1', 'W1'])
    expect(d.lines[0]).toMatchObject({ wall: 'Wall 1', sill: '—', head: '2040', hang: 'Right hinge · swings out' })
    expect(d.lines[1]).toMatchObject({ wall: 'Back', size: '1200 × 1200', sill: '900', head: '2100', hang: '' })
  })
})
