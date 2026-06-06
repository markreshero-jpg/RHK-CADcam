// ============================================================
// Cabinet CAD/CAM — Formula Resolver Types
// Schema v0.4
// ============================================================

// ── Dimensions & Transform ────────────────────────────────────
export interface PartTransform {
  // Dimensions (in cabinet space)
  DX: number   // extent in cabinet Z direction (depth on sheet)
  DY: number   // extent in cabinet X direction (width/length)
  DZ: number   // always @material.DZ (thickness)

  // Position (cabinet origin = bottom-left-back corner)
  X:  number   // cabinet X position
  Y:  number   // cabinet Y position
  Z:  number   // cabinet Z position (+Z = toward front)

  // Rotation (degrees)
  AX: number
  AY: number
  AZ: number
}

// ── Material ──────────────────────────────────────────────────
export interface Material {
  id:             string
  name:           string
  DZ:             number   // thickness mm
  sheet_dx:       number
  sheet_dy:       number
  has_grain:      boolean
  grain_direction?: 'horizontal' | 'vertical'
  face_colour?:   string | null
  back_colour?:   string | null
  edge_colour?:   string | null
}

// ── Edge Banding ──────────────────────────────────────────────
export interface EdgeBanding {
  top:    boolean
  bottom: boolean
  left:   boolean
  right:  boolean
  id?:    string   // edgeband catalog ID — same banding on all banded edges of this part
}

// Edging defaults per part type (stored in construction method rules)
export type EdgeSides = ('top' | 'bottom' | 'left' | 'right')[]

export interface EdgingDefaults {
  // Case parts
  left_side?:          EdgeSides
  right_side?:         EdgeSides
  bottom?:             EdgeSides
  back?:               EdgeSides
  full_top?:           EdgeSides
  front_rail?:         EdgeSides
  back_rail?:          EdgeSides
  // Toekick parts
  kick_front_face?:    EdgeSides
  kick_sub_front?:     EdgeSides
  kick_back?:          EdgeSides
  spreader_vertical?:  EdgeSides
  spreader_horizontal?:EdgeSides
  // Internal parts
  adj_shelf?:          EdgeSides
  fixed_shelf?:        EdgeSides
  inner_drawer_bottom?:EdgeSides
  inner_drawer_back?:  EdgeSides
  inner_drawer_side?:  EdgeSides
  inner_drawer_front?: EdgeSides
  pull_out_bottom?:    EdgeSides
  pull_out_side?:      EdgeSides
  pull_out_back?:      EdgeSides
  accessory?:          EdgeSides
  divider?:            EdgeSides
  // Face zones
  door?:               EdgeSides
  drawer_face?:        EdgeSides
  false_panel?:        EdgeSides
}

// Converts a sides list to an EdgeBanding struct
export function edgeSidesToBanding(sides: EdgeSides, ebId?: string): EdgeBanding {
  return {
    top:    sides.includes('top'),
    bottom: sides.includes('bottom'),
    left:   sides.includes('left'),
    right:  sides.includes('right'),
    id:     ebId,
  }
}

// Shop-sensible defaults for standard frameless EU construction.
// Edge names are from the sheet perspective: top/bottom are the long horizontal edges,
// left/right are the short vertical/depth edges of the cut panel.
export const DEFAULT_EDGING: Required<EdgingDefaults> = {
  left_side:           ['top', 'bottom', 'left', 'right'],   // all 4 edges on side panels
  right_side:          ['top', 'bottom', 'left', 'right'],
  bottom:              ['top', 'left', 'right'],              // top = front edge of base bottom
  back:                [],
  full_top:            ['top', 'left', 'right'],
  front_rail:          ['top'],
  back_rail:           [],
  kick_front_face:     ['top'],
  kick_sub_front:      ['top'],
  kick_back:           [],
  spreader_vertical:   [],
  spreader_horizontal: [],
  adj_shelf:           ['top'],                               // top = front-facing edge of shelf
  fixed_shelf:         ['top'],
  inner_drawer_bottom: [],
  inner_drawer_back:   ['top'],
  inner_drawer_side:   ['top'],
  inner_drawer_front:  ['top'],
  pull_out_bottom:     [],
  pull_out_side:       ['top'],
  pull_out_back:       ['top'],
  accessory:           [],
  divider:             ['top', 'left', 'right'],              // front + both height edges
  door:                ['top', 'bottom', 'left', 'right'],
  drawer_face:         ['top', 'bottom', 'left', 'right'],
  false_panel:         ['top', 'bottom', 'left', 'right'],
}

// ── Construction Method Rules ─────────────────────────────────
// All variables used by the resolver.
// Stored as JSONB in Supabase — this is the typed view of it.
export interface ConstructionRules {
  // Toe kick
  TOEH:     number   // toe kick height (mm)
  TOE_TYPE: 'ladder' | 'leg' | 'none'
  TOESP:    number   // spreader spacing (mm)
  TOESCF:   number   // toe scribe front
  TOESCB:   number   // toe scribe back
  TOESCL:   number   // toe scribe left
  TOESCR:   number   // toe scribe right

  // Case scribes
  SCRBK:    number   // scribe back
  SCRBT:    number   // scribe bottom
  SCRL:     number   // scribe left
  SCRR:     number   // scribe right
  SCRT:     number   // scribe top

  // Top options
  TOP_TYPE: 'full_top' | 'front_rail' | 'double_rail' | 'none'
  RD:       number   // rail depth mm

