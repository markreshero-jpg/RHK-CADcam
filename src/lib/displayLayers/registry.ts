// ── Display layer item registry ───────────────────────────────────────────────
// The fixed list of everything a layer set can show / hide, per canvas view.
// Spec: z_display_layers/DISPLAY-LAYERS-SPEC.md
// One active layer set drives every view; each set holds per-view item settings.
//
// Item ids are stored in drawing_layer_sets.settings — NEVER rename or reuse one.
// A new module that draws on the canvas adds its items here and gates rendering
// through LayerView.show()/props() (see resolve.ts).

export type LayerViewId = 'plan' | 'elevation' | '3d'
export const LAYER_VIEWS: { id: LayerViewId; label: string }[] = [
  { id: 'plan',      label: 'Plan' },
  { id: 'elevation', label: 'Elevation' },
  { id: '3d',        label: '3D' },
]

export type LayerStyle = 'solid' | 'dashed' | 'ghost'

export interface ItemSetting {
  visible: boolean
  style:   LayerStyle
  /** Phase 3: override colour (#rrggbb). Unset = the renderer's normal colour. */
  color?:  string
  /** Phase 3: line-weight multiplier (text items: size multiplier). Unset = 1. */
  weight?: number
  /** Opacity multiplier 0.1–1 (applies on top of the style). Unset = 1. */
  opacity?: number
  /** Dimension items: extra distance (mm) out from the measured object. Rows
   *  outside this one move out with it. Unset = 0. */
  offset?: number
}

export const WEIGHT_OPTIONS = [0.5, 1, 1.5, 2, 3] as const
export const OPACITY_OPTIONS = [1, 0.75, 0.5, 0.25, 0.1] as const

export type LayerGroup =
  | 'carcase' | 'kicks' | 'fronts' | 'internals' | 'hardware' | 'panels'
  | 'benchtops' | 'fixtures' | 'room' | 'labels' | 'dimensions' | 'annotations'

export const LAYER_GROUPS: { id: LayerGroup; label: string }[] = [
  { id: 'carcase',    label: 'Carcase' },
  { id: 'kicks',      label: 'Kicks' },
  { id: 'fronts',     label: 'Fronts' },
  { id: 'internals',  label: 'Internals' },
  { id: 'hardware',   label: 'Hardware' },
  { id: 'panels',     label: 'Panels' },
  { id: 'benchtops',  label: 'Benchtops' },
  { id: 'fixtures',   label: 'Fixtures & appliances' },
  { id: 'room',       label: 'Room' },
  { id: 'labels',     label: 'Labels' },
  { id: 'dimensions', label: 'Dimensions' },
  { id: 'annotations', label: 'Annotations' },
]

export interface LayerItemDef {
  id:     string
  group:  LayerGroup
  label:  string
  views:  LayerViewId[]
  /** Default for every view that can render it. */
  default: ItemSetting
  /** Per-view default overrides (e.g. kicks hidden in plan by default). */
  viewDefaults?: Partial<Record<LayerViewId, Partial<ItemSetting>>>
  hint?:  string
}

const ON:  ItemSetting = { visible: true,  style: 'solid' }
const OFF: ItemSetting = { visible: false, style: 'solid' }
const ALL: LayerViewId[] = ['plan', 'elevation', '3d']

