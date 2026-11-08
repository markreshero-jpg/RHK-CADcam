import { describe, it, expect, vi } from 'vitest'
vi.mock('@/src/lib/supabase', () => ({ supabase: {} }))
import { normalizeProject } from '../normalize'

// A job of only loose custom parts (Construct Building, 2026-11-05): no other
// part on the board to borrow a tape from, so the banded edge falls back to
// the schedule tape for that board instead of coming through with none.
const custom = { id: 'cp1', cabinet_instance_id: 'c1', name: 'Strip 430 x 60', orientation: 'front', dx: 60, dy: 430, dz: 16.5,
  material_id: 'wb', edge_top: false, edge_bottom: false, edge_left: true, edge_right: false }
const run = (tapes?: Map<string, { id: string; thickness: number }>) =>
  normalizeProject({ id: 'p', name: 'p', job_number: null }, [{ id: 'room', name: 'R' }],
    [{ id: 'c1', label: 'TC-02', assembly_class: 'tall', room_id: 'room' }],
    [], [], [], [], [], new Map(), [custom], new Map(), new Map(), {}, new Map(), new Map(), tapes).parts[0]

describe('custom part tape with no other part on the board', () => {
  it('without a schedule tape the edge is flagged missing', () => {
    const p = run()
    expect(p.eb_missing).toBe(true)
  })
  it('takes the schedule tape for its board', () => {
    const p = run(new Map([['wb', { id: 'tape21', thickness: 1 }]]))
    expect(p.eb_missing).toBe(false)
    expect([p.eb_w1, p.eb_w2, p.eb_h1, p.eb_h2]).toContain(1)
  })
  it('a part with its own tape uses it, not the board tape', () => {
    const own = { ...custom, edge_band_id: 'tape38' }
    const p = normalizeProject({ id: 'p', name: 'p', job_number: null }, [{ id: 'room', name: 'R' }],
      [{ id: 'c1', label: 'TC-02', assembly_class: 'tall', room_id: 'room' }],
      [], [], [], [], [], new Map(), [own], new Map(), new Map(), {}, new Map(), new Map(),
      new Map([['wb', { id: 'tape21', thickness: 1 }]])).parts[0]
    expect(JSON.stringify(p.eb_tape)).toContain('tape38')
    expect(JSON.stringify(p.eb_tape)).not.toContain('tape21')
  })
})