  // Internal — adjustable shelf
  ADJSB_F:  number   // adj shelf setback front
  ADJSB_B:  number   // adj shelf setback back
  ADJSL:    number   // adj shelf clearance left
  ADJSR:    number   // adj shelf clearance right

  // Internal — fixed shelf
  FIXSB_F:  number   // fixed shelf setback front
  FIXSB_B:  number   // fixed shelf setback back

  // Internal — inner drawer
  IDCL:          number   // inner-drawer FACE clearance left (gap from compartment opening to the visible inner-drawer face)
  IDCR:          number   // inner-drawer FACE clearance right
  IDFAO:         number   // inner drawer face add-on height
  SLIDE_SETBACK: number   // min clearance between back of slide and back panel inner face

  // Face reveals
  REVT:     number   // reveal top
  REVB:     number   // reveal bottom
  REVL:     number   // reveal left (adjacent cabinet)
  REVR:     number   // reveal right (adjacent cabinet)
  REVENDL:  number   // reveal left (end panel / wall)
  REVENDR:  number   // reveal right (end panel / wall)
  GAPC:     number   // centre gap between face zones (horizontal)
  GAPR:     number   // gap between face rows (vertical)

  // Face position
  FACBUF:   number   // buffer pad clearance (overlay mode)
  FACINS:   number   // inset depth (0 = overlay)

  // Joinery — how panels connect to each other
  BOTTOM_JOIN:      'sides_outside' | 'bottom_outside'    // sides span full height vs bottom spans full width
  BOTTOM_BACK_JOIN: 'back_on_bottom' | 'butts_into_back'  // bottom runs behind back vs stops at back inner face
  BACK_JOIN:        'between_sides' | 'behind_sides'      // back fits between sides vs wraps behind them
  TOP_BACK_JOIN:    'butts_into_back' | 'sits_over_back'  // top/rail starts at back inner face vs runs full depth over back
  RAIL_JOIN:        'between_sides' | 'on_top_of_sides'   // top rail fits between sides vs sits on top

  // Edging defaults (optional — falls back to DEFAULT_EDGING if absent)
  EDGING?:  EdgingDefaults
}

// ── Joinery Configuration ─────────────────────────────────────
// Controls how case panels connect to each other.
// Defaults match Standard Frameless EU (sides outside, all between).

export interface JoineryConfig {
  // Side-to-Bottom: which panel is dominant (full-size)?
  bottom_join:    'sides_outside' | 'bottom_outside'

  // Side-to-Back: does the back sit between the sides or behind them?
  back_join:      'between_sides' | 'behind_sides'

  // Bottom-to-Back: does the back panel start above the bottom panel?
  back_on_bottom: boolean

  // Side-to-Rail/Top: does the top element sit between the sides or on top of them?
  // When 'on_top_of_sides', sides are shorter by T.
  rail_join:      'between_sides' | 'on_top_of_sides'
}

export const DEFAULT_JOINERY: JoineryConfig = {
  bottom_join:    'sides_outside',
  back_join:      'between_sides',
  back_on_bottom: true,
  rail_join:      'between_sides',
}

// Default construction rules — Standard Frameless EU
export const DEFAULT_RULES: ConstructionRules = {
  TOEH: 150, TOE_TYPE: 'ladder', TOESP: 450,
  TOESCF: 40, TOESCB: 0, TOESCL: 0, TOESCR: 0,
  SCRBK: 0, SCRBT: 0, SCRL: 0, SCRR: 0, SCRT: 0,
  TOP_TYPE: 'front_rail', RD: 100,
  ADJSB_F: 10, ADJSB_B: 0, ADJSL: 1, ADJSR: 1,
  FIXSB_F: 0, FIXSB_B: 0,
  IDCL: 2, IDCR: 2, IDFAO: 0, SLIDE_SETBACK: 20,
  REVT: 4, REVB: 0, REVL: 1, REVR: 1,
  REVENDL: 2, REVENDR: 2, GAPC: 2, GAPR: 2,
  FACBUF: 2, FACINS: 0,
  BOTTOM_JOIN: 'sides_outside', BOTTOM_BACK_JOIN: 'back_on_bottom',
  BACK_JOIN: 'between_sides', TOP_BACK_JOIN: 'butts_into_back', RAIL_JOIN: 'between_sides',
}

// ── Drawer Types ─────────────────────────────────────────────
export type DrawerType = 'system' | 'five_piece'

export interface DrawerTypeConfig {
  type: DrawerType
  // system drawer: references a specific slide product — box_height comes from slide.box_height
  slide_product_id?: string
  // five_piece / inner: box_height = face_opening_height − height_adjustment
  height_adjustment?: number
}

// ── Slide Product ─────────────────────────────────────────────
// Mirrors a row in hardware_slides. One row = one specific NL + height variant.
export interface SlideProduct {
  id:               string
  name:             string
  brand:            string | null
  nominal_length:   number | null   // e.g. 450 mm (the NL)
  box_height:       number | null   // e.g. 128 mm — drives system drawer box height
  side_deduction:   number          // total width deducted from opening (both sides)
  runner_thickness: number          // thickness of each slide rail (for 3D, mm)
  min_runner_depth: number | null   // min drawer depth this slide handles
  max_runner_depth: number | null   // max drawer depth this slide handles
  soft_close:       boolean
  full_extension:   boolean
  cost_per_pair:    number | null
  colour:           string | null   // hex colour for 3D rendering
  // 3D model (optional — null falls back to box rendering)
  model_url:        string | null
  model_format:     'glb' | 'stl' | 'obj' | null
  model_scale:      number          // unit-correction multiplier (default 1.0)
  model_anchor_x:   number          // nudge (mm) from convention origin
  model_anchor_y:   number
  model_anchor_z:   number
  // Drilling this slide imposes on the surfaces it touches (cabinet member +
  // drawer-box parts). Empty = no slide holes. Loaded from drawer_slide_operations.
  drill_ops:        SlideDrillOp[]
}

