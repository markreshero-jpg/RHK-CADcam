// ============================================================
// Master/slave sync — the DB wrapper around the pure firing core (§5.4).
//
// Mirrors seamDrillSync: resolve the cabinet, fire every master/joint op onto
// its coincident target part(s), then replace this cabinet's slave rows
// wholesale (delete parameters.generated='master_slave', reinsert). Hand-added
// local rows and the resolver's seam-joint rows (a DIFFERENT generated marker)
// are never touched, so the two generators stay independent.
//
// Both callers use this one routine:
//   • editor (live)        — on place/edit/delete of a master/joint op (M4)
//   • optimiser (authoritative) — the nest pass, against final geometry (M6)
// so "what fires where" can't drift between preview and output.
// ============================================================

import { supabase } from '@/src/lib/supabase'
import { resolveCabinetFromDB } from '@/src/lib/resolver/resolveCabinetFromDB'
import { fireMasters, GENERATED_MARK, type FireOpRow } from './fireMasters'

// Columns fireMasters reads. Kept explicit (not select('*')) so the shape matches
// FireOpRow and the query is stable.
const OP_COLS =
  'id, source_part_key, operation_type, operation_action, operation_role, ' +
  'pos_x, pos_y, pos_z, diameter, depth, width, length, size_dx, size_dy, size_dz, ' +
  'repeat_count, repeat_spacing, repeat_axis, router_tool_id, drill_id, auto_tool, ' +
  'tool_set_id, output_to_cnc, parameters'

export interface MasterSlaveSyncResult { written: number; skipped: number; noTouch: number }

// Regenerate ALL master/joint slave rows for ONE cabinet.
export async function syncMasterSlaves(cabinetId: string): Promise<MasterSlaveSyncResult> {
  // Quiet resolve — a half-built or just-deleted cabinet must not hard-error while
  // the whole nest regenerates (same policy as seamDrillSync).
  let rp
  try {
    rp = await resolveCabinetFromDB(cabinetId, { quiet: true })
  } catch (e) {
    if (e instanceof Error && /not found/i.test(e.message)) {
      console.warn('[masterSlaveSync] cabinet missing (deleted after nesting), skipping:', cabinetId)
      return { written: 0, skipped: 0, noTouch: 0 }
    }
    throw e
  }

  // Every op on the cabinet: the master/joint sources to fire + the local ops the
  // collision test needs. Exclude existing slaves — they're regenerated below.
  const { data, error: selErr } = await supabase.from('part_operations')
    .select(OP_COLS)
    .eq('source_cabinet_id', cabinetId)
  if (selErr) { console.error('[masterSlaveSync] load ops', selErr); throw selErr }

  const ops = (data ?? []) as unknown as FireOpRow[]
  const { slaves, skipped, noTouch } = fireMasters(rp, ops, cabinetId)

  // Replace this cabinet's slave rows wholesale. Hand-added + seam-joint rows untouched.
  const { error: delErr } = await supabase.from('part_operations')
    .delete()
    .eq('source_cabinet_id', cabinetId)
    .contains('parameters', { generated: GENERATED_MARK })
  if (delErr) { console.error('[masterSlaveSync] delete', delErr); throw delErr }

  if (slaves.length) {
    const { error: insErr } = await supabase.from('part_operations').insert(slaves)
    if (insErr) { console.error('[masterSlaveSync] insert', insErr); throw insErr }
  }

  return { written: slaves.length, skipped, noTouch }
}

// Regenerate for many cabinets with bounded concurrency (mirrors seamDrillSync).
export async function syncMasterSlavesForCabinets(
  cabinetIds: string[],
  opts: { concurrency?: number } = {},
): Promise<MasterSlaveSyncResult> {
  const total: MasterSlaveSyncResult = { written: 0, skipped: 0, noTouch: 0 }
  const concurrency = Math.max(1, opts.concurrency ?? 6)
  let next = 0
  async function worker() {
    while (next < cabinetIds.length) {
      const id = cabinetIds[next++]
      try {
        const r = await syncMasterSlaves(id)
        total.written += r.written; total.skipped += r.skipped; total.noTouch += r.noTouch
      } catch (e) {
        console.error('[masterSlaveSync] cabinet failed, continuing:', id, e)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, cabinetIds.length) }, worker))
  return total
}
