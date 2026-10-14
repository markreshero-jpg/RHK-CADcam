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
import { caseFrame, zoneFrame, boxFrame, intFrame, projectToFrame, type FootprintFrame } from './partFootprint'
import { coalesceByKey } from './coalesce'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import { dbPartId } from '@/src/lib/cabinetShape/partKeys'

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
  plane_kind: string | null
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
// Exported for tests.
export function collectDrillRows(rp: ResolvedCabinet, cabinetId: string): { rows: GeneratedDrill[]; skipped: number } {
  const rows: GeneratedDrill[] = []
  let skipped = 0

  const caseByKey = new Map(rp.case_parts.map(p => [p.part_key, p]))
  const zoneByKey = new Map(rp.face_zones.map(z => [`${z.row_index}:${z.col_index}`, z]))
  const intByKey = new Map(rp.internal_parts.map(p => [`${p.part_type}_${p.sort_order}`, p]))

  const add = (
    sourceTable: string, sourcePartKey: string, frame: FootprintFrame | null | undefined,
    drill: { x: number; y: number; z: number; axis: string; radius: number; depthLen: number },
    kind: string, operationKey: string,
    tool: { router_tool_id: string | null; drill_id: string | null; auto_tool: boolean },
    // Which face of a front panel this bore drills into. Hinge cups & drawer-front
    // fixings machine on the BACK (interior) face, so the Part Editor shows them on
    // the back. Non-face parts (gables, box panels) pass null — front/back is
    // meaningless there and the editor's face toggle isn't shown for them.
    planeKind: string | null = null,
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
      plane_kind: planeKind,
      repeat_count: 1,
      output_to_cnc: true,
      ...tool,
      parameters: { generated: GENERATED_MARK, kind },
    })
  }

  // 1. Seam joints → case parts (carcase seams) or internal shelves/dividers
  //    (internal seams — targetPartKey already carries the int_… identity).
  for (const d of cabinetSeamDrills(rp)) {
    const tool = { router_tool_id: d.router_tool_id ?? null, drill_id: d.drill_id ?? null, auto_tool: d.auto_tool ?? false }
    if (d.targetPartKey.startsWith('int_')) {
      const ip = intByKey.get(d.targetPartKey.slice(4))
      add('internal_parts', d.targetPartKey, ip ? intFrame(ip) : null, d, 'joint', d.seamKey, tool)
    } else {
      const part = caseByKey.get(d.targetPartKey as never)
      add('case_parts', `case_${d.targetPartKey}`, part ? caseFrame(part) : null, d, 'joint', d.seamKey, tool)
    }
  }

  // 2. Hinges → cup holes on the door, plate holes on the mounting gable.
  for (const h of rp.hinge_instances) {
    // Facet / turned doors and angled-panel plates of shaped cabinets are not
    // machined yet (z_cabinet_shape Phase 3c) — their drills are zone-frame or off-axis.
    if (h.facet || h.turn || h.mount_angle_deg) continue
    const opKey = `hinge_${h.row_index}_${h.col_index}_${h.sort_order}`
    const zone = zoneByKey.get(`${h.row_index}:${h.col_index}`)
    for (const cd of h.cup_drills) {
      add('face_zones', `zone_${h.row_index}_${h.col_index}`, zone ? zoneFrame(zone) : null, cd, 'hinge_cup', opKey, AUTO_TOOL, 'face_back')
    }
    const mt = h.mount_target
    if (mt?.table === 'case_parts' && mt.part_key) {
      const cp = caseByKey.get(mt.part_key)
      for (const pd of h.plate_drills) {
        add('case_parts', `case_${mt.part_key}`, cp ? caseFrame(cp) : null, pd, 'hinge_plate', opKey, AUTO_TOOL)
      }
    } else if (mt?.table === 'internal_parts' && mt.internal_part_type != null && mt.internal_sort_order != null) {
      // Plate mounted on an internal divider (vertical) or shelf (horizontal).
      const ip = intByKey.get(`${mt.internal_part_type}_${mt.internal_sort_order}`)
      const partKey = `int_${mt.internal_part_type}_${mt.internal_sort_order}`   // matches normalize's key
      for (const pd of h.plate_drills) {
        add('internal_parts', partKey, ip ? intFrame(ip) : null, pd, 'hinge_plate', opKey, AUTO_TOOL)
      }
    } else {
      skipped += h.plate_drills.length
    }
  }

  // 3. Slides → cabinet member (gable), drawer front (face), and box panels.
  for (const stack of rp.drawer_stacks) {
    // Facet / turned drawers of shaped cabinets: not machined yet (z_cabinet_shape 3c).
    if (stack.facet || stack.turn) continue
    const opKey = `slide_${stack.face_zone_row}_${stack.face_zone_col}`
    const zone = zoneByKey.get(`${stack.face_zone_row}:${stack.face_zone_col}`)
    const boxByType = new Map(stack.box_parts.map(p => [p.part_type, p]))
    // Must match svgDbMeta / normalize's key (db_<row>_<col>_<part_type>) so generated
    // slide drills land on the same part identity the nest/editor use.
    const dboxKey = (t: string) => dbPartId(stack, t)

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
            add('face_zones', `zone_${stack.face_zone_row}_${stack.face_zone_col}`, zone ? zoneFrame(zone) : null, sd, 'slide', opKey, AUTO_TOOL, 'face_back')
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

  // 4. Handles → through-holes on the door / drawer front, drilled from the
  //    back face like the hinge cups (z_handles H2, D8). Facet fronts of shaped
  //    cabinets are skipped like their hinges.
  for (const z of rp.face_zones) {
    const h = z.handle
    if (!h || !h.holes?.length || z.facet || z.AY) continue
    const opKey = `handle_${z.row_index}_${z.col_index}`
    for (const p of h.holes) {
      add('face_zones', `zone_${z.row_index}_${z.col_index}`, zoneFrame(z),
        { x: z.X + p.x, y: z.Y + p.y, z: z.Z, axis: 'z+', radius: h.hole_dia / 2, depthLen: z.DZ },
        'handle', opKey, AUTO_TOOL, 'face_back')
    }
  }

  // 5. Finger-pull backing rails (z_handles H6): a knock-in block hole into
  //    each side's inner face, RAILBLK behind the back of the rail, centred on
  //    the rail's height.
  for (const rail of rp.case_parts) {
    if (!rail.part_key.startsWith('fprail:') || !rail.fprail) continue
    const m = rail.fprail
    const y = rail.Y + rail.DX / 2
    const z = rail.Z - m.blockSetback
    for (const key of ['left_side', 'right_side'] as const) {
      const side = caseByKey.get(key)
      if (!side) { skipped++; continue }
      const inner = key === 'left_side' ? { x: side.X + side.DZ, axis: 'x-' } : { x: side.X, axis: 'x+' }
      add('case_parts', `case_${key}`, caseFrame(side),
        { x: inner.x, y, z, axis: inner.axis, radius: m.blockDia / 2, depthLen: m.blockDepth },
        'fprail_block', `fprail_block_${rail.part_key.slice(7)}`, AUTO_TOOL)
    }
  }

  return { rows, skipped }
}