// Slide schedule entry: depth+height tier → specific slide product
export interface SlideScheduleEntry {
  id:               string
  schedule_id:      string
  depth_threshold:  number   // NL of the slide (e.g. 450) — used as max available depth for selection
  height_threshold: number   // minimum opening height required, e.g. 104 (= box_height of that slide)
  slide_id:         string
}

// ── Slide Drilling ────────────────────────────────────────────────
// A drilling/routing op a slide imposes on a surface it touches. Mirrors a row
// in drawer_slide_operations (child of hardware_slides). Conceptually the slide
// analogue of JointTypeOp, but keyed by a semantic target_surface instead of a
// seam's part_a/part_b — one slide can drill into several surfaces (esp.
// undermount: cabinet member + drawer bottom + back + front dowels).

// Surfaces a slide can drill into. cabinet_member = the gable/divider the runner
// mounts to; the rest are drawer-box parts (drawer_front = the visible face).
export type SlideDrillSurface =
  | 'cabinet_member' | 'drawer_side' | 'drawer_bottom' | 'drawer_back' | 'drawer_front'

// Handedness. 'both' mirrors the op for the left+right rails (the common case
// for symmetric fixings); 'left'/'right' pin it to one rail.
export type SlideDrillSide = 'both' | 'left' | 'right'

export interface SlideDrillOp {
  id:                string
  slide_id:          string
  operation_order:   number
  target_surface:    SlideDrillSurface
  machine_operation: JointMachineOp     // 'drill' | 'route' | 'pocket' (shared with joints)
  tool_diameter_mm:  number
  depth_mm:          number
  along_off_mm:      number   // position down the slide/box from its front datum
  up_off_mm:         number   // height (or across, for bottom faces)
  qty:               number
  spacing_mm:        number | null      // gap between repeats (null = single hole)
  repeat_axis:       'along' | 'up'     // direction repeated holes step (default 'up')
  side:              SlideDrillSide
  tool:              string | null
  notes:             string | null
  expressions:       Record<string, string> | null  // same evaluator as joints
}

// A slide drill op resolved to an absolute cabinet-space hole position. Same
// shape as jointDrilling's DrillOpPos so the 3D/2D views render it identically;
// kept here (not importing DrillOpPos) so the resolver stays free of view deps.
export type SlideDrillAxis = 'x-' | 'x+' | 'y-' | 'y+' | 'z-' | 'z+'

export interface ResolvedSlideDrill {
  x: number; y: number; z: number   // entry point on the target surface (cabinet coords)
  axis:     SlideDrillAxis           // direction the bore travels into the material
  radius:   number                   // tool_diameter_mm / 2
  depthLen: number                   // bore depth (capped for drawer_front)
  surface:  SlideDrillSurface
  side:     'left' | 'right'         // which rail produced it
  machine_operation: JointMachineOp  // drill | route | pocket (for labelling)
}

// ── Drawer Box Edging ─────────────────────────────────────────
export type DbEdgingKey = 'db_left_side' | 'db_right_side' | 'db_bottom' | 'db_front' | 'db_back'
export type DbEdgingDefaults = Partial<Record<DbEdgingKey, EdgeSides>>

export const DEFAULT_DB_EDGING: Record<DbEdgingKey, EdgeSides> = {
  db_left_side:  ['top', 'left', 'right'],
  db_right_side: ['top', 'left', 'right'],
  db_bottom:     [],
  db_front:      ['top', 'left', 'right'],
  db_back:       ['top', 'left', 'right'],
}

// ── Drawer Box Rules ──────────────────────────────────────────
export interface DrawerBoxRules {
  DB_SIDE_T:             number                         // side/front/back panel thickness (mm)
  DB_BOTTOM_T:           number                         // bottom panel thickness (mm)
  DB_BOTTOM_JOIN:        'dado' | 'screwed'             // how bottom attaches to sides
  DB_DADO_HEIGHT:        number                         // dado groove height from bottom face (mm)
  DB_DADO_DEPTH:         number                         // dado cut depth (mm)
  DB_BACK_SETBACK:       number                         // bottom panel setback from back face (mm)
  DB_JOINT_TYPE:         'butt' | 'dado' | 'dovetail'  // how front/back connect to sides
  DB_BACK_HEIGHT_ADJUST: number                         // deducted from slide box_height to get back panel height (mm)
  DB_BACK_WIDTH_ADJUST:  number                         // deducted from box width to get back panel width (mm)
  DB_BACK_Y_OFFSET:      number                         // raises back panel off box floor (mm), added to auto-calculated backY
  IDB_FRONT_CLEAR:         number                         // inner-drawer face per-side clearance from compartment opening (mm)
  IDB_FRONT_TOP_ADJUST:    number                         // mm added above the box top (positive grows upward)
  IDB_FRONT_BOTTOM_ADJUST: number                         // mm added below the box bottom (positive grows downward)
  IDB_FRONT_WIDTH_ADJUST:  number                         // added to inner-drawer face width  (mm); 0 = opening minus 2×clearance. Centred.
  IDB_DRAWER_Z_SETBACK:    number                         // mm the entire inner drawer (box + front) is recessed into the cabinet from the slide front
  DB_EDGING?:            DbEdgingDefaults               // per-part edge sides (absent = use DEFAULT_DB_EDGING)
}

