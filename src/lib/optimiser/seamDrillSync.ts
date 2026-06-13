// ============================================================
// Resolver → drills bridge.
// Materialises every machine-drilled hole the resolver computes —
// carcase seam joints, hinge cup/plate holes, and slide-imposed
// holes — into part_operations rows, so the optimiser's existing
// pipeline (buildSheetDrills → generateSheetGcode) drills them with
// no further changes. One generated row per hole.
//
// Generated rows are tagged parameters.generated = 'seam_joint'
// (kept for backward-compatible cleanup) plus a `kind` for clarity,
// and are deleted/re-inserted on every sync, so hand-added rows from
// CabinetRoutesPanel are never touched.
// ============================================================

import { supabase } from '@/src/lib/supabase'
import { resolveCabinetFromDB } from '@/src/lib/resolver/resolveCabinetFromDB'
import { cabinetSeamDrills } from '@/src/lib/jointDrilling'
import { caseFrame, zoneFrame, boxFrame, projectToFrame, type FootprintFrame } from './partFootprint'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'

const GENERATED_MARK = 'seam_joint'

interface GeneratedDrill {
  source_table: string
  source_cabinet_id: string
  source_part_key: string
  operation_type: 'drill'
  operation_key: string
  pos_x: number
  pos_y: number
  diameter: number
  depth: number
  output_face: string
  repeat_count: number
  output_to_cnc: boolean
  router_tool_id: string | null
  drill_id: string | null
  auto_tool: boolean
  parameters: Record<string, unknown>
}

// Hardware holes (hinge/slide) carry no tool assignment from the resolver, so
// they auto-select a bit by diameter at G-code time.
const AUTO_TOOL = { router_tool_id: null as string | null, drill_id: null as string | null, auto_tool: true }

const round = (n: number) => Math.round(n * 100) / 100

// Collect every resolver-computed hole, projected onto its target part's flat
// footprint and keyed so the optimiser's buildSheetDrills can find it.
function collectDrillRows(rp: ResolvedCabinet, cabinetId: string): { rows: GeneratedDrill[]; skipped: number } {
  const rows: GeneratedDrill[] = []
  let skipped = 0

  const caseByKey = new Map(rp.case_parts.map(p => [p.part_key, p]))
  const zoneByKey = new Map(rp.face_zones.map(z => [`${z.row_index}:${z.col_index}`, z]))

  const add = (
    sourceTable: string, sourcePartKey: string, frame: FootprintFrame | null | undefined,
    drill: { x: number; y: number; z: number; axis: string; radius: number; depthLen: number },
    kind: string, operationKey: string,
    tool: { router_tool_id: string | null; drill_id: string | null; auto_tool: boolean },
  ) => {
    if (!frame) { skipped++; return }
    const proj = projectToFrame(drill, frame)
    if (!proj) { skipped++; return }
    rows.push({
      source_table: sourceTable,
      source_cabinet_id: cabinetId,
      source_part_key: sourcePartKey,
      operation_type: 'drill',
      operation_key: operationKey,
      pos_x: round(proj.pos_x),
      pos_y: round(proj.pos_y),
      diameter: round(drill.radius * 2),
      depth: round(drill.depthLen),
      output_face: proj.output_face,
      repeat_count: 1,
      output_to_cnc: true,
      ...tool,
      parameters: { generated: GENERATED_MARK, kind },
    })
  }

  // 1. Carcase seam joints → case parts.
  for (const d of cabinetSeamDrills(rp)) {
    const part = caseByKey.get(d.targetPartKey as never)
    add('case_parts', `case_${d.targetPartKey}`, part ? caseFrame(part) : null, d, 'joint', d.seamKey,
      { router_tool_id: d.router_tool_id ?? null, drill_id: d.drill_id ?? null, auto_tool: d.auto_tool ?? false })
  }

  // 2. Hinges → cup holes on the door, plate holes on the mounting gable.
  for (const h of rp.hinge_instances) {
    const opKey = `hinge_${h.row_index}_${h.col_index}_${h.sort_order}`
    const zone = zoneByKey.get(`${h.row_index}:${h.col_index}`)
    for (const cd of h.cup_drills) {
      add('face_zones', `zone_${h.row_index}_${h.col_index}`, zone ? zoneFrame(zone) : null, cd, 'hinge_cup', opKey, AUTO_TOOL)
    }
    const mt = h.mount_target
    if (mt?.table === 'case_parts' && mt.part_key) {
      const cp = caseByKey.get(mt.part_key)
      for (const pd of h.plate_drills) {
        add('case_parts', `case_${mt.part_key}`, cp ? caseFrame(cp) : null, pd, 'hinge_plate', opKey, AUTO_TOOL)
      }
    } else {
      // Internal-shelf-mounted plates not bridged yet.
      skipped += h.plate_drills.length
    }
  }

  // 3. Slides → cabinet member (gable), drawer front (face), and box panels.
  for (const stack of rp.drawer_stacks) {
    const opKey = `slide_${stack.face_zone_row}_${stack.face_zone_col}`
    const zone = zoneByKey.get(`${stack.face_zone_row}:${stack.face_zone_col}`)
    const boxByType = new Map(stack.box_parts.map(p => [p.part_type, p]))
    const dboxKey = (t: string) => `dbox_${stack.face_zone_row}_${stack.face_zone_col}_${t}`

    for (const sl of stack.slides) {
      for (const sd of sl.drills) {
        if (sd.machine_operation !== 'drill') { skipped++; continue }
        switch (sd.surface) {
          case 'cabinet_member': {
            const key = sd.side === 'left' ? 'left_side' : 'right_side'
            const cp = caseByKey.get(key)
            add('case_parts', `case_${key}`, cp ? caseFrame(cp) : null, sd, 'slide', opKey, AUTO_TOOL)
            break
          }
          case 'drawer_front':
            add('face_zones', `zone_${stack.face_zone_row}_${stack.face_zone_col}`, zone ? zoneFrame(zone) : null, sd, 'slide', opKey, AUTO_TOOL)
            break
          case 'drawer_side': {
            const t = sd.side === 'left' ? 'db_left_side' : 'db_right_side'
            const bp = boxByType.get(t)
            add('drawer_box_parts', dboxKey(t), bp ? boxFrame(bp) : null, sd, 'slide', opKey, AUTO_TOOL)
            break
          }
          case 'drawer_bottom': {
            const bp = boxByType.get('db_bottom')
            add('drawer_box_parts', dboxKey('db_bottom'), bp ? boxFrame(bp) : null, sd, 'slide', opKey, AUTO_TOOL)
            break
          }
          case 'drawer_back': {
            const bp = boxByType.get('db_back')
            add('drawer_box_parts', dboxKey('db_back'), bp ? boxFrame(bp) : null, sd, 'slide', opKey, AUTO_TOOL)
            break
          }
          default:
            skipped++
        }
      }
    }
  }

  return { rows, skipped }
}

