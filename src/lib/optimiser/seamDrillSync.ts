// ============================================================
// Joint-ops → drills bridge.
// Materialises a cabinet's resolved seam-joint drilling into
// part_operations rows so the optimiser's existing pipeline
// (buildSheetDrills → generateSheetGcode) drills them with no
// further changes. One generated row per hole.
//
// Generated rows are tagged parameters.generated = 'seam_joint'
// and deleted/re-inserted on every sync, so hand-added rows from
// CabinetRoutesPanel are never touched.
// ============================================================

import { supabase } from '@/src/lib/supabase'
import { resolveCabinetFromDB } from '@/src/lib/resolver/resolveCabinetFromDB'
import { cabinetSeamDrills, caseBox } from '@/src/lib/jointDrilling'
import type { ResolvedCasePart } from '@/src/lib/resolver/types'

const GENERATED_MARK = 'seam_joint'

type Axis = 'x' | 'y' | 'z'
// For each flat-nestable case part: which cabinet axis is the panel's
// face-normal (the only direction we can drill on a flat sheet) and which
// two axes form the DX×DY footprint the nester lays the part out in.
//   pos_x runs along the part's DX (the `u` axis), pos_y along DY (`v`).
// Derived directly from caseBox() so it stays consistent with the geometry
// that produced the holes.
interface FaceMap { normal: Axis; u: Axis; v: Axis }
function faceMapFor(partKey: string): FaceMap | null {
  switch (partKey) {
    case 'left_side':
    case 'right_side': return { normal: 'x', u: 'z', v: 'y' }   // footprint = depth × height
    case 'back':       return { normal: 'z', u: 'y', v: 'x' }   // footprint = height × width
    case 'bottom':
    case 'full_top':
    case 'front_rail':
    case 'back_rail':  return { normal: 'y', u: 'z', v: 'x' }   // footprint = depth × width
    default:           return null                              // not a flat-nest CNC face
  }
}

interface GeneratedDrill {
  source_table: 'case_parts'
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

// Project one cabinet-space seam drill onto its target part's flat footprint.
// Returns null for edge/dowel holes (axis not along the panel's face-normal) —
// those aren't drillable on the flat nest and are deferred to edge machining.
export function projectToFootprint(
  drill: { x: number; y: number; z: number; axis: string },
  part: ResolvedCasePart,
): { pos_x: number; pos_y: number; output_face: string } | null {
  const fm = faceMapFor(part.part_key)
  if (!fm) return null
  if ((drill.axis[0] as Axis) !== fm.normal) return null   // not a face-normal bore

  const cb = caseBox(part)                                  // cabinet-space AABB: min corner + extents
  const coord = (axis: Axis) => (axis === 'x' ? drill.x : axis === 'y' ? drill.y : drill.z)
  const origin = (axis: Axis) => (axis === 'x' ? cb.x : axis === 'y' ? cb.y : cb.z)

  // Face-flip / mirror. Each panel is machined with its hole-bearing (interior)
  // face up. The raw projection is read from the +normal viewpoint, so a bore
  // that ENTERS the −normal face (axis sign '+') is on the opposite face — turning
  // the panel over to present it mirrors the u/DX axis (pos_x → DX − pos_x). This
  // also makes mirror-twin parts (left vs right side) come out as proper mirror
  // images in the nest instead of identical coordinates.
  const entersNegativeFace = drill.axis[1] === '+'
  let pos_x = coord(fm.u) - origin(fm.u)
  if (entersNegativeFace) pos_x = part.DX - pos_x

  return {
    pos_x,
    pos_y: coord(fm.v) - origin(fm.v),
    output_face: FACE_FOR_AXIS[drill.axis] ?? 'top',        // which face the bore enters
  }
}

// Cabinet axes → part_operations.output_face vocabulary (+X=right, +Y=top, +Z=front).
const FACE_FOR_AXIS: Record<string, string> = {
  'x+': 'right', 'x-': 'left',
  'y+': 'top',   'y-': 'bottom',
  'z+': 'front', 'z-': 'back',
}

export interface SeamDrillSyncResult { written: number; skipped: number }

// Regenerate the seam-joint drilling rows for ONE cabinet.
export async function syncSeamDrillOperations(cabinetId: string): Promise<SeamDrillSyncResult> {
  // Quiet: a project may contain a half-built cabinet; its resolver errors must
  // not surface as a hard error while we generate drilling for the whole nest.
  const rp = await resolveCabinetFromDB(cabinetId, { quiet: true })
  const partByKey = new Map<string, ResolvedCasePart>(rp.case_parts.map(p => [p.part_key, p]))

  const rows: GeneratedDrill[] = []
  let skipped = 0
  for (const d of cabinetSeamDrills(rp)) {
    const part = partByKey.get(d.targetPartKey)
    if (!part) { skipped++; continue }
    const proj = projectToFootprint(d, part)
    if (!proj) { skipped++; continue }
    rows.push({
      source_table: 'case_parts',
      source_cabinet_id: cabinetId,
      source_part_key: `case_${d.targetPartKey}`,           // matches normalize.ts / svgCaseMeta
      operation_type: 'drill',
      operation_key: d.seamKey,
      pos_x: round(proj.pos_x),
      pos_y: round(proj.pos_y),
      diameter: round(d.radius * 2),
      depth: round(d.depthLen),
      output_face: proj.output_face,
      repeat_count: 1,                                       // cabinetSeamDrills already expands qty/spacing
      output_to_cnc: true,
      router_tool_id: d.router_tool_id ?? null,
      drill_id: d.drill_id ?? null,
      auto_tool: d.auto_tool ?? false,
      parameters: { generated: GENERATED_MARK, seam_key: d.seamKey },
    })
  }

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

// Regenerate for many cabinets (e.g. every cabinet in a nest). Sequential to
// keep the resolver caches coherent and avoid hammering the DB.
export async function syncSeamDrillOperationsForCabinets(cabinetIds: string[]): Promise<SeamDrillSyncResult> {
  const total: SeamDrillSyncResult = { written: 0, skipped: 0 }
  for (const id of cabinetIds) {
    try {
      const r = await syncSeamDrillOperations(id)
      total.written += r.written
      total.skipped += r.skipped
    } catch (e) {
      console.error('[seamDrillSync] cabinet failed, continuing:', id, e)
    }
  }
  return total
}

const round = (n: number) => Math.round(n * 100) / 100
