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
  job_number: string | null
  notes: string | null
  // Schedule assignments (null = use shop default)
  assembly_schedule_id:        string | null
  base_assembly_schedule_id:   string | null
  wall_assembly_schedule_id:   string | null
  tall_assembly_schedule_id:   string | null
  toekick_schedule_id:         string | null
  front_schedule_id:           string | null
  drawerbox_schedule_id:       string | null
  inner_drawerbox_schedule_id: string | null
  hinge_schedule_id:           string | null
  slide_schedule_id:           string | null
  handle_schedule_id:          string | null
  benchtop_schedule_id:        string | null
  benchtop_build_method_id:    string | null
  construction_schedule_id:    string | null
  drawer_box_method_id:        string | null
  inner_drawer_box_method_id:  string | null
  default_door_style_id:       string | null   // job-level default (parent) door style
  // Per assembly-class door style override (door_styles id).
  // null = inherit default_door_style_id.
  base_door_style_id:          string | null
  wall_door_style_id:          string | null
  tall_door_style_id:          string | null
  // Per assembly-class door colour override (door_schedule_materials id).
  // null = use the (effective) door style's default colour.
  base_door_colour_id:         string | null
  wall_door_colour_id:         string | null
  tall_door_colour_id:         string | null
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
  wall_dy: number | null    // default wall height mm — inherited by new walls (null = not set)
  wall_dz: number | null    // default wall thickness mm — inherited by new walls (null = not set)
  // Per-class cabinet Height(dy)/Depth(dz) defaults { base|wall|tall: {dy,dz} }.
  // Highest cascade level; missing class/axis inherits the job. {} = inherit all.
  class_dimension_defaults: Record<string, unknown>
  soffit_height: number | null
  wall_cabinet_top: number | null
  construction_method_id: string | null
  rule_overrides: Record<string, unknown>
  hardware_overrides: Record<string, unknown>
  notes: string | null
  // Schedule assignments (null = inherit from job/shop default)
  assembly_schedule_id:        string | null
  toekick_schedule_id:         string | null
  front_schedule_id:           string | null
  drawerbox_schedule_id:       string | null
  inner_drawerbox_schedule_id: string | null
  hinge_schedule_id:           string | null
  slide_schedule_id:           string | null
  handle_schedule_id:          string | null
  benchtop_schedule_id:        string | null
  benchtop_build_method_id:    string | null
  construction_schedule_id:    string | null
  inner_drawer_box_method_id:  string | null
  door_style_override_id:      string | null   // room-level default door style (overrides the job)
  // Per assembly-class room overrides (null = inherit room default → job).
  base_door_style_id?:         string | null
  wall_door_style_id?:         string | null
  tall_door_style_id?:         string | null
  base_door_colour_id?:        string | null
  wall_door_colour_id?:        string | null
  tall_door_colour_id?:        string | null
  /** CAD annotations (z_CAD_tool): the canvas previews paper-mm sizes at 1:this. */
  annotation_scale?:           number
  created_at: string
  updated_at: string
}

// ── Construction method schedules ─────────────────────────────────────────────

export interface ConstructionMethodSchedule {
  id:          string
  name:        string
  description: string | null
  is_default:  boolean
  created_at:  string
  updated_at:  string
}

export interface ConstructionMethodScheduleRow {
  id:             string
  schedule_id:    string
  assembly_class: 'base' | 'wall' | 'tall'
  rules:          Record<string, unknown>
}

export type WallType = 'standard' | 'island'

