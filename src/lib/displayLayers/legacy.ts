// Resolving the active layer set from a stored preference.
// All sets live in drawing_layer_sets (all editable). The six former hard-coded
// presets were seeded as rows; old prefs may still hold their preset keys
// ('full_parts', 'builtin:full_parts').

import type { LayerSet } from './registry'

const LEGACY_PRESET_NAMES: Record<string, string> = {
  full_parts:     'Full parts',
  line_drawing:   'Line drawing',
  schematic:      'Schematic',
  design:         'Design',
  working:        'Working drawing',
  face_elevation: 'Face elevation',
}

export const DEFAULT_LAYER_SET_NAME = 'Full parts'

/** Set for a stored id / legacy preset key → by-name fallback → first set. */
export function findLayerSet(sets: LayerSet[], pref: string | null | undefined): LayerSet | undefined {
  if (!sets.length) return undefined
  const byId = pref ? sets.find(s => s.id === pref) : undefined
  if (byId) return byId
  const name = LEGACY_PRESET_NAMES[(pref ?? '').replace(/^builtin:/, '')] ?? DEFAULT_LAYER_SET_NAME
  return sets.find(s => s.name === name) ?? sets[0]
}
