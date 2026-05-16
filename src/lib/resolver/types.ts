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
}

// ── Edge Banding ──────────────────────────────────────────────
export interface EdgeBanding {
  top:    boolean
  bottom: boolean
  left:   boolean
  right:  boolean
  id?:    string
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
  IDCL:     number   // inner drawer clearance left
  IDCR:     number   // inner drawer clearance right
  IDFAO:    number   // inner drawer face add-on height
  IDRUN:    number   // inner drawer runner depth

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
}

// Default construction rules — Standard Frameless EU
export const DEFAULT_RULES: ConstructionRules = {
  TOEH: 150, TOE_TYPE: 'ladder', TOESP: 450,
  TOESCF: 40, TOESCB: 0, TOESCL: 0, TOESCR: 0,
  SCRBK: 0, SCRBT: 0, SCRL: 0, SCRR: 0, SCRT: 0,
  TOP_TYPE: 'front_rail', RD: 100,
  ADJSB_F: 10, ADJSB_B: 0, ADJSL: 1, ADJSR: 1,
  FIXSB_F: 0, FIXSB_B: 0,
  IDCL: 2, IDCR: 2, IDFAO: 0, IDRUN: 450,
  REVT: 4, REVB: 0, REVL: 1, REVR: 1,
  REVENDL: 2, REVENDR: 2, GAPC: 2, GAPR: 2,
  FACBUF: 2, FACINS: 0,
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

  // Slide hardware (for inner drawers)
  slide_side_deduction: number   // mm per side

  // Construction rules (already merged from system → job → room → cabinet)
  rules:           ConstructionRules

  // Face grid definition
  face_grid:       FaceGridInput

  // Shelf configurations
  adj_shelves:     AdjShelfInput[]
  fixed_shelves:   FixedShelfInput[]
  inner_drawers:   InnerDrawerInput[]
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
              'inner_drawer_bottom' | 'inner_drawer_back'
  sort_order: number
  y_locked:   boolean
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

export interface ResolverError {
  code:    string
  message: string
  part?:   string
}