export const DEFAULT_DB_RULES: DrawerBoxRules = {
  DB_SIDE_T:             12,
  DB_BOTTOM_T:           6,
  DB_BOTTOM_JOIN:        'dado',
  DB_DADO_HEIGHT:        12,
  DB_DADO_DEPTH:         8,
  DB_BACK_SETBACK:       25,
  DB_JOINT_TYPE:         'butt',
  DB_BACK_HEIGHT_ADJUST: 0,
  DB_BACK_WIDTH_ADJUST:  0,
  DB_BACK_Y_OFFSET:      0,
  IDB_FRONT_CLEAR:         2,
  IDB_FRONT_TOP_ADJUST:    0,
  IDB_FRONT_BOTTOM_ADJUST: 0,
  IDB_FRONT_WIDTH_ADJUST:  0,
  IDB_DRAWER_Z_SETBACK:    0,
}

// ── Joint Types ───────────────────────────────────────────────

export type JointTargetPart = 'part_a' | 'part_b'
export type JointMachineOp  = 'drill' | 'route' | 'pocket' | 'saw'
export type JointFace       = 'normal' | 'end' | 'top' | 'bottom'

export interface JointTypeOp {
  id:                string
  joint_type_id:     string
  operation_order:   number
  target_part:       JointTargetPart
  machine_operation: JointMachineOp
  face:              JointFace
  tool_diameter_mm:  number
  depth_mm:          number
  offset_x_mm:       number
  offset_y_mm:       number
  offset_z_mm:       number
  qty:               number
  spacing_mm:        number | null
  tool:              string | null
  notes:             string | null
  expressions:       Record<string, string> | null
}

// A joint assignment resolved for one seam — ready for 3D display and eventual drilling spec export
export interface ResolvedSeamJoint {
  seam_key:        string         // e.g. "bottom:left_side"
  joint_type_id:   string
  joint_type_name: string
  source:          'cabinet' | 'method'   // per-cabinet override vs CM default
  part_a_key:      string         // first part in the seam key (e.g. "bottom")
  part_b_key:      string         // second part (e.g. "left_side")
  ops:             JointTypeOp[]
  // Only set for the back:bottom seam — selects the drill orientation:
  // 'butts_into_back' → front-to-back (Z) holes, 'back_on_bottom' → vertical (Y) holes.
  bottom_back_join?: 'back_on_bottom' | 'butts_into_back'
}

// ── Drawer Box Input ──────────────────────────────────────────
export interface DrawerBoxInput {
  box_width:         number   // outer width (mm)
  box_height:        number   // outer height (mm)
  box_depth:         number   // runner depth (mm)
  material:          Material
  edgeband_id?:      string
  bottom_material?:  Material  // if omitted, falls back to material
  bottom_edgeband_id?: string
  front_material?:   Material  // if omitted, falls back to material (used by inner drawers)
  front_edgeband_id?: string
  rules:             DrawerBoxRules
  slide_box_height?: number   // slide product box_height — when provided, drives back panel height
}

// ── Resolved Drawer Box Part ──────────────────────────────────
export type DrawerBoxPartType = 'db_left_side' | 'db_right_side' | 'db_bottom' | 'db_front' | 'db_back'

export interface ResolvedDrawerBoxPart extends ResolvedPart {
  part_type: DrawerBoxPartType
}

// ── Cabinet Input ─────────────────────────────────────────────
// Everything the resolver needs to know about a cabinet
export interface CabinetInput {
  // Identity
  id:             string
  assembly_class: 'base' | 'wall' | 'tall' | 'base_corner' | 'wall_corner' | 'tall_corner'
  label?:         string

  // Master dimensions
  DX:             number   // overall width
  DY:             number   // overall height (including toe kick for base)
  DZ:             number   // overall depth

  // Module switches
  has_carcass:    boolean
  has_internal:   boolean
  has_face:       boolean
  has_toekick:    boolean

  // Top / toe overrides
  top_type?:      ConstructionRules['TOP_TYPE']
  toe_type?:      ConstructionRules['TOE_TYPE']

  // Neighbour context
  left_neighbour:  'cabinet' | 'end_panel' | 'wall' | 'freestanding'
  right_neighbour: 'cabinet' | 'end_panel' | 'wall' | 'freestanding'

  // Exposed interior flag
  exposed_interior: boolean

  // Materials (resolved before passing to resolver)
  material:        Material   // primary carcass material
  door_material:   Material   // face material
  shelf_material:  Material   // shelf material
  toekick_face_material:     Material
  toekick_interior_material: Material

  // Edgeband IDs per material role (resolved from schedule, optional)
  interior_edgeband_id?:         string
  door_edgeband_id?:             string
  shelf_edgeband_id?:            string
  toekick_face_edgeband_id?:     string
  toekick_interior_edgeband_id?: string

  // Slide hardware (for inner drawers — legacy scalar, kept for fallback)
  slide_side_deduction: number

  // Default drawer type — sourced from the drawer box method (project-level field removed)
  default_drawer_type?: DrawerType

  // Default drawer type for inner drawers — sourced from the inner drawer method
  // (cabinet → room → project → shop). Used as a fallback when an inner-drawer
  // fitting has no explicit drawer_type set.
  default_inner_drawer_type?: DrawerType

