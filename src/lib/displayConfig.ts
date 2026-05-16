// ── Display layer configuration ───────────────────────────────────────────────
// Controls which cabinet components are visible and how they are rendered.
// Presets map to common drawing types; layers can be toggled individually
// on top of a preset (activePreset becomes 'custom' when overridden).

export type LayerStyle = 'solid' | 'dashed' | 'ghost'

export interface LayerConfig {
  visible: boolean
  style: LayerStyle
}

export type LayerId =
  | 'carcass'          // cabinet box shell
  | 'face'             // doors, drawer fronts, end panels
  | 'internal'         // shelves, drawer boxes, internal fittings
  | 'toekick'          // plinth / kickboard
  | 'dimensions'       // cabinet inline size labels
  | 'labels'           // cabinet name labels
  | 'dim_wall_overall' // plan: overall wall length (outermost line)
  | 'dim_base_chain'   // plan: base cabinet segment chain
  | 'dim_wall_chain'   // plan: wall cabinet segment chain
  | 'dim_elevation_y'  // elevation: floor-to-ceiling height chain
  | 'dim_refs'         // elevation: reference lines (soffit, wall-unit top)

export type LayerSet = Record<LayerId, LayerConfig>

export type PresetId =
  | 'schematic'
  | 'design'
  | 'working'

  | 'face_elevation'
  | 'full_parts'
  | 'custom'

export interface DisplayConfig {
  activePreset: PresetId
  layers: LayerSet
}

// ── Presets ───────────────────────────────────────────────────────────────────

const L = (visible: boolean, style: LayerStyle): LayerConfig => ({ visible, style })

export const DISPLAY_PRESETS: Record<Exclude<PresetId, 'custom'>, { label: string; layers: LayerSet }> = {
  schematic: {
    label: 'Schematic',
    layers: {
      carcass:          L(true,  'solid'),
      face:             L(false, 'solid'),
      internal:         L(false, 'solid'),
      toekick:          L(false, 'solid'),
      dimensions:       L(true,  'solid'),
      labels:           L(true,  'solid'),
      dim_wall_overall: L(true,  'solid'),
      dim_base_chain:   L(true,  'solid'),
      dim_wall_chain:   L(true,  'solid'),
      dim_elevation_y:  L(true,  'solid'),
      dim_refs:         L(true,  'solid'),
    },
  },
  design: {
    label: 'Design',
    layers: {
      carcass:          L(true,  'solid'),
      face:             L(true,  'solid'),
      internal:         L(false, 'solid'),
      toekick:          L(true,  'solid'),
      dimensions:       L(true,  'solid'),
      labels:           L(true,  'solid'),
      dim_wall_overall: L(true,  'solid'),
      dim_base_chain:   L(true,  'solid'),
      dim_wall_chain:   L(true,  'solid'),
      dim_elevation_y:  L(true,  'solid'),
      dim_refs:         L(true,  'solid'),
    },
  },
  working: {
    label: 'Working drawing',
    layers: {
      carcass:          L(true,  'solid'),
      face:             L(true,  'solid'),
      internal:         L(true,  'dashed'),
      toekick:          L(true,  'solid'),
      dimensions:       L(true,  'solid'),
      labels:           L(true,  'solid'),
      dim_wall_overall: L(true,  'solid'),
      dim_base_chain:   L(true,  'solid'),
      dim_wall_chain:   L(true,  'solid'),
      dim_elevation_y:  L(true,  'solid'),
      dim_refs:         L(true,  'solid'),
    },
  },
  face_elevation: {
    label: 'Face elevation',
    layers: {
      carcass:          L(true,  'ghost'),
      face:             L(true,  'solid'),
      internal:         L(false, 'solid'),
      toekick:          L(true,  'solid'),
      dimensions:       L(true,  'solid'),
      labels:           L(true,  'solid'),
      dim_wall_overall: L(false, 'solid'),
      dim_base_chain:   L(false, 'solid'),
      dim_wall_chain:   L(false, 'solid'),
      dim_elevation_y:  L(true,  'solid'),
      dim_refs:         L(true,  'solid'),
    },
  },
  full_parts: {
    label: 'Full parts',
    layers: {
      carcass:          L(true,  'solid'),
      face:             L(true,  'solid'),
      internal:         L(true,  'solid'),
      toekick:          L(true,  'solid'),
      dimensions:       L(true,  'solid'),
      labels:           L(true,  'solid'),
      dim_wall_overall: L(true,  'solid'),
      dim_base_chain:   L(true,  'solid'),
      dim_wall_chain:   L(true,  'solid'),
      dim_elevation_y:  L(true,  'solid'),
      dim_refs:         L(true,  'solid'),
    },
  },
}

export const DEFAULT_DISPLAY_CONFIG: DisplayConfig = {
  activePreset: 'schematic',
  layers: DISPLAY_PRESETS.schematic.layers,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function applyPreset(presetId: Exclude<PresetId, 'custom'>): DisplayConfig {
  return { activePreset: presetId, layers: DISPLAY_PRESETS[presetId].layers }
}

/** Toggle a single layer on/off; marks activePreset as 'custom'. */
export function toggleLayer(config: DisplayConfig, id: LayerId): DisplayConfig {
  return {
    activePreset: 'custom',
    layers: {
      ...config.layers,
      [id]: { ...config.layers[id], visible: !config.layers[id].visible },
    },
  }
}

/** Cycle a layer's style: solid → dashed → ghost → solid. */
export function cycleLayerStyle(config: DisplayConfig, id: LayerId): DisplayConfig {
  const next: Record<LayerStyle, LayerStyle> = { solid: 'dashed', dashed: 'ghost', ghost: 'solid' }
  return {
    activePreset: 'custom',
    layers: {
      ...config.layers,
      [id]: { ...config.layers[id], style: next[config.layers[id].style] },
    },
  }
}

// ── SVG rendering helpers ─────────────────────────────────────────────────────

export interface LayerSVGProps {
  opacity: number
  strokeDasharray?: string   // undefined = solid
  fillOpacity: number
}

/**
 * Returns SVG visual properties for a given layer style at a given zoom level.
 * Zoom is needed so dash lengths stay visually consistent regardless of transform.
 */
export function layerSVGProps(style: LayerStyle, zoom: number): LayerSVGProps {
  switch (style) {
    case 'solid':
      return { opacity: 1, fillOpacity: 1 }
    case 'dashed':
      return { opacity: 1, strokeDasharray: `${8 / zoom} ${4 / zoom}`, fillOpacity: 0 }
    case 'ghost':
      return { opacity: 0.25, fillOpacity: 0.15 }
  }
}
