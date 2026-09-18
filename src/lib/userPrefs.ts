import { type SnapSettings, DEFAULT_SNAP_SETTINGS, normaliseSnapSettings } from './canvasSnap'
import { GRID_STEPS } from './geometry'
import { type ElevSnapSettings, DEFAULT_ELEV_SNAP_SETTINGS, normaliseElevSnapSettings } from './elevationSnap'

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
  /** Default display layer set (drawing_layer_sets id) — one set drives plan,
   *  elevation and 3D. May hold a legacy preset key; resolve with findLayerSet. */
  layerSetId:         string
  cabinetViewStyles:  CabinetViewStyles
  snapSettings:     SnapSettings
  elevSnapSettings: ElevSnapSettings
  /** Panel Optimiser Stage 2 part-table column order (persisted layout). */
  optimiserPartCols: string[] | null
  /** Part dimensions shown in the cabinet editor include edgebanding (finished
   *  size, the default). Off = show the cut (board) size, tape deducted. */
  includeBandingInPartSize: boolean
  /** Plan-view reference grid: dots drawn behind the drawing. */
  planGrid: PlanGridPrefs
}

export interface PlanGridPrefs {
  visible: boolean
  /** Dot spacing in mm; 0 = automatic (picked from the zoom). */
  step: number
}

export const DEFAULT_PLAN_GRID: PlanGridPrefs = { visible: true, step: 0 }

const KEY = 'rhk_user_prefs'

const DEFAULT_CABINET_VIEW_STYLES: CabinetViewStyles = {
  top:       'wire',
  elevation: 'wire',
  side:      'wire',
  '3d':      'wire',
}

const DEFAULTS: UserPrefs = {
  invertScroll: false,
  layerSetId:        '',
  cabinetViewStyles: DEFAULT_CABINET_VIEW_STYLES,
  snapSettings:     DEFAULT_SNAP_SETTINGS,
  elevSnapSettings: DEFAULT_ELEV_SNAP_SETTINGS,
  optimiserPartCols: null,
  includeBandingInPartSize: true,
  planGrid: DEFAULT_PLAN_GRID,
}

// Legacy fields: per-view `drawingPresets.plan` and the older singular
// `defaultDrawingPreset` (preset keys like 'full_parts'). The plan choice wins.
function normaliseLayerSetId(stored: Record<string, unknown>): string {
  const pick = (v: unknown) => (typeof v === 'string' && v ? v : null)
  const dp = (stored.drawingPresets ?? {}) as Record<string, unknown>
  return pick(stored.layerSetId) ?? pick(dp.plan) ?? pick(stored.defaultDrawingPreset) ?? ''
}

function normalisePlanGrid(raw: unknown): PlanGridPrefs {
  const r = (raw ?? {}) as Partial<PlanGridPrefs>
  const step = GRID_STEPS.includes(r.step as (typeof GRID_STEPS)[number]) ? r.step! : 0
  return { visible: r.visible ?? DEFAULT_PLAN_GRID.visible, step }
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
      layerSetId:        normaliseLayerSetId(stored),
      cabinetViewStyles: normaliseCabinetViewStyles(stored.cabinetViewStyles),
      snapSettings:     normaliseSnapSettings(merged.snapSettings),
      elevSnapSettings: normaliseElevSnapSettings(merged.elevSnapSettings),
      planGrid:         normalisePlanGrid(merged.planGrid),
    }
  } catch {
    return DEFAULTS
  }
}

export function setUserPrefs(prefs: Partial<UserPrefs>): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(KEY, JSON.stringify({ ...getUserPrefs(), ...prefs }))
}
