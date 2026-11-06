import { describe, it, expect, vi } from 'vitest'
vi.mock('@/src/lib/supabase', () => ({ supabase: {} }))
import { normalizeProject } from '../normalize'

// Upright panels stored height-as-DX nest with their grain along w (= DX), like
// backs: shaped-cabinet sides (side:<edge>) and a curved end's inside face panel
// (crv:inner) — RHK6581 BC-01 / BC-03 inner panels were nesting grain across.
function nest(rows: { part_key: string; dx: number; dy: number; grain_direction?: string | null }[]) {
  return normalizeProject({ id: 'p', name: 'p', job_number: null }, [{ id: 'room', name: 'R' }],
    [{ id: 'c1', label: 'C', assembly_class: 'base', room_id: 'room' }],
    rows.map((r, i) => ({ id: `r${i}`, cabinet_instance_id: 'c1', dz: 18, material_id: 'm', outline: null, grain_direction: null, ...r })),
    [], [], [], [], new Map(), [], new Map(), new Map(), {}, new Map(), new Map()).parts
}
const across = (parts: ReturnType<typeof nest>, id: string) => !!parts.find(p => p.source_part_id === id)?.grain_across

describe('upright panel grain (height as DX)', () => {
  it('runs a shaped side and a curved inside panel up their height', () => {
    const parts = nest([
      { part_key: 'side:angle', dx: 640, dy: 947 },
      { part_key: 'crv:inner', dx: 840, dy: 562, grain_direction: 'vertical' },
      { part_key: 'crv:inner', dx: 840, dy: 562 },
    ])
    expect(across(parts, 'r0')).toBe(true)
    expect(across(parts, 'r1')).toBe(true)
    expect(across(parts, 'r2')).toBe(true)
  })
  it('leaves a horizontal-grain inside panel, ordinary gables and the face board alone', () => {
    const parts = nest([
      { part_key: 'crv:inner', dx: 840, dy: 562, grain_direction: 'horizontal' },
      { part_key: 'left_side', dx: 560, dy: 870 },
      { part_key: 'crv:face', dx: 956, dy: 840, grain_direction: 'vertical' },
    ])
    expect(across(parts, 'r0')).toBe(false)
    expect(across(parts, 'r1')).toBe(false)
    expect(across(parts, 'r2')).toBe(false)
  })
})