export interface Wall {
  id: string
  room_id: string
  name: string
  sort_order: number
  length: number            // mm
  height: number | null       // mm (inherits from room if null)
  soffit_height: number | null  // mm; overrides room.soffit_height for wall cabinet top on this wall
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
  internal_grid: Record<string, unknown> | null
  carcase_joints: Record<string, import('./resolver/types').SeamJointAssign>
  no_cnc?: boolean
  // Joined toe-kick run this cabinet belongs to (null = standalone kick). Member
  // cabinets drop their own kick; the run's kick is owned by a synthetic kick
  // assembly (is_kick_assembly = true). See z_kick_join/.
  kick_run_id?: string | null
  is_kick_assembly?: boolean
  // Shaped-cabinet plan outline + edge roles; null/absent = plain rectangle.
  // See z_cabinet_shape/CABINET-SHAPE-SPEC.md.
  footprint?: import('./cabinetShape/footprint').Footprint | null
  // Face grids for the non-primary front facets of a shaped cabinet, keyed by
  // footprint edge id (the primary facet uses face_grid).
  faces?: Record<string, Record<string, unknown>> | null
  // Bulkhead settings (z_bulkhead); non-null = this cabinet is a bulkhead.
  bulkhead?: import('./bulkhead').BulkheadSettings | null
  // Per-view part hiding (z_display_layers/PART-HIDE-SPEC.md).
  part_hide_views?: import('./resolver/types').PartHideViews
  // Part ids not sent to the optimiser / CNC (custom parts use their own no_cnc).
  part_no_cnc?: string[]
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
  category_id: string | null
  subcategory_id: string | null
  construction_method_id: string | null
  default_dx: number
  default_dy: number
  default_dz: number
  // When true, the frozen default_d* wins over the placement cascade for that axis
  // (room → job → shop → system). False → the axis cascades. Width has no cascade
  // source yet, so default_dx is used regardless of preserve_dx.
  preserve_dx: boolean
  preserve_dy: boolean
  preserve_dz: boolean
  has_carcass: boolean
  has_internal: boolean
  has_face: boolean
  has_toekick: boolean
  top_type: TopType
  toe_type: ToeType
  // Frozen geometry / composition
  face_grid: Record<string, unknown> | null
  internal_grid: Record<string, unknown> | null
  carcase_joints: Record<string, import('./resolver/types').SeamJointAssign>
  rule_overrides: Record<string, unknown>
  // Preservation targets — assembly-level overrides copied into the instance at placement
  material_overrides: Record<string, unknown>
  hardware_overrides: Record<string, unknown>
  toekick_overrides: Record<string, unknown>
  drawerbox_overrides: Record<string, unknown>
  exposed_interior: boolean
  no_cnc?: boolean
  // Snapshot of the assembly's custom parts (copy-not-link); re-inserted at placement.
  custom_parts?: Record<string, unknown>[]
  // Shaped-cabinet footprint + facet face grids, copied to the instance at placement.
  footprint?: import('./cabinetShape/footprint').Footprint | null
  faces?: Record<string, Record<string, unknown>> | null
  // Bulkhead defaults (z_bulkhead), copied to the instance at placement.
  bulkhead?: import('./bulkhead').BulkheadSettings | null
  // Per-view part hides, copied to the instance at placement (PART-HIDE-SPEC).
  part_hide_views?: import('./resolver/types').PartHideViews
  // Per-part No CNC list, copied to the instance at placement.
  part_no_cnc?: string[]
  // Default contents (z_ubo U4): fixtures spawned linked to the new cabinet at placement.
  contents?: import('./cabinetContents').ContentItem[]
  // Hand-drawn part ops + part comments / labels (z_wot K0). Custom parts are
  // keyed `custom_@<index in custom_parts>` — see src/lib/libraryPartData.ts.
  part_operations?: Record<string, unknown>[]
  part_comments?: Record<string, string>
  part_labels?: Record<string, string>
  // Kit (z_wot K3): other library cabinets dropped with this one from one pick.
  kit?: import('./cabinetKit').CabinetKit | null
  // UI metadata
  description: string | null
  thumbnail_svg: string | null
  sort_order: number
  is_library_item: boolean
  active: boolean
  created_at: string
  updated_at: string
}

// ── Benchtop instance ─────────────────────────────────────────────────────────

export interface BenchtopEdgeTag {
  edge_index: number
  type: 'exposed' | 'wall'
}

export interface BenchtopJoinPoint {
  vertex_index: number
  join_type: BenchtopJoinType
}

export interface BenchtopArcSegment {
  edge_index: number
  cpx: number
  cpy: number
}

// Per-edge finish (Phase 3). No profile_id on an exposed edge = the build
// method's default profile. Wall edges never carry a profile (P-d).
export interface BenchtopEdge {
  wall?: boolean
  profile_id?: string | null
  /** Waterfall edges only: how the leg meets the top. Default 'mitre'. */
  waterfall_join?: BenchtopJoinType
  /** Edge tape (Phase 7): undefined = the schedule's tape, null = none, id = that tape. */
  edgeband_id?: string | null
  /** Joint with another benchtop here (Phase 7c): not exposed — no profile / tape; the resolver treats it as a join edge. */
  joint?: BenchtopJoinType
}

// One outline segment — Shape Editor format, mm, room frame (plan, y-down).
export interface BenchtopSegment {
  type: 'line' | 'arc' | 'curve'
  p0: { x: number; y: number }
  p1: { x: number; y: number }
  cp1?: { x: number; y: number }
  cp2?: { x: number; y: number }
  rx?: number
  ry?: number
  largeArc?: 0 | 1
  sweep?: 0 | 1
  edge?: BenchtopEdge
}