// ── Finger-rail notches (z_handles H6) ───────────────────────────────────────
// Each rail sits in a notch cut right through both sides at the front edge,
// the rail thickness deep and the rail's height (user, 2026-10-14):
//   • a generated through pocket for the notch, run NOTCH_OVERRUN past the
//     front edge — and past the side's top / bottom where the notch runs out
//     there — so the cutter leaves those mouths square (the overrun is inside
//     the nest gap, which the profile cut clears anyway)
//   • at each CLOSED end, a relief slot one cutter wide (2 × RAILCUT) running
//     RAILCUT deeper than the rail: the round cutter's corner lands behind the
//     rail, so the rail's back corners seat square
const NOTCH_OVERRUN = 5
const NOTCH_TOOL_DIA = 10

interface GeneratedRoute {
  source_table: 'case_parts'
  source_cabinet_id: string
  source_part_key: string
  operation_type: 'route' | 'groove'
  operation_action: 'pocket' | null
  operation_key: string
  pos_x: number; pos_y: number
  size_dx: number | null; size_dy: number | null
  length: number | null; width: number | null
  depth: number
  output_face: string
  output_to_cnc: boolean
  router_tool_id: string
  parameters: Record<string, unknown>
}

// Exported for tests.
export function collectNotchRoutes(rp: ResolvedCabinet, cabinetId: string, toolId: string | null): { rows: GeneratedRoute[]; skipped: number } {
  const rows: GeneratedRoute[] = []
  let skipped = 0
  const rails = rp.case_parts.filter(p => p.part_key.startsWith('fprail:') && p.fprail)
  if (!rails.length) return { rows, skipped }
  const EPS = 0.01
  for (const key of ['left_side', 'right_side'] as const) {
    const side = rp.case_parts.find(p => p.part_key === key)
    if (!side) { skipped += rails.length; continue }
    for (const rail of rails) {
      if (!toolId) { skipped++; continue }
      const n = rail.part_key.slice(7)
      const cut = rail.fprail!.cut
      const base = {
        source_table: 'case_parts' as const, source_cabinet_id: cabinetId, source_part_key: `case_${key}`,
        depth: round(side.DZ + 0.2),          // right through, with the usual through-hole overshoot
        output_face: key === 'left_side' ? 'left' : 'right',
        output_to_cnc: true, router_tool_id: toolId,
        parameters: { generated: GENERATED_MARK, kind: 'fprail_notch' },
      }
      // Side footprint (caseFrame): u = depth from the side's back (side.Z), v = height.
      const front = rail.Z + rail.DZ - side.Z
      const back = front - rail.DZ
      const bot = rail.Y - side.Y, top = bot + rail.DX
      const openBot = bot <= EPS, openTop = top >= side.DY - EPS
      const u0 = back, u1 = front + NOTCH_OVERRUN
      const v0 = openBot ? bot - NOTCH_OVERRUN : bot, v1 = openTop ? top + NOTCH_OVERRUN : top
      rows.push({
        ...base, operation_type: 'route', operation_action: 'pocket', operation_key: `fprail_notch_${n}`,
        pos_x: round((u0 + u1) / 2), pos_y: round((v0 + v1) / 2),
        size_dx: round(u1 - u0), size_dy: round(v1 - v0), length: null, width: null,
      })
      // Closed-end reliefs: a slot centred one cutter radius in from the end,
      // starting at the rail's back face (the slot's round end reaches `cut`
      // deeper) and running out past the front edge.
      if (cut > 0 && top - bot > 4 * cut) {
        const ends = [...(openTop ? [] : [top - cut]), ...(openBot ? [] : [bot + cut])]
        ends.forEach((v, i) => rows.push({
          ...base, operation_type: 'groove', operation_action: null, operation_key: `fprail_relief_${n}_${i}`,
          pos_x: round(back), pos_y: round(v), size_dx: null, size_dy: null,
          length: round(u1 - back), width: round(2 * cut),
        }))
      }
    }
  }
  return { rows, skipped }
}