export const LAYER_ITEMS: LayerItemDef[] = [
  // Carcase
  { id: 'carcass_outline', group: 'carcase', label: 'Cabinet outline', views: ['plan', 'elevation'], default: ON,
    hint: 'Plan footprint; elevation box while parts are loading or resizing' },
  { id: 'split_lines',     group: 'carcase', label: 'Split lines', views: ['elevation'], default: ON,
    hint: 'Where the sides and back of a height-split cabinet are cut (z_cabinet_split)' },
  { id: 'carcass_gables', group: 'carcase', label: 'Gables',       views: ALL, default: ON },
  { id: 'finger_rails',   group: 'carcase', label: 'Finger pull rails', views: ALL, default: ON,
    viewDefaults: { plan: { visible: false } },
    hint: 'Door-colour backing rails behind each finger gap (z_handles H6)' },
  { id: 'carcass_top',    group: 'carcase', label: 'Tops / rails', views: ALL, default: ON },
  { id: 'carcass_bottom', group: 'carcase', label: 'Bottoms',      views: ALL, default: ON },
  { id: 'carcass_back',   group: 'carcase', label: 'Backs',        views: ['plan', '3d'], default: ON },

  // Kicks
  { id: 'kick_faces',     group: 'kicks', label: 'Kick boards',        views: ALL, default: ON,
    viewDefaults: { plan: { visible: false } } },
  { id: 'kick_spreaders', group: 'kicks', label: 'Spreaders / ladder', views: ALL, default: ON,
    viewDefaults: { plan: { visible: false } } },

  // Fronts
  { id: 'doors',          group: 'fronts', label: 'Doors',          views: ALL, default: ON },
  { id: 'drawer_fronts',  group: 'fronts', label: 'Drawer fronts',  views: ALL, default: ON },
  { id: 'false_panels',   group: 'fronts', label: 'False panels',   views: ['elevation', '3d'], default: ON },
  { id: 'door_swings',    group: 'fronts', label: 'Door swings',    views: ['plan'], default: ON },
  { id: 'drawer_lines',   group: 'fronts', label: 'Drawer lines',   views: ['plan'], default: ON },
  { id: 'door_chevrons',  group: 'fronts', label: 'Door chevrons',  views: ['elevation'], default: ON },
  { id: 'drawer_labels',  group: 'fronts', label: 'Drawer labels',  views: ['elevation'], default: ON },

  // Internals
  { id: 'internal_outline', group: 'internals', label: 'Interior marker', views: ['plan'], default: OFF,
    hint: 'Dashed inset box on cabinets with internals' },
  // ('shelves' was the combined item — split; stored settings carry over via SPLIT_FROM.)
  { id: 'adj_shelves',    group: 'internals', label: 'Adjustable shelves',    views: ['elevation', '3d'], default: ON },
  { id: 'fixed_shelves',  group: 'internals', label: 'Fixed shelves',         views: ['elevation', '3d'], default: ON },
  { id: 'dividers',       group: 'internals', label: 'Dividers',              views: ['elevation', '3d'], default: ON },
  { id: 'inner_drawers',  group: 'internals', label: 'Inner drawers / pull-outs', views: ['elevation', '3d'], default: ON },
  { id: 'accessories',    group: 'internals', label: 'Accessories',           views: ['elevation', '3d'], default: ON },
  { id: 'shelf_labels',   group: 'internals', label: 'Shelf labels',          views: ['elevation'], default: ON },
  { id: 'inner_drawer_labels', group: 'internals', label: 'Inner drawer labels', views: ['elevation'], default: ON },

  // Hardware — hidden by default in plan + 3D (3D models only load when shown).
  // ('hardware' was a Phase-1 item id — retired, split into the items below.)
  { id: 'drawer_boxes',   group: 'hardware', label: 'Drawer boxes',        views: ALL, default: ON,
    viewDefaults: { plan: { visible: false }, '3d': { visible: false } } },
  { id: 'drawer_runners', group: 'hardware', label: 'Drawer runners',      views: ALL, default: ON,
    viewDefaults: { plan: { visible: false }, '3d': { visible: false } } },
  { id: 'bins',           group: 'hardware', label: 'Bins',                views: ALL, default: ON,
    hint: 'Pull-out bins (z_bin_cabinet): runners, tray and bins, sized from the bin pick (plan: top outline)' },
  { id: 'inner_drawer_runners', group: 'hardware', label: 'Inner drawer / pull-out runners', views: ['elevation', '3d'], default: ON,
    viewDefaults: { '3d': { visible: false } } },
  { id: 'hinges',         group: 'hardware', label: 'Hinges + plates',     views: ['elevation', '3d'], default: ON,
    viewDefaults: { '3d': { visible: false } }, hint: 'Elevation: cup bores; 3D: hinge + plate models' },
  // Handles (z_handles H2) — visible by default (they're part of how the job
  // looks), except plan where they'd clutter the footprint.
  { id: 'handles',        group: 'hardware', label: 'Handles',             views: ALL, default: ON,
    viewDefaults: { plan: { visible: false } }, hint: 'Door + drawer handles from the handle schedule' },
  { id: 'handle_holes',   group: 'hardware', label: 'Handle holes',        views: ['elevation', '3d'], default: ON,
    hint: 'Through-holes drilled for each handle (gone when drilling is switched off)' },
  { id: 'drawer_front_drilling', group: 'hardware', label: 'Drawer front drilling', views: ['elevation'], default: ON,
    hint: 'Drawer-box fixing bores into the back of each drawer front (from the runner drilling)' },
  { id: 'machining',      group: 'hardware', label: 'Drilling / machining', views: ['elevation', '3d'], default: ON,
    viewDefaults: { '3d': { visible: false } }, hint: 'Joint + hardware bores and hand-added operations' },

  // Panels
  // Added parts, split by parts_library key (Phase 3b) — see customPartKinds.ts.
  // custom_panels keeps its Phase-1 id (stored in sets) = everything not below.
  { id: 'applied_panels', group: 'panels', label: 'Applied / end panels', views: ALL, default: ON },
  { id: 'fillers',        group: 'panels', label: 'Fillers',              views: ALL, default: ON },
  { id: 'bulkheads',      group: 'panels', label: 'Bulkheads',            views: ALL, default: ON,
    hint: 'Bulkhead fascia, returns and fixing cleat (z_bulkhead)' },
  { id: 'curved_ends',    group: 'panels', label: 'Curved ends',          views: ALL, default: ON,
    hint: 'Curved fixed-panel cabinets: face board, formers, fixing panel, back and blocks (z_curved_end)' },
  { id: 'floating_shelves', group: 'panels', label: 'Floating shelves',   views: ALL, default: ON,
    hint: 'Floating shelf boards, strips and cleats (z_floating_shelf)' },
  { id: 'custom_panels',  group: 'panels', label: 'Other added parts',    views: ALL, default: ON,
    hint: 'Added parts that are not applied panels or fillers (scribe mould, nailer, gusset…)' },

  // Benchtops
  { id: 'benchtops',      group: 'benchtops', label: 'Benchtops', views: ALL, default: ON,
    hint: 'Plan outline + waterfall leg footprints; elevation band at top height; 3D slab + waterfall legs' },
  { id: 'benchtop_edges', group: 'benchtops', label: 'Benchtop edge profiles', views: ['plan', 'elevation'], default: ON,
    hint: 'Plan: profile colour + code on exposed edges, wall edges dashed grey. Elevation: code on the front edge' },
  { id: 'benchtop_joins', group: 'benchtops', label: 'Benchtop join lines', views: ['plan', 'elevation'], default: ON },

  // Fixtures & appliances (z_fixtures) — one item per catalogue category
  { id: 'fixture_appliances', group: 'fixtures', label: 'Appliances', views: ALL, default: ON },
  { id: 'fixture_sinks',      group: 'fixtures', label: 'Sinks',      views: ALL, default: ON },
  { id: 'fixture_taps',       group: 'fixtures', label: 'Taps',       views: ALL, default: ON },
  { id: 'fixture_decorative', group: 'fixtures', label: 'Decorative', views: ALL, default: ON },
  { id: 'fixture_openings',   group: 'fixtures', label: 'Doors & windows', views: ALL, default: ON },
  { id: 'fixture_labels',     group: 'fixtures', label: 'Fixture names', views: ['plan', 'elevation'], default: ON },

  // Room
  { id: 'walls',          group: 'room', label: 'Walls', views: ['3d'], default: ON },

  // Labels
  { id: 'cabinet_labels', group: 'labels', label: 'Cabinet names', views: ['plan', 'elevation'], default: ON },
  { id: 'cabinet_sizes',  group: 'labels', label: 'Cabinet sizes', views: ['plan', 'elevation'], default: ON },
  { id: 'tutorial_hints', group: 'labels', label: 'Tutorial hints', views: ['plan'], default: ON,
    hint: 'Where-to-click hints while File → Tutorial mode is on (z_tutorial)' },

  // Dimensions
  { id: 'dim_wall_overall',     group: 'dimensions', label: 'Wall length',        views: ['plan'], default: ON },
  { id: 'dim_base_chain',       group: 'dimensions', label: 'Base chain',         views: ['plan'], default: ON },
  { id: 'dim_benchtop',         group: 'dimensions', label: 'Benchtops',          views: ['plan'], default: ON,
    hint: 'Plan: a BENCHTOP row just outside the base row — the length of each top on the wall' },
  { id: 'dim_wall_chain',       group: 'dimensions', label: 'Wall-cabinet chain', views: ['plan'], default: ON },
  { id: 'dim_row_labels',       group: 'dimensions', label: 'Row names',          views: ['plan'], default: ON,
    hint: 'Plan: BASE / BENCHTOP / WALL CABS / TALL / WALL … at the start of each dimension row' },
  { id: 'dim_elev_height',      group: 'dimensions', label: 'Height chain',       views: ['elevation'], default: ON },
  { id: 'dim_elev_bench',       group: 'dimensions', label: 'Bench & basin heights', views: ['elevation'], default: ON,
    hint: 'Elevation: floor to the top of the benchtop, and to the rim of a basin sitting on it' },
  { id: 'dim_elev_floor_chain', group: 'dimensions', label: 'Floor cabinet widths', views: ['elevation'], default: ON },
  { id: 'dim_elev_wall_chain',  group: 'dimensions', label: 'Overhead cabinet widths', views: ['elevation'], default: ON },
  { id: 'dim_kicks',            group: 'dimensions', label: 'Kicks',              views: ['plan', 'elevation'], default: OFF,
    hint: 'Plan: kick board lengths + kick depth at the wall ends; elevation: kick height' },
  { id: 'dim_openings',         group: 'dimensions', label: 'Doors & windows',    views: ['plan', 'elevation'], default: ON,
    hint: 'Plan: a row to the door / window jambs; elevation: widths + sill and head heights' },

  // Annotations (z_CAD_tool) — CAD markup printed on the shop drawings. Show / hide /
  // ghost only: each annotation keeps its own colour, weight and dash.
  { id: 'annot_text',   group: 'annotations', label: 'Text notes',        views: ['plan', 'elevation'], default: ON,
    hint: 'Text, text boxes and their leaders' },
  { id: 'annot_markup', group: 'annotations', label: 'Markup',            views: ['plan', 'elevation'], default: ON,
    hint: 'Lines, arrows, boxes, ellipses and clouds' },
  { id: 'annot_dims',   group: 'annotations', label: 'Manual dimensions', views: ['plan', 'elevation'], default: ON },
]