export interface SeamDrillSyncResult { written: number; skipped: number }

// Regenerate ALL resolver-computed drilling rows for ONE cabinet.
export async function syncSeamDrillOperations(cabinetId: string): Promise<SeamDrillSyncResult> {
  // Quiet: a project may contain a half-built cabinet; its resolver errors must
  // not surface as a hard error while we generate drilling for the whole nest.
  let rp: ResolvedCabinet
  try {
    rp = await resolveCabinetFromDB(cabinetId, { quiet: true })
  } catch (e) {
    // The cabinet was deleted after this nest was built. Its parts keep whatever
    // part_operations they already have — there are no live joints to regenerate.
    // Expected/recoverable, so skip it quietly (a warning, not an error, so the
    // dev overlay doesn't trip). Re-throw anything that isn't a missing cabinet.
    if (e instanceof Error && /not found/i.test(e.message)) {
      console.warn('[seamDrillSync] cabinet missing (deleted after nesting), skipping:', cabinetId)
      return { written: 0, skipped: 0 }
    }
    throw e
  }
  const { rows, skipped } = collectDrillRows(rp, cabinetId)

  // Replace this cabinet's generated drill rows wholesale. Hand-added rows
  // (no parameters.generated marker) are left untouched.
  const { error: delErr } = await supabase.from('part_operations')
    .delete()
    .eq('source_cabinet_id', cabinetId)
    .eq('operation_type', 'drill')
    .contains('parameters', { generated: GENERATED_MARK })
  if (delErr) { console.error('[seamDrillSync] delete', delErr); throw delErr }

  if (rows.length) {
    const { error: insErr } = await supabase.from('part_operations').insert(rows)
    if (insErr) { console.error('[seamDrillSync] insert', insErr); throw insErr }
  }

  return { written: rows.length, skipped }
}

// Regenerate for many cabinets (e.g. every cabinet in a nest), with bounded
// concurrency so a project of 20+ cabinets doesn't take a minute. The resolver
// caches are keyed by cabinetId, so concurrent distinct cabinets don't collide.
export async function syncSeamDrillOperationsForCabinets(
  cabinetIds: string[],
  opts: { concurrency?: number } = {},
): Promise<SeamDrillSyncResult> {
  const total: SeamDrillSyncResult = { written: 0, skipped: 0 }
  const concurrency = Math.max(1, opts.concurrency ?? 6)
  let next = 0
  async function worker() {
    while (next < cabinetIds.length) {
      const id = cabinetIds[next++]
      try {
        const r = await syncSeamDrillOperations(id)
        total.written += r.written
        total.skipped += r.skipped
      } catch (e) {
        console.error('[seamDrillSync] cabinet failed, continuing:', id, e)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, cabinetIds.length) }, worker))
  return total
}