// The notch cutter: the active 10mm router bit with the lowest tool number.
async function notchToolId(): Promise<string | null> {
  const { data } = await supabase.from('cnc_tools').select('id,tool_number,diameter').eq('active', true)
  const tools = ((data ?? []) as { id: string; tool_number: string | null; diameter: number | string | null }[])
    .filter(t => Number(t.diameter) === NOTCH_TOOL_DIA)
    .sort((a, b) => String(a.tool_number ?? '').localeCompare(String(b.tool_number ?? ''), undefined, { numeric: true }))
  return tools[0]?.id ?? null
}

export interface SeamDrillSyncResult { written: number; skipped: number }

// Coalesce concurrent syncs for the SAME cabinet onto one in-flight promise. The
// delete+insert below is not atomic, so two overlapping runs (StrictMode double
// mount, manual regen racing an optimise pass) would each delete then each insert,
// doubling every generated hole. See coalesce.ts.
const inFlight = new Map<string, Promise<SeamDrillSyncResult>>()

// Regenerate ALL resolver-computed drilling rows for ONE cabinet.
export function syncSeamDrillOperations(cabinetId: string): Promise<SeamDrillSyncResult> {
  return coalesceByKey(inFlight, cabinetId, () => runSeamDrillSync(cabinetId))
}

async function runSeamDrillSync(cabinetId: string): Promise<SeamDrillSyncResult> {
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

  // Generated routes + grooves (finger-rail notches + reliefs) — same wholesale replace.
  const hasRails = rp.case_parts.some(p => p.part_key.startsWith('fprail:'))
  const notch = collectNotchRoutes(rp, cabinetId, hasRails ? await notchToolId() : null)
  const { error: delRErr } = await supabase.from('part_operations')
    .delete()
    .eq('source_cabinet_id', cabinetId)
    .in('operation_type', ['route', 'groove'])
    .contains('parameters', { generated: GENERATED_MARK })
  if (delRErr) { console.error('[seamDrillSync] delete routes', delRErr); throw delRErr }
  if (notch.rows.length) {
    const { error: insRErr } = await supabase.from('part_operations').insert(notch.rows)
    if (insRErr) { console.error('[seamDrillSync] insert routes', insRErr); throw insRErr }
  }
  if (hasRails && notch.skipped) console.warn(`[seamDrillSync] ${notch.skipped} finger-rail notch(es) skipped — no active ${NOTCH_TOOL_DIA}mm router bit`)

  return { written: rows.length + notch.rows.length, skipped: skipped + notch.skipped }
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
