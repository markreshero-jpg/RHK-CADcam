// ── Shaped-cabinet presets ────────────────────────────────────────────────────
// z_cabinet_shape/CABINET-SHAPE-SPEC.md "Preset list". A preset is a
// generator: params → a Footprint whose vertices are formulas of the cabinet
// size (cab.w, cab.d) and the params (p.*). Resizing keeps a 300 clip at 300
// (S-d). Edge ids are fixed per preset, so regenerating after a param change
// keeps faces and role overrides attached (decision 8).
//
// Frame: x along the width (0 = left side), y = depth (0 = back). The edge
// list runs back → right side → front → left side. `side` mirrors in x.

import {
  evaluateFootprint, withRoleOverrides,
  type EdgeRole, type Footprint, type FootprintDims, type FootprintSegment, type PresetParams,
} from './footprint'

export type ShapeSide = 'left' | 'right'

export interface PresetParamDef {
  key: string
  label: string
  default: number
}

export interface ShapePreset {
  key: string
  label: string
  /** Code modifier (decision 6). Diagonal corner uses its config code instead. */
  modifier: string | null
  params: PresetParamDef[]
  /** Does the shape sit at one end? Then a left/right choice is offered. */
  sided: boolean
  build: (side: ShapeSide) => PresetEdge[]
}

/** One edge as its start vertex (formulas) + role. Arcs give a radius formula. */
interface PresetEdge {
  id: string
  x: string
  y: string
  role: EdgeRole
  arc?: { r: string }
}

// Mirror an x formula for the left-hand version: x → cab.w - (x).
const mx = (x: string, side: ShapeSide) => side === 'right' ? x : x === '0' ? 'cab.w' : x === 'cab.w' ? '0' : `cab.w - (${x})`

export const SHAPE_PRESETS: ShapePreset[] = [
  {
    key: 'clipped_corner', label: 'Clipped corner', modifier: 'CC', sided: true,
    params: [
      { key: 'clip_w', label: 'Clip along width', default: 300 },
      { key: 'clip_d', label: 'Clip along depth', default: 300 },
    ],
    // back, side (shortened), angled facet (front), front, other side
    build: side => [
      { id: 'back',  x: mx('0', side),              y: '0',              role: 'back' },
      { id: 'end',   x: mx('cab.w', side),          y: '0',              role: 'side' },
      { id: 'facet', x: mx('cab.w', side),          y: 'cab.d - p.clip_d', role: 'front' },
      { id: 'front', x: mx('cab.w - p.clip_w', side), y: 'cab.d',        role: 'front' },
      { id: 'side',  x: mx('0', side),              y: 'cab.d',          role: 'side' },
    ],
  },
  {
    key: 'angled_end', label: 'Angled end', modifier: 'AE', sided: true,
    params: [{ key: 'inset', label: 'Front inset at end', default: 200 }],
    // back, angled finished end, front (shortened), other side
    build: side => [
      { id: 'back',  x: mx('0', side),               y: '0',     role: 'back' },
      { id: 'end',   x: mx('cab.w', side),           y: '0',     role: 'side' },
      { id: 'front', x: mx('cab.w - p.inset', side), y: 'cab.d', role: 'front' },
      { id: 'side',  x: mx('0', side),               y: 'cab.d', role: 'side' },
    ],
  },
  {
    key: 'diagonal_corner', label: 'Diagonal corner', modifier: null, sided: true,
    params: [
      { key: 'return_end',    label: 'Return depth at end', default: 580 },
      { key: 'return_corner', label: 'Return depth at corner', default: 580 },
    ],
    // The `side` is the end AWAY from the room corner. back on the wall, short
    // return side, diagonal front, short side, back against the other wall.
    build: side => [
      { id: 'back',   x: mx('0', side),                   y: '0',                role: 'back' },
      { id: 'end',    x: mx('cab.w', side),               y: '0',                role: 'side' },
      { id: 'facet',  x: mx('cab.w', side),               y: 'p.return_end',     role: 'front' },
      { id: 'side',   x: mx('p.return_corner', side),     y: 'cab.d',            role: 'side' },
      { id: 'back2',  x: mx('0', side),                   y: 'cab.d',            role: 'back' },
    ],
  },
  {
    key: 'radius_end', label: 'Radius end', modifier: 'RE', sided: true,
    params: [{ key: 'radius', label: 'Radius', default: 300 }],
    // back, side (shortened, zero when radius = depth), quarter-round open end, front, other side
    build: side => [
      { id: 'back',  x: mx('0', side),                y: '0',                role: 'back' },
      { id: 'end',   x: mx('cab.w', side),            y: '0',                role: 'side' },
      { id: 'curve', x: mx('cab.w', side),            y: 'cab.d - p.radius', role: 'open', arc: { r: 'p.radius' } },
      { id: 'front', x: mx('cab.w - p.radius', side), y: 'cab.d',            role: 'front' },
      { id: 'side',  x: mx('0', side),                y: 'cab.d',            role: 'side' },
    ],
  },
  {
    key: 'trapezoid', label: 'Trapezoid', modifier: 'TZ', sided: false,
    params: [
      { key: 'inset_l', label: 'Front inset left', default: 100 },
      { key: 'inset_r', label: 'Front inset right', default: 100 },
    ],
    build: () => [
      { id: 'back',  x: '0',                   y: '0',     role: 'back' },
      { id: 'right', x: 'cab.w',               y: '0',     role: 'side' },
      { id: 'front', x: 'cab.w - p.inset_r',   y: 'cab.d', role: 'front' },
      { id: 'left',  x: 'p.inset_l',           y: 'cab.d', role: 'side' },
    ],
  },
]

