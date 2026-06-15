// ============================================================
// Panel Optimiser — shared types.
// The optimiser is a TEMPORARY workspace: parts are read as a
// snapshot at load time and never written back to job tables
// (spec §5.2). These types describe that snapshot + the nesting
// working set.
// ============================================================

export type SourceTable = 'case_parts' | 'internal_parts' | 'toekick_parts' | 'face_zones' | 'drawer_box_parts' | 'custom_parts'

// One physical panel instance pulled from a part table at load time.
export interface OptiPart {
  uid: string                 // stable within this workspace (source-row id based)
  source_table: SourceTable
  source_part_id: string      // the part row id (snapshot — may be regenerated later)
  source_part_key: string     // synthetic resolver key (case_left_side, int_divider_0…) — matches part_operations
  cabinet_instance_id: string
  cabinet_label: string
  room_id: string
  room_name: string
  project_id: string
  job_number: string | null   // job/label prefix for batch runs
  label: string
  w: number                   // footprint width (mm) = dx
  h: number                   // footprint height (mm) = dy
  thickness: number           // dz (mm)
  material_id: string | null
  grain_direction: string | null
  nest_priority: number
  output_to_cnc: boolean
  comment: string | null      // from cabinet_instances.part_comments[part_key]
}

export interface OptiMaterial {
  id: string
  name: string
  dz: number
  sheet_dx: number | null
  sheet_dy: number | null
  has_grain: boolean
  grain_direction: string | null
  trim_top: number | null
  trim_bottom: number | null
  trim_left: number | null
  trim_right: number | null
  pad: number | null
  cnc_tool_id: string | null   // routing tool used for this material (FK cnc_tools.id)
  feed_rate_pct: number | null // material-level feed override (% of tool base feed)
}

export interface OptiMachine {
  id: string
  name: string
  brand: string | null
  model: string | null
  table_dx: number | null
  table_dy: number | null
  gcode_dialect: string | null
  is_default: boolean
}

export interface OptiProfile {
  id: string
  cnc_machine_id: string
  name: string
  is_default: boolean
  nest_pad: number | null          // user pad added to the nesting margin
  tool_entry_offset: number | null // ramp approach offset; also reserved in the margin
  margin_use_tool_dia: boolean | null     // include routing tool Ø in the margin
  margin_use_entry_offset: boolean | null // include the approach offset in the margin
}

export interface OptiTool {
  id: string
  diameter: number | null
}

export interface OptiRoom { id: string; name: string }
export interface OptiCabinet { id: string; label: string; room_id: string }

// Everything the server hands the client at load.
export interface OptiSnapshot {
  projectId: string
  projectName: string
  jobNumber: string | null
  rooms: OptiRoom[]
  cabinets: OptiCabinet[]
  parts: OptiPart[]
  materials: OptiMaterial[]
  machines: OptiMachine[]
  profiles: OptiProfile[]
  tools: OptiTool[]
  allProjects: { id: string; name: string; job_number: string | null }[]
}

// Per-material nesting margin (gap between parts) = routing tool diameter
// + nest pad + tool-entry offset. Pad/offset come from the selected machine
// profile; tool diameter from the material's assigned routing tool. Nulls fall
// back to a small default so parts never end up touching when unconfigured.
export function buildMargins(
  snapshot: { materials: OptiMaterial[]; profiles: OptiProfile[]; tools: OptiTool[] },
  profileId: string | null,
): { byMaterial: Record<string, number>; fallback: number } {
  const prof = profileId ? snapshot.profiles.find(p => p.id === profileId) : null
  const useDia = prof?.margin_use_tool_dia !== false        // default on
  const useOffset = prof?.margin_use_entry_offset !== false  // default on
  const pad = prof?.nest_pad ?? 2
  const offset = useOffset ? (prof?.tool_entry_offset ?? 2) : 0
  const base = pad + offset                                  // everything except the (per-material) tool Ø
  const diaByTool = new Map(snapshot.tools.map(t => [t.id, t.diameter ?? 0]))
  const byMaterial: Record<string, number> = {}
  for (const m of snapshot.materials) {
    const dia = useDia && m.cnc_tool_id ? (diaByTool.get(m.cnc_tool_id) ?? 0) : 0
    byMaterial[m.id] = dia + base
  }
  return { byMaterial, fallback: base }
}

// Material+thickness grouping key used throughout nesting.
export function materialGroupKey(materialId: string | null, thickness: number): string {
  return `${materialId ?? 'none'}__${thickness}`
}
