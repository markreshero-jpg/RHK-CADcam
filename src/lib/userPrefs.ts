import { type SnapSettings, DEFAULT_SNAP_SETTINGS, normaliseSnapSettings } from './canvasSnap'

export type DrawingPreset = 'schematic' | 'design' | 'working' | 'face_elevation' | 'full_parts' | 'line_drawing'

export interface UserPrefs {
  invertScroll: boolean
  defaultDrawingPreset: DrawingPreset
  snapSettings: SnapSettings
}

const KEY = 'rhk_user_prefs'
const DEFAULTS: UserPrefs = { invertScroll: false, defaultDrawingPreset: 'full_parts', snapSettings: DEFAULT_SNAP_SETTINGS }

export function getUserPrefs(): UserPrefs {
  if (typeof window === 'undefined') return DEFAULTS
  try {
    const merged = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
    return { ...merged, snapSettings: normaliseSnapSettings(merged.snapSettings) }
  } catch {
    return DEFAULTS
  }
}

export function setUserPrefs(prefs: Partial<UserPrefs>): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(KEY, JSON.stringify({ ...getUserPrefs(), ...prefs }))
}