  // Drawer box construction (face-zone drawers)
  drawer_material?:   Material          // drawer box panels (e.g. 12mm HMR)
  drawer_box_rules?:  DrawerBoxRules    // box joinery rules (defaults to DEFAULT_DB_RULES)

  // Inner drawer construction — compartment-anchored, kept separate from the face
  // drawers above. Falls back to the face drawer rules/material, then DEFAULT_DB_RULES.
  inner_drawer_box_rules?:  DrawerBoxRules
  inner_drawer_material?:   Material
  inner_drawer_edgeband_id?: string
  inner_drawer_bottom_material?:   Material
  inner_drawer_bottom_edgeband_id?: string
  inner_drawer_front_material?:    Material
  inner_drawer_front_edgeband_id?: string

  // Drawer-box methods referenced by per-fitting `drawer_box_method_id` overrides
  // (keyed by drawer_box_methods.id). Pre-fetched by loadCabinetInput from the
  // distinct ids that appear in InnerDrawerFittings in the tree. When a fitting
  // references a method id present here, the resolver uses these rules instead of
  // `inner_drawer_box_rules`.
  drawer_box_method_rules?: Record<string, DrawerBoxRules>

  // Slide products + schedule (resolved before passing to resolver)
  slide_products?:  SlideProduct[]        // all active slide products available
  slide_schedule?:  SlideScheduleEntry[]  // depth-range → slide_id mapping

  // Construction rules (already merged from system → job → room → cabinet)
  rules:           ConstructionRules

  // Joint assignments (resolved before passing to resolver)
  carcase_joints?:   Record<string, string | null>   // per-cabinet overrides: seamKey → joint_type_id (null = suppressed)
  joint_defaults?:   Record<string, string>           // from construction method schedule row: genericSeamKey → joint_type_id
  joint_type_ops?:   Record<string, JointTypeOp[]>   // keyed by joint_type_id
  joint_type_names?: Record<string, string>           // joint_type_id → name

  // Face grid definition
  face_grid:       FaceGridInput

  // Resolved door styles per zone, keyed by `${row_index}_${col_index}`.
  // Populated by loadCabinetInput after walking the cascade (zone → room → job)
  // and loading the style's catalogue (thickness) + profile (+ operations).
  // resolveFace consumes this to override the door panel thickness and evaluate
  // the profile geometry. Absent key = no door style on that zone.
  resolved_doors?: Record<string, ResolvedDoorStyleInput>

  // Internal layout — recursive section tree (structural splits + compartment fittings)
  internal_tree:   Section
  // Vertical gap (mm) between stacked fittings inside an open compartment.
  // Drives both the resolver (emitBoxStack stacking) and the editor preview.
  // Per-cabinet; falls back to a 3mm default when unset. Sourced from
  // `internal_grid.stack_gap` in loadCabinetInput.
  internal_stack_gap?: number

  // ── Hinge inputs (schema v0.6) ──────────────────────────────────────────────
  // Shop-level door-height → count rules, ordered ASC by max_height_mm.
  hinge_count_rules?: HingeRuleInput[]
  // Default hinge cup + plate resolved from the hinge schedule cascade
  // (cabinet → room → job → shop). Null when no hinge schedule is assigned.
  hinge_hardware?:    HingeHardwareInput | null
  hinge_plate?:       HingePlateInput | null
  // Existing persisted hinge_instances for this cabinet, pre-loaded so the
  // resolver can preserve y_locked rows and per-hinge overrides across a
  // re-resolve. Keyed in code by (row_index, col_index, sort_order).
  existing_hinges?:   ExistingHingeInput[]
}

// ── Hinge resolver inputs ─────────────────────────────────────────────────────
// Decoupled from the DB row shapes (mirrors how SlideProduct is defined locally).
export interface HingeRuleInput {
  max_height_mm:   number
  hinge_count:     number
  top_inset_mm:    number
  bottom_inset_mm: number
}
export interface HingeBoreHole {
  offset_x: number
  offset_y: number
  diameter: number
  depth:    number
}
export interface HingeHardwareInput {
  id:                 string
  default_hinge_edge: 'left' | 'right' | 'top' | 'bottom'
  cup_x_from_edge_mm: number
  cup_diameter:       number | null
  cup_depth_mm:       number | null
  anchor_holes:       HingeBoreHole[]
  // Combined two-part animated GLB (Section 13). Null when no model uploaded.
  model_combined_url:          string | null
  model_combined_scale:        number
  bore_centre_to_door_face_mm: number | null
  open_angle_deg:              number | null
}
export interface HingePlateInput {
  id:                    string
  plate_offset_mm:       number
  mounting_hole_pattern: HingeBoreHole[]
  compatible_surfaces:   ('side' | 'top' | 'bottom' | 'shelf')[]
  // Separate plate GLB (for hinge models that ship without a plate mesh).
  model_plate_url:       string | null
  model_plate_scale:     number
  // Nudge (mm, cabinet axes) to line the plate model up on the bore.
  model_plate_anchor_x:  number
  model_plate_anchor_y:  number
  model_plate_anchor_z:  number
}
export interface ExistingHingeInput {
  row_index:               number
  col_index:               number
  sort_order:              number
  y_position_mm:           number
  y_locked:                boolean
  hinge_edge:              'left' | 'right' | 'top' | 'bottom'
  mounting_surface:        'auto' | 'side' | 'top' | 'bottom' | 'shelf'
  shelf_snap_tolerance_mm: number
  hinge_plate_id:          string | null
}

