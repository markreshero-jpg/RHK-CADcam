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
  IDCL:          number   // inner drawer clearance left
  IDCR:          number   // inner drawer clearance right
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
}

// Slide schedule entry: depth+height tier → specific slide product
export interface SlideScheduleEntry {
  id:               string
  schedule_id:      string
  depth_threshold:  number   // NL of the slide (e.g. 450) — used as max available depth for selection
  height_threshold: number   // minimum opening height required, e.g. 104 (= box_height of that slide)
  slide_id:         string
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

  // Drawer box construction
  drawer_material?:   Material          // drawer box panels (e.g. 12mm HMR)
  drawer_box_rules?:  DrawerBoxRules    // box joinery rules (defaults to DEFAULT_DB_RULES)

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

  // Internal parts
  adj_shelves:     AdjShelfInput[]
  fixed_shelves:   FixedShelfInput[]
  inner_drawers:   InnerDrawerInput[]
  dividers?:       InternalDividerInput[]
}

// ── Face Grid Input ───────────────────────────────────────────
export interface FaceGridInput {
  rows: FaceRowInput[]
  cols: FaceColInput[]
  zones: FaceZoneInput[]
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
  hinge_side?: 'left' | 'right'
  face_ins?:  number   // per-zone inset override
  face_buf?:  number   // per-zone buffer override
  drawer_type_config?: DrawerTypeConfig  // only used when face_type === 'drawer_face'
}

// ── Internal Part Inputs ──────────────────────────────────────
export interface AdjShelfInput {
  sort_order:  number
  y_locked:    boolean
  y_position?: number   // only if locked
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
}

// Stored as internal_grid JSONB on cabinet_instances — mirrors face_grid pattern
export interface InternalGridInput {
  adj_shelves:   AdjShelfInput[]
  fixed_shelves: FixedShelfInput[]
  dividers:      InternalDividerInput[]
}

// ── Resolved Output ───────────────────────────────────────────
// What the resolver returns — ready to write to Supabase

export interface ResolvedCabinet {
  cabinet_id:    string
  case_parts:    ResolvedCasePart[]
  toekick_parts: ResolvedToekickPart[]
  internal_parts: ResolvedInternalPart[]
  face_rows:     ResolvedFaceRow[]
  face_cols:     ResolvedFaceCol[]
  face_zones:    ResolvedFaceZone[]
  drawer_stacks: ResolvedDrawerStack[]
  seam_joints:   ResolvedSeamJoint[]
  // Validation errors — non-empty means something is wrong
  errors:        ResolverError[]
  warnings:      ResolverError[]
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
  part_type:  'adj_shelf' | 'fixed_shelf' |
              'inner_drawer_bottom' | 'inner_drawer_back' | 'divider'
  sort_order: number
  y_locked:   boolean
  x_locked?:  boolean   // dividers only
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

export interface ResolvedFaceZone extends ResolvedPart {
  row_index:  number
  col_index:  number
  face_type:  'door' | 'drawer_face' | 'false_panel' | 'open'
  hinge_side?: 'left' | 'right'
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