export const LAYER_ITEM_BY_ID: Record<string, LayerItemDef> =
  Object.fromEntries(LAYER_ITEMS.map(i => [i.id, i]))

/** Item id → the retired item it was split from. Saved layer sets keep the old
 *  id's setting; each new item inherits it until edited on its own. */
export const SPLIT_FROM: Record<string, string> = {
  adj_shelves:   'shelves',
  fixed_shelves: 'shelves',
}

export function itemsForView(view: LayerViewId): LayerItemDef[] {
  return LAYER_ITEMS.filter(i => i.views.includes(view))
}

export function itemDefault(item: LayerItemDef, view: LayerViewId): ItemSetting {
  return { ...item.default, ...(item.viewDefaults?.[view] ?? {}) }
}

// ── Stored set shape ─────────────────────────────────────────────────────────

export interface ViewLayerSettings {
  items?: Record<string, Partial<ItemSetting>>
  /** Elevation only: outline-only rendering in part-palette colours. */
  lineDrawing?: boolean
  /** Phase 3: view background colour (#rrggbb). Unset = the view's default. */
  background?: string
  /** Plan / elevation cabinet fill per class (#rrggbb). Corner classes follow
   *  their parent class. Unset = the built-in CAB_FILL colour. */
  cabinetFill?: Partial<Record<CabinetFillClass, string>>
  /** Plan / elevation cabinet fill opacity multiplier 0.1–1 (fill only, not the
   *  outline stroke). Unset = 1. */
  cabinetFillOpacity?: number
}
export type CabinetFillClass = 'base' | 'wall' | 'tall'
export const CABINET_FILL_CLASSES: { id: CabinetFillClass; label: string }[] = [
  { id: 'base', label: 'Base' },
  { id: 'wall', label: 'Wall' },
  { id: 'tall', label: 'Tall' },
]
export type LayerSetSettings = Partial<Record<LayerViewId, ViewLayerSettings>>