// ── Resolved hinge instance + drills ──────────────────────────────────────────
// One physical hinge on a door. Carries the persisted identity, the resolved
// mounting target (as a descriptor that persist maps to a freshly-inserted part
// id), and the cup/plate drill positions in absolute cabinet coords.
export interface ResolvedHingeDrill {
  x: number
  y: number
  z: number
  axis:    'x-' | 'x+' | 'y-' | 'y+' | 'z-' | 'z+'
  radius:  number
  depthLen: number
  kind:    'cup' | 'anchor' | 'plate'
}
// Where the plate fires. part_key identifies a case part; internal_sort_order +
// internal_part_type identify an internal shelf. persist resolves this to the
// new DB row id after case/internal parts are inserted.
export interface ResolvedHingeMountTarget {
  table: 'case_parts' | 'internal_parts'
  part_key?: ResolvedCasePart['part_key']
  internal_part_type?: ResolvedInternalPart['part_type']
  internal_sort_order?: number
}
export interface ResolvedHingeInstance {
  row_index:  number
  col_index:  number
  sort_order: number
  hinge_edge: 'left' | 'right' | 'top' | 'bottom'
  y_position_mm: number
  y_locked:      boolean
  mounting_surface: 'auto' | 'side' | 'top' | 'bottom' | 'shelf'
  shelf_snap_tolerance_mm: number
  hinge_hardware_id: string
  hinge_plate_id:    string | null
  // Resolved mounting target (null when unresolved, e.g. no plate/edge match).
  mount_target: ResolvedHingeMountTarget | null
  // Drill ops in absolute cabinet coords.
  cup_drills:   ResolvedHingeDrill[]   // fire on the door back face
  plate_drills: ResolvedHingeDrill[]   // fire on the resolved mounting surface
  // Combined-GLB model for the 3D viewer (null when no model uploaded). The
  // viewer places the bore-centre origin on the door's hinge axis at this
  // hinge's height (local y = y_position_mm inside the door's rotating group).
  model_url:        string | null
  model_scale:      number
  bore_to_door_mm:  number | null   // HingeSpec.bore_centre_to_door_face_mm
  open_angle_deg:   number | null   // HingeSpec.open_angle_deg (mechanical max)
  cup_x_from_edge_mm: number        // door edge → cup bore centre (across width)
  // Separate plate GLB (overrides the combined GLB's HingePlate mesh when set).
  plate_model_url:   string | null
  plate_model_scale: number
  plate_anchor_x:    number
  plate_anchor_y:    number
  plate_anchor_z:    number
}

// ── Face Grid Input ───────────────────────────────────────────
export interface FaceGridInput {
  rows: FaceRowInput[]
  cols: FaceColInput[]
  zones: FaceZoneInput[]
}

// ── Door style input (loaded from the door library, pre-evaluation) ──
// Raw door_profile_operations rows: fixed numeric columns + the expressions
// jsonb (formula override per field, joints pattern). resolveFace evaluates
// these against the resolved panel dimensions.
export interface RawProfileOp {
  operation_type:      'route' | 'drill' | 'pocket'
  depth_mm:            number | null
  width_mm:            number | null
  offset_from_edge_mm: number | null
  repeat_axis:         'none' | 'x' | 'y'
  spacing_mm:          number | null
  tool_diameter_mm:    number | null
  face:                'front' | 'back'
  expressions:         Record<string, string> | null
  sort_order:          number
}
export interface ResolvedDoorStyleInput {
  style_id:            string
  profile_id:          string | null
  thickness_mm:        number
  profile_type:        ResolvedDoorProfile['profile_type'] | null
  ops:                 RawProfileOp[]
  // Linked board material id for the default colour, if the schedule colour
  // points at a materials row — used for face colour in rendering. Optional.
  colour_material_id?: string | null
  // Edge tape for the default colour (edge_banding id), colour-matched. Falls
  // back to the carcass schedule's door_face edgeband when unset.
  edgeband_id?: string | null
  // Which edges of the door blank get banded (from door_catalogue). Falls back
  // to the construction method's EDGING[door] rule when unset.
  edge_band_sides?: EdgeSides | null
}

export interface FaceRowInput {
  row_index:    number
  height?:      number   // null = equalise
  height_locked: boolean
}

export interface FaceColInput {
  col_index:    number
  width?:       number   // null = equalise
  width_locked: boolean
}

export interface FaceZoneInput {
  row_index:  number
  col_index:  number
  face_type:  'door' | 'drawer_face' | 'false_panel' | 'open'
  hinge_side?: 'left' | 'right' | 'top' | 'bottom'
  face_ins?:  number   // per-zone inset override
  face_buf?:  number   // per-zone buffer override
  drawer_type_config?: DrawerTypeConfig  // only used when face_type === 'drawer_face'
  // Per-zone door style assignment (lowest level of the door cascade:
  // zone → room → job). null/undefined = inherit. Lives in the face_grid
  // JSONB so it survives re-resolve (the face_zones table is rebuilt each persist).
  door_style_id?: string | null
  // Manual hinge positions for a door (mm from the door BOTTOM, along the hinged
  // edge). When set, the resolver uses these exact positions instead of the shop
  // hinge_count_rules — letting the user add/move/remove hinges per door.
  // Undefined = auto (rule-based). Lives in the face_grid JSONB.
  hinges?: number[]
}

// ── Internal Part Inputs ──────────────────────────────────────
export interface AdjShelfInput {
  sort_order:  number
  y_locked:    boolean
  y_position?: number   // only if locked
  col_idx?:    number   // if set, shelf only spans this column (undefined = all columns)
  // Per-shelf overrides
  setback_front?: number
  setback_back?:  number
  clearance_l?:   number
  clearance_r?:   number
}