// A straight cut line across the top; joins split the shape into pieces (P-b).
export interface BenchtopJoinLine {
  p0: { x: number; y: number }
  p1: { x: number; y: number }
  type: BenchtopJoinType
}

export interface BenchtopInstance {
  id: string
  room_id: string
  label: string | null
  // Source of truth for the outline (Phase 3). polygon / arc_segments /
  // edge_tags are derived from it on every write (benchtopGeometry.shapeWrite).
  segments: BenchtopSegment[]
  joins: BenchtopJoinLine[]
  polygon: Array<{ x: number; y: number }>
  arc_segments: BenchtopArcSegment[]
  edge_tags: BenchtopEdgeTag[]
  /** @deprecated vertex join flags — replaced by `joins` (P-b); no longer written. */
  join_types: BenchtopJoinPoint[]
  cutout_polygons: Array<Array<{ x: number; y: number }>>
  // Wall anchor (Phase 3b, P-e) — same meaning as a cabinet's wall + side.
  // Null until the canvas auto-anchors it (benchtopAnchor.autoAnchor).
  wall_id: string | null
  wall_side: 'face' | 'back'
  /** Underside height override (P-g) — the top sits on this; null = base-height cascade. */
  height_mm: number | null
  benchtop_build_method_id: string | null
  benchtop_schedule_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// ── Benchtop build method ─────────────────────────────────────────────────────

export type BenchtopJoinType      = 'butt' | 'mitre'
export type BenchtopGrainDir      = 'length' | 'width'
// buildup_flat: strips laid flat under the top · buildup_vertical: rails on edge ·
// solid: single board · outsourced: stone/laminate by a supplier (supply items only)
export type BenchtopConstruction  = 'buildup_flat' | 'buildup_vertical' | 'solid' | 'outsourced'

export interface BenchtopBuildMethod {
  id:                  string
  name:                string
  description:         string | null
  construction:        BenchtopConstruction
  active_part_roles:   BenchtopPartRole[]
  strip_width_mm:      number | null   // buildup_flat: strip width
  buildup_rail_depth:  number | null   // buildup_vertical: rail height
  cross_member_spacing_mm: number | null
  default_schedule_id: string | null   // beats room/job schedule; benchtop override still wins
  drop_front_height:   number | null
  default_join_type:   BenchtopJoinType
  grain_direction:     BenchtopGrainDir
  corner_join_type:    BenchtopJoinType
  default_edge_profile_id: string | null   // applied to exposed edges with no explicit profile
  wizard_answers:      Record<string, unknown>
  is_default:          boolean
  active:              boolean
  created_at:          string
  updated_at:          string
}

// ── Benchtop edge profile ─────────────────────────────────────────────────────
// Applied per exposed edge. `generates` makes the resolver spawn parts:
// apron → drop strip of apron_drop_mm, waterfall → full-height end panel.

export type BenchtopEdgeProfileCategory = 'stone' | 'board' | 'postform'
export type BenchtopEdgeProfileGenerates = 'none' | 'apron' | 'waterfall'

export interface BenchtopEdgeProfile {
  id:            string
  name:          string
  code:          string | null
  category:      BenchtopEdgeProfileCategory
  description:   string | null
  generates:     BenchtopEdgeProfileGenerates
  apron_drop_mm: number | null
  radius_mm:     number | null
  preview_svg:   string | null
  sort_order:    number
  active:        boolean
  created_at:    string
  updated_at:    string
}

// ── Benchtop schedule ─────────────────────────────────────────────────────────

export type BenchtopPartRole =
  | 'worktop_panel'
  | 'buildup_rail'
  | 'buildup_cross_member'
  | 'subtop'
  | 'drop_front_fascia'
  | 'side_fascia'
  | 'back_fascia'
  | 'stone_slab'
  // Generated by edge profiles (Phase 4) — same material as the worktop
  | 'waterfall_panel'
  | 'apron_strip'

export interface BenchtopScheduleRow {
  id:                   string
  schedule_id:          string
  part_role:            BenchtopPartRole
  material_id:          string | null   // board stock (structural parts)
  benchtop_material_id: string | null   // surface material (worktop, stone)
  edgeband_id:          string | null
}

// ── Hinge hardware system (schema v0.6) ───────────────────────────────────────

export type HingeEdge = 'left' | 'right' | 'top' | 'bottom'
export type HingeType = 'euro' | 'pivot' | 'other'
export type HingeMountingSurface = 'auto' | 'side' | 'top' | 'bottom' | 'shelf'
export type HingePlateType =
  | 'standard' | 'thick_door' | 'frame_mount' | 'zero_protrusion' | 'other'

// A boring hole defined relative to a datum centre (cup centre for anchor holes,
// plate centre for plate mounting holes). All values in mm.
export interface HingeHole {
  offset_x: number
  offset_y: number
  diameter: number
  depth:    number
}

// hardware_hinges — the cup library record (one per hinge product).
export interface HardwareHinge {
  id:                  string
  name:                string
  brand:               string | null
  hinge_type:          HingeType
  default_hinge_edge:  HingeEdge
  opening_angle:       number | null
  // Angled hinge: (door ↔ mounting panel angle) − 90°; 0 = ordinary (z_cabinet_shape decision 10).
  mount_angle_deg:     number
  overlay:             number | null
  cup_diameter:        number | null   // mm — editable, never hardcoded
  cup_depth_mm:        number | null
  cup_x_from_edge_mm:  number          // mm from door edge to cup centre
  boring_depth:        number | null   // legacy, kept for compatibility
  anchor_holes:        HingeHole[]
  min_door_thickness:  number | null
  soft_close:          boolean | null
  clip_type:           string | null
  // separate cup model (legacy / simple fallback)
  model_cup_url:       string | null
  model_cup_format:    'glb' | 'stl' | 'obj' | null
  model_cup_scale:     number
  model_cup_anchor_x:  number
  model_cup_anchor_y:  number
  model_cup_anchor_z:  number
  // combined two-part animated GLB (preferred)
  model_combined_url:          string | null
  model_combined_format:       'glb' | null
  model_combined_scale:        number
  bore_centre_to_door_face_mm: number | null
  supplier_code:       string | null
  cost_per_unit:       number | null
  active:              boolean
  notes:               string | null
  created_at:          string
  updated_at:          string
}

// hardware_hinge_plates — plate library, one hinge → many compatible plates.
export interface HardwareHingePlate {
  id:                    string
  hinge_id:              string
  name:                  string
  brand:                 string | null
  plate_type:            HingePlateType
  plate_offset_mm:       number          // cup centre → plate mounting centre (mm)
  mounting_hole_pattern: HingeHole[]
  compatible_surfaces:   ('side' | 'top' | 'bottom' | 'shelf')[]
  model_plate_url:       string | null
  model_plate_format:    'glb' | 'stl' | 'obj' | null
  model_plate_scale:     number
  model_plate_anchor_x:  number
  model_plate_anchor_y:  number
  model_plate_anchor_z:  number
  supplier_code:         string | null
  cost_per_unit:         number | null
  is_default:            boolean
  active:                boolean
  notes:                 string | null
  created_at:            string
  updated_at:            string
}

// hinge_count_rules — shop-level lookup: door height → number of hinges.
export interface HingeCountRule {
  id:              string
  max_height_mm:   number
  hinge_count:     number
  top_inset_mm:    number
  bottom_inset_mm: number
  sort_order:      number
  active:          boolean
  notes:           string | null
  created_at:      string
  updated_at:      string
}

// hinge_instances — one physical hinge on a door. Re-keyed to a stable identity
// (cabinet_instance_id + row_index + col_index + sort_order) so it survives the
// resolver's delete+recreate of face_zones. face_zone_id is a refreshed pointer.
export interface HingeInstance {
  id:                           string
  cabinet_instance_id:          string
  row_index:                    number
  col_index:                    number
  face_zone_id:                 string | null
  hinge_hardware_id:            string
  hinge_plate_id:               string | null
  hinge_edge:                   HingeEdge
  y_position_mm:                number          // from door bottom
  y_locked:                     boolean
  mounting_surface:             HingeMountingSurface
  shelf_snap_tolerance_mm:      number
  resolved_mounting_part_table: 'case_parts' | 'internal_parts' | null
  resolved_mounting_part_id:    string | null
  sort_order:                   number
  notes:                        string | null
  created_at:                   string
  updated_at:                   string
}

// hinge_schedules — existing table; v0.6 adds hinge_plate_id.
export interface HingeSchedule {
  id:             string
  name:           string
  description:    string | null
  hinge_id:       string | null
  hinge_plate_id: string | null
  is_default:     boolean
  active:         boolean
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

// ── Fixtures & appliances (z_fixtures/FIXTURES-SPEC.md) ───────────────────────

export type FixtureCategory = 'appliance' | 'sink' | 'tap' | 'decorative' | 'opening'
export type FixtureMount = 'floor' | 'under_bench' | 'benchtop' | 'wall'

/** Model + size fields shared by the catalogue row and the placed (job) copy. */
export interface FixtureBody {
  category:     FixtureCategory
  kind:         string | null
  name:         string
  /** Copied onto placed fixtures too (schedule reads the job copy). */
  brand:        string | null
  model_no:     string | null
  width:        number
  depth:        number
  height:       number
  mount:        FixtureMount
  colour:       string | null
  model_url:    string | null
  model_format: 'glb' | 'stl' | 'obj' | null
  model_scale:  number
  model_rot_x:  number
  model_rot_y:  number
  model_off_x:  number
  model_off_y:  number
  model_off_z:  number
  // ── Benchtop cutout template (P3) — null shape = no cutout ──
  /** 'rect' = cutout_w × cutout_d (corner cutout_radius); 'round' = Ø cutout_w. */
  cutout_shape:  'rect' | 'round' | null
  cutout_w:      number
  cutout_d:      number
  cutout_radius: number
  /** Cutout centre offset from the footprint centre: + right (along width), + forward. */
  cutout_off_x:  number
  cutout_off_y:  number
  /** P10: the cutout cuts the benchtop under it (false = keep the size, no hole). */
  cut_benchtop:  boolean
  /** Benchtop mount: underside sits this far below the benchtop top (sink bowl depth). */
  bench_drop:    number
  /** P8: true plan shape traced from the fitted model (null = draw the box + symbol). */
  plan_shape:    import('./fixturePlanShape').PlanShape | null
  /** P8: true front (elevation) shape, u across, v down from the top. */
  elev_shape:    import('./fixturePlanShape').PlanShape | null
  /** P11: the model follows width / depth when stretched (banded via `stretch`, else scaled). */
  resizable:     boolean
  /** P11: the model's stretch spec (GLB scene extras), read when the library traces it. */
  stretch:       import('./fixtureStretch').StretchSpec | null
}

/** A library category (P6): what the tabs / F6 picker show. `category` = the behaviour type its items get. */
export interface FixtureGroup {
  id:         string
  name:       string
  /** Key into FIXTURE_ICONS (src/components/FixtureIcon.tsx). */
  icon:       string
  category:   FixtureCategory
  sort_order: number
  created_at: string
}

export interface FixtureCatalogItem extends FixtureBody {
  id:           string
  /** P6: library category (fixture_groups); null = Other. */
  group_id:     string | null
  mount_height: number | null
  notes:        string | null
  active:       boolean
  sort_order:   number
  created_at:   string
  updated_at:   string
}

// ── CAD annotations (z_CAD_tool/ANNOTATION-SPEC.md) ──────────────────────────

export type AnnotationView = 'plan' | 'elevation' | 'cabinet_sheet'
export type AnnotationKind = 'text' | 'line' | 'rect' | 'ellipse' | 'cloud' | 'dim'

/** A markup item printed on the shop drawings. geom is in real mm in the view frame;
 *  style sizes are paper mm (see src/lib/annotations/style.ts for the keys). */
export interface RoomAnnotation {
  id:         string
  room_id:    string
  view:       AnnotationView
  wall_id:    string | null
  cabinet_id: string | null
  sheet_view: 'front' | 'side' | null
  kind:       AnnotationKind
  geom:       import('./annotations/geometry').AnnotationGeom
  text:       string | null
  style:      import('./annotations/style').AnnotationStyle
  sort_order: number
  created_at: string
  updated_at: string
}

/** A fixture placed in a room — a copy of the catalogue row at placement time. */
export interface RoomFixture extends FixtureBody {
  id:         string
  room_id:    string
  catalog_id: string | null
  x:          number
  y:          number
  rotation:   number
  z:          number
  wall_id:    string | null
  label:      string | null
  /** P4: the cabinet it sits on (it follows that cabinet), else null. */
  cabinet_id: string | null
  /** P4: footprint centre in the cabinet's frame (x along the width, z from the back) + turn vs the cabinet. */
  link_x:     number
  link_z:     number
  link_rot:   number
  /** z_ubo U4: seated in an open face cell of its cabinet (cabinet contents), else null. */
  link_zone?: import('./cabinetContents').LinkZone | null
  /** P5 openings: hinge (or slide-to) side looking from inside the room, and which way a door swings. */
  hinge_side: 'left' | 'right'
  swing:      'in' | 'out'
  created_at: string
  updated_at: string
}
