// ── v0.4 schema types ─────────────────────────────────────────────────────────

export type AssemblyClass = 'base' | 'wall' | 'tall' | 'base_corner' | 'wall_corner' | 'tall_corner'
export type NeighbourType = 'cabinet' | 'end_panel' | 'wall' | 'freestanding'
export type TopType = 'full_top' | 'front_rail' | 'double_rail' | 'none'
export type ToeType = 'ladder' | 'leg' | 'none'
export type ProjectStatus = 'draft' | 'quoted' | 'approved' | 'in_production' | 'completed' | 'archived'

export interface Project {
  id: string
  name: string
  client_id: string | null
  client_name: string | null
  client_address: string | null
  status: ProjectStatus
  schema_version: string
  snapshot_locked: boolean
  system_snapshot: Record<string, unknown> | null
  construction_method_snapshot: Record<string, unknown> | null
  construction_method_id: string | null
  rule_overrides: Record<string, unknown>
  class_dimension_defaults: Record<string, unknown>
  hardware_overrides: Record<string, unknown>
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Room {
  id: string
  project_id: string
  name: string
  sort_order: number
  room_dx: number | null    // room width mm
  room_dy: number | null    // ceiling height mm
  room_dz: number | null    // room depth mm
  soffit_height: number | null
  wall_cabinet_top: number | null
  construction_method_id: string | null
  rule_overrides: Record<string, unknown>
  hardware_overrides: Record<string, unknown>
  notes: string | null
  created_at: string
  updated_at: string
}

export type WallType = 'standard' | 'island'

export interface Wall {
  id: string
  room_id: string
  name: string
  sort_order: number
  length: number            // mm
  height: number | null     // mm (inherits from room if null)
  angle: number             // degrees from east (0=right, 90=down in screen/SVG coords)
  pos_x: number             // room X of wall start mm
  pos_y: number             // room Y of wall start mm
  thickness: number         // wall thickness mm (default 90); 0 for island walls
  wall_type: WallType       // 'standard' | 'island'
  created_at: string
}

export interface CabinetInstance {
  id: string
  room_id: string
  wall_id: string | null
  cabinet_definition_id: string | null
  label: string | null
  assembly_class: AssemblyClass
  pos_x: number
  pos_y: number
  pos_z: number
  rotation: number
  dx: number
  dy: number
  dz: number
  has_carcass: boolean
  has_internal: boolean
  has_face: boolean
  has_toekick: boolean
  construction_method_id: string | null
  top_type: TopType | null
  toe_type: ToeType | null
  left_neighbour_type: NeighbourType | null
  right_neighbour_type: NeighbourType | null
  exposed_interior: boolean
  rule_overrides: Record<string, unknown>
  material_overrides: Record<string, unknown>
  toekick_overrides: Record<string, unknown>
  drawerbox_overrides: Record<string, unknown>
  hardware_overrides: Record<string, unknown>
  face_grid: Record<string, unknown> | null
  schema_version: string
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Material {
  id: string
  name: string
  brand: string | null
  finish: string | null
  dz: number
  sheet_dx: number
  sheet_dy: number
  has_grain: boolean
  grain_direction: 'horizontal' | 'vertical' | null
  cost_per_sheet: number | null
  active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ConstructionMethod {
  id: string
  name: string
  description: string | null
  assembly_class: AssemblyClass | null
  rules: Record<string, unknown>
  is_default: boolean
  active: boolean
  created_at: string
  updated_at: string
}

export interface CabinetDefinition {
  id: string
  name: string
  assembly_class: AssemblyClass
  construction_method_id: string | null
  default_dx: number
  default_dy: number
  default_dz: number
  has_carcass: boolean
  has_internal: boolean
  has_face: boolean
  has_toekick: boolean
  top_type: TopType
  toe_type: ToeType
  face_grid: Record<string, unknown>
  rule_overrides: Record<string, unknown>
  is_library_item: boolean
  active: boolean
  created_at: string
  updated_at: string
}

// ── Default dimensions by assembly class (mm) ─────────────────────────────────

export const DEFAULT_DIMS: Record<string, { dx: number; dy: number; dz: number }> = {
  base:        { dx: 600, dy: 900,  dz: 580 },
  wall:        { dx: 600, dy: 700,  dz: 350 },
  tall:        { dx: 600, dy: 2100, dz: 580 },
  base_corner: { dx: 900, dy: 900,  dz: 900 },
  wall_corner: { dx: 900, dy: 700,  dz: 900 },
  tall_corner: { dx: 900, dy: 2100, dz: 900 },
}