export interface FixedShelfInput {
  sort_order:  number
  y_position?: number   // null = mid height
  y_locked:    boolean
  col_idx?:    number   // if set, shelf only spans this column (undefined = all columns)
  setback_front?: number
  setback_back?:  number
}

export interface InnerDrawerInput {
  sort_order:    number
  face_zone_row: number   // which face row drives this drawer
  face_zone_col: number
  runner_depth?: number   // override IDRUN
}

export interface InternalDividerInput {
  sort_order:  number
  x_locked:    boolean
  x_position?: number   // mm from interior left face (after side + scribe), equalised if absent
  row_idx?:    number   // opening row index (0 = bottom-most); undefined = full interior height
}

// Stored as internal_grid JSONB on cabinet_instances — legacy flat grid (superseded
// by the recursive section tree below; kept for the resolver's inner-drawer inputs).
export interface InternalGridInput {
  adj_shelves:   AdjShelfInput[]
  fixed_shelves: FixedShelfInput[]
  dividers:      InternalDividerInput[]
}

// ── Internal section tree (recursive internal layout) ─────────────────────────
// The cabinet interior is one root Section. A Section is either an open compartment
// (optionally holding movable adjustable shelves) or a split into child sections —
// horizontally by fixed shelves (hsplit, children stacked bottom→top) or vertically
// by dividers (vsplit, children left→right). This supports independent columns,
// partial-height dividers, and unlimited nesting. Stored as internal_grid = { tree }.
export type SectionSplitType = 'hsplit' | 'vsplit'

export interface SectionChild {
  size?:           number    // locked extent in mm (height for hsplit, width for vsplit); undefined = equalise to fill
  equalise_group?: string    // shared-size group id (e.g. "A"). Members across the tree share one size; computed as min per-split fair share so the group always fits.
  section:         Section
}

// ── Internal fittings ─────────────────────────────────────────────────────────
// A fitting is a non-structural component placed inside an *open* compartment. It
// occupies the compartment's box; the resolver dispatches each fitting by `type`
// to a resolver that emits ResolvedInternalPart[] (see resolver/fittings.ts).
// Order in the array is bottom→top. Structural separators (fixed shelves as an
// hsplit, dividers as a vsplit) are NOT fittings — they live in the tree as a
// SplitSection. A fixed shelf can also be placed as a fitting (a single shelf in
// a compartment without subdividing it).
export type InternalFittingType =
  | 'adj_shelf' | 'fixed_shelf' | 'inner_drawer' | 'pull_out' | 'accessory'

export interface AdjShelfFitting {
  type:           'adj_shelf'
  y_locked:       boolean
  y_position?:    number   // resolved/locked bottom-face Y; equalised among siblings when unlocked
  setback_front?: number
  setback_back?:  number
  clearance_l?:   number
  clearance_r?:   number
}

export interface FixedShelfFitting {
  type:           'fixed_shelf'
  y_locked:       boolean
  y_position?:    number   // unlocked = compartment mid-height
  setback_front?: number
  setback_back?:  number
}

export interface InnerDrawerFitting {
  type:                  'inner_drawer'
  drawer_box_method_id?: string        // inner-drawer construction method (DrawerBoxRules source)
  drawer_type?:          DrawerType
  slide_product_id?:     string
  height?:               number         // box height; defaults from slide / construction
  y_position?:           number         // bottom of the box within the compartment
  y_locked?:             boolean
  clearance_l?:          number
  clearance_r?:          number
  runner_depth?:         number
}

export interface PullOutFitting {
  type:              'pull_out'
  height?:           number   // side/back height of the tray
  y_position?:       number
  y_locked?:         boolean
  slide_product_id?: string
  runner_depth?:     number
  clearance_l?:      number
  clearance_r?:      number
}

export interface AccessoryFitting {
  type:        'accessory'
  key?:        string    // references parts_library.key (e.g. WINE_RACK, FILE_RAIL) — geometry TBD
  height?:     number
  y_position?: number
  y_locked?:   boolean
  notes?:      string
}

export type InternalFitting =
  | AdjShelfFitting | FixedShelfFitting | InnerDrawerFitting | PullOutFitting | AccessoryFitting

export interface OpenSection {
  type:     'open'
  fittings: InternalFitting[]   // placed contents (do not subdivide the compartment)
}

export interface SplitSection {
  type:     SectionSplitType
  children: SectionChild[]       // N children ⇒ N−1 separators between them
}

export type Section = OpenSection | SplitSection

// New internal_grid JSONB shape.
export interface InternalLayout {
  tree: Section
}

export const EMPTY_SECTION: OpenSection = { type: 'open', fittings: [] }

// ── Resolved Output ───────────────────────────────────────────
// What the resolver returns — ready to write to Supabase

export interface ResolvedCabinet {
  cabinet_id:    string
  case_parts:    ResolvedCasePart[]
  toekick_parts: ResolvedToekickPart[]
  internal_parts: ResolvedInternalPart[]
  // Slide rails emitted by inner-drawer / pull-out fittings — rendered like the
  // per-stack slides on face drawers, but anchored to the compartment box
  // (no parent face zone).
  internal_slides: ResolvedDrawerSlide[]
  face_rows:     ResolvedFaceRow[]
  face_cols:     ResolvedFaceCol[]
  face_zones:    ResolvedFaceZone[]
  drawer_stacks: ResolvedDrawerStack[]
  seam_joints:   ResolvedSeamJoint[]
  // One per physical hinge on each door zone (schema v0.6). Empty when no hinge
  // schedule is assigned or the cabinet has no door zones.
  hinge_instances: ResolvedHingeInstance[]
  // Validation errors — non-empty means something is wrong
  errors:        ResolverError[]
  warnings:      ResolverError[]
  // Resolved-part IDs the user has hidden from viewers/reports/cut lists.
  // Carried through resolution so any consumer can filter via filterHiddenParts().
  hidden_parts?: string[]
}