export function getPreset(key: string | null | undefined): ShapePreset | undefined {
  return SHAPE_PRESETS.find(p => p.key === key)
}

export function presetDefaults(preset: ShapePreset): PresetParams {
  const out: PresetParams = { side: 'right' }
  for (const d of preset.params) out[d.key] = d.default
  return out
}

/**
 * Build a footprint from a preset. Params missing from `params` take their
 * defaults; `roleOverrides` are carried over (keyed by stable edge id).
 */
export function buildPresetFootprint(
  presetKey: string,
  params: PresetParams,
  dims: FootprintDims,
  roleOverrides?: Record<string, EdgeRole>,
): Footprint | null {
  const preset = getPreset(presetKey)
  if (!preset) return null
  const full = { ...presetDefaults(preset), ...params }
  const side: ShapeSide = full.side === 'left' ? 'left' : 'right'
  const edges = preset.build(side)
  // Left-hand: mirroring in x reverses the winding, so the arc sweeps the other way.
  const sweep: 0 | 1 = side === 'right' ? 1 : 0
  const segments: FootprintSegment[] = edges.map(e => ({
    type: e.arc ? 'arc' : 'line',
    p0: { x: 0, y: 0 }, p1: { x: 0, y: 0 },
    p0_expr: { x: e.x, y: e.y },
    ...(e.arc ? { r_expr: e.arc.r, rx: 0, ry: 0, largeArc: 0 as const, sweep } : {}),
    edge: { id: e.id, role: e.role },
  }))
  const fp: Footprint = {
    preset: preset.key, params: full, from_preset: preset.key, segments,
    ...(roleOverrides && Object.keys(roleOverrides).length ? { role_overrides: roleOverrides } : {}),
  }
  // Fill the numeric cache so readers that skip evaluation still see sane numbers.
  return withRoleOverrides({ ...fp, segments: evaluateFootprint(fp, dims) })
}

/** Shape problems worth showing the user (the preset still builds). */
export function presetWarnings(presetKey: string, params: PresetParams, dims: FootprintDims): string[] {
  const n = (k: string) => Number(params[k] ?? 0)
  const out: string[] = []
  switch (presetKey) {
    case 'clipped_corner':
      if (n('clip_w') >= dims.w) out.push('Clip is wider than the cabinet')
      if (n('clip_d') >= dims.d) out.push('Clip is deeper than the cabinet')
      break
    case 'angled_end':
      if (n('inset') >= dims.w) out.push('Inset is wider than the cabinet')
      break
    case 'diagonal_corner':
      if (n('return_end') >= dims.d) out.push('End return is as deep as the cabinet')
      if (n('return_corner') >= dims.w) out.push('Corner return is as wide as the cabinet')
      break
    case 'radius_end':
      if (n('radius') > Math.min(dims.w, dims.d)) out.push('Radius is larger than the cabinet width or depth')
      break
    case 'trapezoid':
      if (n('inset_l') + n('inset_r') >= dims.w) out.push('Insets meet — no front left')
      break
  }
  return out
}
