// Schedule tape per board, for custom parts (cabinet_custom_parts has no
// edge_band_id). The normaliser otherwise borrows the tape from another part
// on the same board in the run — a job of only loose custom parts has none,
// so its banded edges came through with no tape (Construct Building, 2026-11-05).
// Same cascade as the resolver's assembly schedule: room → job (per class and
// general) → shop default. Job / room schedules win over the shop default.
import type { SupabaseClient } from '@supabase/supabase-js'

export type TapeByMaterial = Map<string, { id: string; thickness: number }>

export async function loadScheduleTapes(sb: SupabaseClient, projectId: string, roomIds: string[]): Promise<TapeByMaterial> {
  const [projR, roomsR, shopR] = await Promise.all([
    sb.from('projects').select('assembly_schedule_id,base_assembly_schedule_id,wall_assembly_schedule_id,tall_assembly_schedule_id').eq('id', projectId).maybeSingle(),
    roomIds.length ? sb.from('rooms').select('assembly_schedule_id').in('id', roomIds) : Promise.resolve({ data: [] }),
    sb.from('assembly_schedules').select('id').eq('is_default', true).limit(1).maybeSingle(),
  ])
  const p = (projR.data ?? {}) as Record<string, string | null>
  const jobIds = [
    ...((roomsR.data ?? []) as { assembly_schedule_id: string | null }[]).map(r => r.assembly_schedule_id),
    p.base_assembly_schedule_id, p.wall_assembly_schedule_id, p.tall_assembly_schedule_id, p.assembly_schedule_id,
  ].filter((x): x is string => !!x)
  const order = [...new Set([...jobIds, ...(shopR.data?.id ? [shopR.data.id as string] : [])])]
  if (!order.length) return new Map()

  const { data: rows } = await sb.from('assembly_schedule_rows').select('schedule_id,material_id,edgeband_id')
    .in('schedule_id', order).not('edgeband_id', 'is', null)
  const rank = new Map(order.map((id, i) => [id, i]))
  const best = new Map<string, { eb: string; rank: number }>()
  for (const r of (rows ?? []) as { schedule_id: string; material_id: string | null; edgeband_id: string }[]) {
    if (!r.material_id) continue
    const k = rank.get(r.schedule_id) ?? order.length
    const cur = best.get(r.material_id)
    if (!cur || k < cur.rank) best.set(r.material_id, { eb: r.edgeband_id, rank: k })
  }
  const ebIds = [...new Set([...best.values()].map(b => b.eb))]
  if (!ebIds.length) return new Map()
  const { data: ebs } = await sb.from('edge_banding').select('id,thickness').in('id', ebIds)
  const thick = new Map(((ebs ?? []) as { id: string; thickness: number }[]).map(e => [e.id, Number(e.thickness)]))
  const out: TapeByMaterial = new Map()
  for (const [mat, b] of best) { const t = thick.get(b.eb); if (t != null) out.set(mat, { id: b.eb, thickness: t }) }
  return out
}