export interface LayerSet {
  id:         string            // drawing_layer_sets uuid
  name:       string
  sort_order: number
  settings:   LayerSetSettings
}

// Part-key → item mapping helpers so every renderer classifies parts identically.
export function casePartItem(partKey: string): string {
  if (partKey === 'left_side' || partKey === 'right_side') return 'carcass_gables'
  if (partKey === 'bottom') return 'carcass_bottom'
  if (partKey === 'back') return 'carcass_back'
  // Shaped-cabinet per-edge panels (z_cabinet_shape): side:<edge> / back:<edge>.
  if (partKey.startsWith('side:')) return 'carcass_gables'
  if (partKey.startsWith('back:')) return 'carcass_back'
  if (partKey.startsWith('fprail:')) return 'finger_rails'
  // Return cleats behind angled corner fillers (z_angled_filler).
  if (partKey.startsWith('cleat:')) return 'fillers'
  if (partKey.startsWith('bh:')) return 'bulkheads'      // z_bulkhead
  // z_curved_end: its curved kick (C5) shows with the kicks.
  if (partKey.startsWith('crv:kick_spr_')) return 'kick_spreaders'
  if (partKey.startsWith('crv:kick')) return 'kick_faces'
  if (partKey.startsWith('crv:')) return 'curved_ends'
  if (partKey.startsWith('fs:')) return 'floating_shelves'   // z_floating_shelf
  if (partKey.startsWith('ibp:')) return 'applied_panels'     // z_island_back_panel
  return 'carcass_top'            // full_top, front_rail, back_rail, rail:<edge>
}
export function kickPartItem(partKey: string): string {
  return partKey === 'spreader_vertical' || partKey === 'spreader_horizontal' ? 'kick_spreaders' : 'kick_faces'
}
export function internalPartItem(partType: string): string {
  if (partType === 'adj_shelf') return 'adj_shelves'
  if (partType === 'fixed_shelf') return 'fixed_shelves'
  if (partType === 'divider') return 'dividers'
  if (partType === 'accessory') return 'accessories'
  return 'inner_drawers'          // inner_drawer_*, pull_out_*
}
export function faceZoneItem(faceType: string): string | null {
  if (faceType === 'door') return 'doors'
  if (faceType === 'drawer_face') return 'drawer_fronts'
  if (faceType === 'false_panel') return 'false_panels'
  return null                     // open
}
