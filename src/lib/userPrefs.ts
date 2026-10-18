
import type { AnnotationStyle, StyleKey } from './annotations/style'
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
  /** Layers menu override: draw parts hidden per view (PART-HIDE-SPEC) anyway. */
  showHiddenParts:    boolean
  cabinetViewStyles:  CabinetViewStyles
  /** Room 3D view style (3D tab dropdown): solid or wire (see-through parts). */
  room3DStyle:        ViewStyle
  snapSettings:     SnapSettings
  elevSnapSettings: ElevSnapSettings
  /** Panel Optimiser Stage 2 part-table column order (persisted layout). */
  optimiserPartCols: string[] | null
  /** Part dimensions shown in the cabinet editor include edgebanding (finished
   *  size, the default). Off = show the cut (board) size, tape deducted. */
  includeBandingInPartSize: boolean
  /** Plan-view reference grid: dots drawn behind the drawing. */
  planGrid: PlanGridPrefs
  /** Wall draw tool settings (WallDrawPanel / DrawingPanel). */
  wallDraw: WallDrawPrefs
  /** Double-clicking a cabinet in plan or elevation opens the cabinet editor. */
  cabinetDoubleClickEdit: boolean
  /** Enter with one cabinet selected (plan or elevation) opens the cabinet editor. */
  cabinetEnterEdit: boolean
  /** Tutorial mode (z_tutorial): on/off + where the user is up to. */
  tutorial: TutorialPrefs
  /** CAD annotations (z_CAD_tool decision 7): last-used style per kind = the next item's default. */
  annotStyleDefaults: Partial<Record<StyleKey, AnnotationStyle>>
}

export interface TutorialPrefs {
  enabled: boolean
  lesson:  number
  step:    number
  /** Completed step keys, `${lessonId}/${stepId}`. */
  done:    string[]
  /** Panel folded down to its pill (kept across reloads). */
  minimised: boolean
}

export const DEFAULT_TUTORIAL: TutorialPrefs = { enabled: false, lesson: 0, step: 0, done: [], minimised: false }

export interface WallDrawPrefs {
  /** Chained line: each click finishes a wall and starts the next from its end. */
  chain: boolean
  /** Thickness (mm) for new walls. */
  thickness: number
  /** Angle snap step (°) while drawing; 0 = free. Shift always snaps to 5°. */
  angleStep: number
}

export const WALL_ANGLE_STEPS = [0, 15, 22.5, 45, 90] as const
export const DEFAULT_WALL_DRAW: WallDrawPrefs = { chain: true, thickness: 90, angleStep: 22.5 }

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
  showHiddenParts:   false,
  cabinetViewStyles: DEFAULT_CABINET_VIEW_STYLES,
  room3DStyle:       'solid',
  snapSettings:     DEFAULT_SNAP_SETTINGS,
  elevSnapSettings: DEFAULT_ELEV_SNAP_SETTINGS,
  optimiserPartCols: null,
  includeBandingInPartSize: true,
  planGrid: DEFAULT_PLAN_GRID,
  wallDraw: DEFAULT_WALL_DRAW,
  cabinetDoubleClickEdit: true,
  cabinetEnterEdit: true,
  tutorial: DEFAULT_TUTORIAL,
  annotStyleDefaults: {},
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

function normaliseWallDraw(raw: unknown): WallDrawPrefs {
  const r = (raw ?? {}) as Partial<WallDrawPrefs>
  return {
    chain:     typeof r.chain === 'boolean' ? r.chain : DEFAULT_WALL_DRAW.chain,
    thickness: typeof r.thickness === 'number' && r.thickness >= 10 ? r.thickness : DEFAULT_WALL_DRAW.thickness,
    angleStep: WALL_ANGLE_STEPS.includes(r.angleStep as (typeof WALL_ANGLE_STEPS)[number]) ? r.angleStep! : DEFAULT_WALL_DRAW.angleStep,
  }
}

function normaliseTutorial(raw: unknown): TutorialPrefs {
  const r = (raw ?? {}) as Partial<TutorialPrefs>
  const int = (v: unknown) => (typeof v === 'number' && v >= 0 ? Math.floor(v) : 0)
  return {
    enabled: r.enabled === true,
    lesson:  int(r.lesson),
    step:    int(r.step),
    done:    Array.isArray(r.done) ? r.done.filter((d): d is string => typeof d === 'string') : [],
    minimised: r.minimised === true,
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
      layerSetId:        normaliseLayerSetId(stored),
      cabinetViewStyles: normaliseCabinetViewStyles(stored.cabinetViewStyles),
      snapSettings:     normaliseSnapSettings(merged.snapSettings),
      elevSnapSettings: normaliseElevSnapSettings(merged.elevSnapSettings),
      planGrid:         normalisePlanGrid(merged.planGrid),
      wallDraw:         normaliseWallDraw(merged.wallDraw),
      tutorial:         normaliseTutorial(merged.tutorial),
      annotStyleDefaults: merged.annotStyleDefaults && typeof merged.annotStyleDefaults === 'object' ? merged.annotStyleDefaults : {},
    }
  } catch {
    return DEFAULTS
  }
}

export function setUserPrefs(prefs: Partial<UserPrefs>): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(KEY, JSON.stringify({ ...getUserPrefs(), ...prefs }))
}
