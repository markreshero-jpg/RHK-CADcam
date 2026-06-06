// ── Cabinet part line-colour palette ──────────────────────────────────────────
// One editable colour per broad part category, used for the LINE colours of
// cabinet parts across the 2D canvas views (plan + elevation) and the 3D part
// viewers. Replaces the previously-hardcoded PART_COLORS / edge-colour tables.
//
// Resolution order (later overrides earlier):
//   DEFAULT_PALETTE   — built-in global default, shared by everyone (in code)
//   → user override   — per-browser, localStorage
// A DB-backed shared/global override layer can slot in between later without
// changing call sites: getPalette() is the single resolution point.

export type PaletteCategory =
  | 'carcase'
  | 'toekick'
  | 'door'
  | 'drawer_face'
  | 'internal'
  | 'drawer_box'
  | 'slides'
  | 'hinges'

export type PartPalette = Record<PaletteCategory, string>

export const PALETTE_CATEGORY_LABELS: Record<PaletteCategory, string> = {
  carcase:     'Carcase',
  toekick:     'Toe kick',
  door:        'Door / face',
  drawer_face: 'Drawer face',
  internal:    'Internal / shelves',
  drawer_box:  'Drawer box',
  slides:      'Drawer slides',
  hinges:      'Hinges',
}

// Display order in the editor.
export const PALETTE_CATEGORY_ORDER: PaletteCategory[] = [
  'carcase', 'toekick', 'door', 'drawer_face', 'internal', 'drawer_box', 'slides', 'hinges',
]

// Built-in defaults — these mirror the previous elevation PART_COLORS values so
// the default look is unchanged on first run.
export const DEFAULT_PALETTE: PartPalette = {
  carcase:     '#b8c8dc',
  toekick:     '#f59e0b',
  door:        '#60a5fa',
  drawer_face: '#f472b6',
  internal:    '#818cf8',
  drawer_box:  '#34d399',
  slides:      '#94a3b8',
  hinges:      '#a855f7',
}

// Map a resolver part key / part_type / face_type to a palette category.
const PART_CATEGORY: Record<string, PaletteCategory> = {
  // carcase
  left_side: 'carcase', right_side: 'carcase', bottom: 'carcase', back: 'carcase',
  full_top: 'carcase', front_rail: 'carcase', back_rail: 'carcase',
  // toe kick
  kick_front_face: 'toekick', kick_sub_front: 'toekick', kick_back: 'toekick',
  spreader_vertical: 'toekick', spreader_horizontal: 'toekick',
  // internal / shelves
  adj_shelf: 'internal', fixed_shelf: 'internal', accessory: 'internal', divider: 'internal',
  pull_out_bottom: 'internal', pull_out_side: 'internal', pull_out_back: 'internal',
  // drawer box (face drawers + inner drawers)
  db_front: 'drawer_box', db_back: 'drawer_box', db_left_side: 'drawer_box',
  db_right_side: 'drawer_box', db_bottom: 'drawer_box',
  inner_drawer_bottom: 'drawer_box', inner_drawer_back: 'drawer_box',
  inner_drawer_side: 'drawer_box', inner_drawer_front: 'drawer_box',
  // slides
  db_slide: 'slides',
  // faces
  door: 'door', false_panel: 'door', drawer_face: 'drawer_face',
}

export function categoryForPart(key: string): PaletteCategory | null {
  return PART_CATEGORY[key] ?? null
}

const KEY = 'rhk_part_palette'

/** Per-user overrides only (subset of categories the user has changed). */
export function getUserPaletteOverride(): Partial<PartPalette> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return raw && typeof raw === 'object' ? (raw as Partial<PartPalette>) : {}
  } catch {
    return {}
  }
}

export function setUserPaletteOverride(override: Partial<PartPalette>): void {
  if (typeof window === 'undefined') return
  // Drop entries equal to the default so the override stays minimal.
  const trimmed: Partial<PartPalette> = {}
  for (const cat of PALETTE_CATEGORY_ORDER) {
    const v = override[cat]
    if (v && v.toLowerCase() !== DEFAULT_PALETTE[cat].toLowerCase()) trimmed[cat] = v
  }
  localStorage.setItem(KEY, JSON.stringify(trimmed))
}

/** Fully-resolved palette = defaults merged with the per-user override. */
export function getPalette(): PartPalette {
  return { ...DEFAULT_PALETTE, ...getUserPaletteOverride() }
}

/**
 * Expand a resolved palette into a per-part-key colour map, matching the keys
 * the SVG views look up (e.g. PART_COLORS[p.part_key]). Lets existing call sites
 * keep their `MAP[key]` shape while sourcing colours from the palette.
 */
export function paletteToPartColors(palette: PartPalette): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, cat] of Object.entries(PART_CATEGORY)) out[key] = palette[cat]
  return out
}

/** Line colour for a single part key, with a hard fallback for unmapped keys. */
export function partLineColor(palette: PartPalette, key: string, fallback = '#b8c8dc'): string {
  const cat = categoryForPart(key)
  return cat ? palette[cat] : fallback
}
