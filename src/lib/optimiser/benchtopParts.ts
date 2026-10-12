// ============================================================
// Benchtop parts → optimiser snapshot (benchtop Phase 5).
// In-house tops (built-up strips / rails / board worktops) are cut from sheet
// stock like cabinet parts. Their resolved rows (benchtop_resolved_parts) join
// the snapshot as extra parts: the benchtop stands in for the "cabinet" (so
// the room / cabinet filters work), one OptiPart per unit of quantity.
// Supply items (outsourced stone / laminate) never reach the cut list.
// Read-only in the optimiser: no part_operations, comments or renames.
// ============================================================

import type { OptiPart, OptiCabinet, OptiRoom } from './types'
import type { OptiShape } from './shapes'
import type { RawProject } from './normalize'

export interface RawBenchtop { id: string; label: string | null; room_id: string }

/** Columns the loaders read from benchtop_resolved_parts. */
export const BENCHTOP_PART_SELECT =
  'id,benchtop_id,part_role,label,length_mm,width_mm,thickness_mm,quantity,grain_direction,material_id,supply_item,piece,outline'

type Row = Record<string, unknown>

// Part frame: x = length, y = width (min corner at 0). The optimiser footprint
// is w × h with h along the grain (CV DY = length), so a length-grain part is
// rotated a quarter turn (not mirrored): (x, y) → (y, L − x).
function shapeFor(outline: { x: number; y: number }[], L: number, W: number, lengthGrain: boolean): OptiShape {
  const polygon = lengthGrain ? outline.map(p => ({ x: p.y, y: L - p.x })) : outline.map(p => ({ x: p.x, y: p.y }))
  const segments = polygon.map((p, i) => ({ type: 'line', p0: p, p1: polygon[(i + 1) % polygon.length] }))
  return { segments, polygon, bbox: lengthGrain ? { w: W, h: L } : { w: L, h: W }, tape_mm: null, revision: 0 }
}

export function normalizeBenchtopParts(
  project: RawProject, rooms: OptiRoom[], benchtops: RawBenchtop[], rows: Row[],
): { cabinets: OptiCabinet[]; parts: OptiPart[] } {
  const roomById = new Map(rooms.map(r => [r.id, r]))
  const btById = new Map(benchtops.map(b => [b.id, b]))
  const parts: OptiPart[] = []
  const used = new Set<string>()
  for (const r of rows) {
    // Only board parts: supply items are ordered, and a row with no board
    // material (e.g. a surface laminate sheet) has nothing to nest on.
    if (r.supply_item || !r.material_id) continue
    const bt = btById.get(r.benchtop_id as string)
    if (!bt) continue
    used.add(bt.id)
    const L = Number(r.length_mm), W = Number(r.width_mm)
    const lengthGrain = r.grain_direction !== 'width'
    const outline = Array.isArray(r.outline) && r.outline.length >= 3 ? r.outline as { x: number; y: number }[] : null
    const qty = Math.max(1, Number(r.quantity) || 1)
    const room = roomById.get(bt.room_id)
    for (let i = 0; i < qty; i++) {
      const label = String(r.label) + (qty > 1 ? ` ${i + 1}` : '')
      parts.push({
        uid: `benchtop_parts:${r.id as string}:${i}`,
        source_table: 'benchtop_parts', source_part_id: r.id as string,
        source_part_key: `bt_${r.id as string}_${i}`,
        cabinet_instance_id: bt.id, cabinet_label: bt.label ?? 'Benchtop',
        room_id: bt.room_id, room_name: room?.name ?? '—',
        project_id: project.id, job_number: project.job_number,
        label, default_label: label, part_type_key: '',
        w: lengthGrain ? W : L, h: lengthGrain ? L : W, thickness: Number(r.thickness_mm),
        eb_w1: 0, eb_w2: 0, eb_h1: 0, eb_h2: 0, eb_missing: false,
        material_id: r.material_id as string,
        grain_direction: (r.grain_direction as string) ?? null,
        nest_priority: 0, output_to_cnc: true, comment: null,
        ...(outline ? { shape: shapeFor(outline, L, W, lengthGrain), shape_stale: false } : {}),
      })
    }
  }
  const cabinets: OptiCabinet[] = benchtops.filter(b => used.has(b.id))
    .map(b => ({ id: b.id, label: b.label ?? 'Benchtop', room_id: b.room_id }))
  return { cabinets, parts }
}

export const isBenchtopPart = (p: Pick<OptiPart, 'source_table'>) => p.source_table === 'benchtop_parts'