export interface ResolvedPart extends PartTransform {
  material_id:    string
  edge_band:      EdgeBanding
}

export interface ResolvedCasePart extends ResolvedPart {
  part_key: 'left_side' | 'right_side' | 'bottom' | 'back' |
            'full_top' | 'front_rail' | 'back_rail'
}

export interface ResolvedToekickPart extends ResolvedPart {
  part_key:   'kick_front_face' | 'kick_sub_front' | 'kick_back' |
              'spreader_vertical' | 'spreader_horizontal'
  sort_order: number
  is_detached: boolean
}

export interface ResolvedInternalPart extends ResolvedPart {
  part_type:  'adj_shelf' | 'fixed_shelf' | 'divider' |
              'inner_drawer_bottom' | 'inner_drawer_back' |
              'inner_drawer_side'   | 'inner_drawer_front' |
              'pull_out_bottom' | 'pull_out_side' | 'pull_out_back' |
              'accessory'
  sort_order: number
  y_locked:   boolean
  x_locked?:  boolean   // dividers only
  // Groups parts belonging to the same inner-drawer / pull-out instance so the
  // 3D view can animate them together (e.g. open-drawer cascade). Unique per
  // emitted drawer; absent on shelves, dividers, accessories.
  inner_drawer_index?: number
}

export interface ResolvedFaceRow {
  row_index:     number
  height:        number
  height_locked: boolean
}

export interface ResolvedFaceCol {
  col_index:     number
  width:         number
  width_locked:  boolean
}

// ── Resolved Door Profile ─────────────────────────────────────
// A door style's routing profile after formula evaluation against the
// resolved door panel dimensions. Carried on the face zone and persisted
// to face_zones.door_profile (jsonb) so every renderer can draw it without
// re-querying the door library.
export interface ResolvedProfileOp {
  operation_type:      'route' | 'drill' | 'pocket'
  depth_mm:            number | null
  width_mm:            number | null
  offset_from_edge_mm: number | null
  repeat_axis:         'none' | 'x' | 'y'
  spacing_mm:          number | null
  face:                'front' | 'back'
}
export interface ResolvedDoorProfile {
  profile_type: 'perimeter_route' | 'vj_lines' | 'panel_raise' | 'bead' | 'custom'
  ops:          ResolvedProfileOp[]
}

export interface ResolvedFaceZone extends ResolvedPart {
  row_index:  number
  col_index:  number
  face_type:  'door' | 'drawer_face' | 'false_panel' | 'open'
  hinge_side?: 'left' | 'right' | 'top' | 'bottom'
  // Door style results (only set on door zones that resolved to a style).
  // DZ already carries the catalogue thickness. door_profile is the evaluated
  // routing geometry; null when the style is a flat door.
  door_style_id?:   string | null
  door_profile_id?: string | null
  door_profile?:    ResolvedDoorProfile | null
}

// ── Resolved Drawer Stack ─────────────────────────────────────
// One stack per drawer_face zone: the front panel (already in face_zones),
// the 5-piece drawer box behind it, and the two slide rails.

export interface ResolvedDrawerSlide {
  side: 'left' | 'right'
  // Position (cabinet origin = bottom-left-back corner)
  X: number   // left edge of this slide rail
  Y: number   // bottom of slide (aligns with drawer box bottom)
  Z: number   // back face of slide (= back of cabinet for most cases)
  // Dimensions (resolver convention)
  DX: number  // nominal_length — slide runs depth-wise (cabinet Z direction)
  DY: number  // box_height — height of the slide channel (cabinet Y direction)
  DZ: number  // runner_thickness — sits against gable face (cabinet X direction)
  // Source
  slide_id:         string
  nominal_length:   number
  box_height:       number
  runner_thickness: number
  colour:           string | null
  // 3D model (optional)
  model_url:        string | null
  model_format:     'glb' | 'stl' | 'obj' | null
  model_scale:      number
  model_anchor_x:   number
  model_anchor_y:   number
  model_anchor_z:   number
  // For slides emitted by inner-drawer / pull-out fittings, tags the rail pair
  // with the drawer they belong to so the 3D view can animate them with the
  // drawer's box + face. Absent on face-zone drawer slides (which live inside
  // their own ResolvedDrawerStack).
  inner_drawer_index?: number
  // Holes this rail drills into the cabinet member + drawer-box surfaces,
  // resolved to absolute cabinet coords. Empty when the slide has no drill_ops.
  drills: ResolvedSlideDrill[]
}

export interface ResolvedDrawerStack {
  face_zone_row: number
  face_zone_col: number
  drawer_type:   DrawerType
  box_parts:     ResolvedDrawerBoxPart[]
  slides:        ResolvedDrawerSlide[]
  // Box summary dimensions (cabinet space)
  box_width:  number
  box_height: number
  box_depth:  number
  box_X:      number   // left edge of box in cabinet space
  box_Y:      number   // bottom of box (= bottom of face zone)
  box_Z:      number   // back face of box
}

export interface ResolverError {
  code:    string
  message: string
  part?:   string
}
