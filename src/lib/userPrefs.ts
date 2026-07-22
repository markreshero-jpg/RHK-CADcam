import { type SnapSettings, DEFAULT_SNAP_SETTINGS, normaliseSnapSettings } from './canvasSnap'
import { type ElevSnapSettings, DEFAULT_ELEV_SNAP_SETTINGS, normaliseElevSnapSettings } from './elevationSnap'

export type DrawingPreset = 'schematic' | 'design' | 'working' | 'face_elevation' | 'full_parts' | 'line_drawing'

/** Per-canvas-view default drawing layer (preset). Section view has no layer system yet. */
export interface DrawingPresets {
  plan:      DrawingPreset
  elevation: DrawingPreset
}

export type ViewStyle = 'wire' | 'solid'

/** Default wire/solid style for each CabinetEditModal view, set individually. */
export interface CabinetViewStyles {
  top:       ViewStyle
  elevation: ViewStyle
  side:      ViewStyle
  '3d':      ViewStyle
}

export interface UserPrefs {
  invertScroll: boolean
  drawingPresets:     DrawingPresets
  cabinetViewStyles:  CabinetViewStyles
  snapSettings:     SnapSettings
  elevSnapSettings: ElevSnapSettings
  /** Panel Optimiser Stage 2 part-table column order (persisted layout). */
  optimiserPartCols: string[] | null
  /** Part dimensions shown in the cabinet editor include edgebanding (finished
   *  size, the default). Off = show the cut (board) size, tape deducted. */
  includeBandingInPartSize: boolean
}

const KEY = 'rhk_user_prefs'

const DEFAULT_DRAWING_PRESETS: DrawingPresets = {
  plan:      'full_parts',
  elevation: 'full_parts',
}

const DEFAULT_CABINET_VIEW_STYLES: CabinetViewStyles = {
  top:       'wire',
  elevation: 'wire',
  side:      'wire',
  '3d':      'wire',
}

const DEFAULTS: UserPrefs = {
  invertScroll: false,
  drawingPresets:    DEFAULT_DRAWING_PRESETS,
  cabinetViewStyles: DEFAULT_CABINET_VIEW_STYLES,
  snapSettings:     DEFAULT_SNAP_SETTINGS,
  elevSnapSettings: DEFAULT_ELEV_SNAP_SETTINGS,
  optimiserPartCols: null,
  includeBandingInPartSize: true,
}

function normaliseDrawingPresets(raw: unknown, legacy: unknown): DrawingPresets {
  // legacy = old singular `defaultDrawingPreset` field; seeds both views if present.
  const fallback = typeof legacy === 'string' ? (legacy as DrawingPreset) : DEFAULT_DRAWING_PRESETS.plan
  const r = (raw ?? {}) as Partial<DrawingPresets>
  return {
    plan:      r.plan      ?? fallback,
    elevation: r.elevation ?? fallback,
  }
}

function normaliseCabinetViewStyles(raw: unknown): CabinetViewStyles {
  const r = (raw ?? {}) as Partial<CabinetViewStyles>
  return {
    top:       r.top       ?? DEFAULT_CABINET_VIEW_STYLES.top,
    elevation: r.elevation ?? DEFAULT_CABINET_VIEW_STYLES.elevation,
    side:      r.side      ?? DEFAULT_CABINET_VIEW_STYLES.side,
    '3d':      r['3d']     ?? DEFAULT_CABINET_VIEW_STYLES['3d'],
  }
}

export function getUserPrefs(): UserPrefs {
  if (typeof window === 'undefined') return DEFAULTS
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    const merged = { ...DEFAULTS, ...stored }
    return {
      ...merged,
      drawingPresets:    normaliseDrawingPresets(stored.drawingPresets, stored.defaultDrawingPreset),
      cabinetViewStyles: normaliseCabinetViewStyles(stored.cabinetViewStyles),
      snapSettings:     normaliseSnapSettings(merged.snapSettings),
      elevSnapSettings: normaliseElevSnapSettings(merged.elevSnapSettings),
    }
  } catch {
    return DEFAULTS
  }
}

export function setUserPrefs(prefs: Partial<UserPrefs>): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(KEY, JSON.stringify({ ...getUserPrefs(), ...prefs }))
}
