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
  /** Seeded at placement from the class depth cascade (room → job → shop),
   *  e.g. an L corner's leg depths follow the run's base depth. */
  classDepth?: boolean
  /** Not shown in the Shape section (nominal values the shape is built with). */
  hidden?: boolean
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
  /** Built by another module, not offered in the Shape section (curved ends, z_curved_end). */
  internal?: boolean
  /** The vertices are formulas of the params only (never cab.w / cab.d), and the
   *  cabinet's box is the outline's bbox — set dx / dz from presetBox() whenever
   *  the footprint is (re)built (z_angled_filler). */
  boxFromShape?: boolean
}

/** One edge as its start vertex (formulas) + role. Arcs give a radius formula. */
interface PresetEdge {
  id: string
  x: string
  y: string
  role: EdgeRole
  arc?: { r: string }
  /** Face filler on this edge: param keys for its visible width and cleat depth. */
  filler?: { width: string; cleat: string }
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
    key: 'l_corner', label: 'L corner (pie)', modifier: null, sided: true,
    params: [
      { key: 'leg_back', label: 'Leg depth on back wall',   default: 580, classDepth: true },
      { key: 'leg_side', label: 'Leg depth on return wall', default: 580, classDepth: true },
    ],
    // Two legs, square notch out of the front corner. As the diagonal corner:
    // `side` is the end AWAY from the room corner. back on the wall, end, front
    // of the back-wall leg (primary — first of the equal fronts), inside corner,
    // front of the return leg, its end, back against the return wall.
    build: side => [
      { id: 'back',   x: mx('0', side),          y: '0',          role: 'back' },
      { id: 'end',    x: mx('cab.w', side),      y: '0',          role: 'side' },
      { id: 'front',  x: mx('cab.w', side),      y: 'p.leg_back', role: 'front' },
      { id: 'front2', x: mx('p.leg_side', side), y: 'p.leg_back', role: 'front' },
      { id: 'end2',   x: mx('p.leg_side', side), y: 'cab.d',      role: 'side' },
      { id: 'back2',  x: mx('0', side),          y: 'cab.d',      role: 'back' },
    ],
  },
  {
    // z_angled_filler (BFKANG). Two mitred face fillers in an inside corner where
    // wall B turns `angle` into the room, over an optional support carcass. The
    // `side` is the end wall B is on. Vertices are formulas of the params only —
    // the box follows the shape (boxFromShape). Right hand, T = tan(θ/2):
    //   la = fill_a + rev + fo·T   carcass facet length so the face shows fill_a
    //   P  = (la, depth)            apex, C = (la + depth·T, 0) wall corner
    // fo / rev are the nominal face offset (door + FACBUF) and neighbour reveal;
    // the resolver keeps the visible width exact whatever they really are.
    key: 'angled_filler', label: 'Angled corner filler', modifier: null, sided: true, boxFromShape: true,
    params: [
      { key: 'angle',  label: 'Wall angle (°)',         default: 45 },
      { key: 'depth',  label: 'Depth',                  default: 580, classDepth: true },
      { key: 'fill_a', label: 'Filler width, this wall', default: 40 },
      { key: 'fill_b', label: 'Filler width, angled wall', default: 40 },
      { key: 'cleat',  label: 'Return cleat depth',     default: 50 },
      { key: 'fo',     label: 'Face offset',            default: 20, hidden: true },
      { key: 'rev',    label: 'Neighbour reveal',       default: 1, hidden: true },
    ],
    build: side => {
      const T = 'tan(p.angle / 2)', C = 'cos(p.angle)', S = 'sin(p.angle)'
      const la = `(p.fill_a + p.rev + p.fo * ${T})`, lb = `(p.fill_b + p.rev + p.fo * ${T})`
      const cx = `(${la} + p.depth * ${T})`, LB = `(p.depth * ${T} + ${lb})`
      const qx = `(${cx} + ${LB} * ${C})`, qy = `(${LB} * ${S})`
      const W = `max(${cx}, ${qx})`
      const x = (e: string) => side === 'right' ? e : e === '0' ? W : `${W} - ${e}`
      return [
        { id: 'back',   x: x('0'),                         y: '0',                          role: 'back' },
        { id: 'back2',  x: x(cx),                          y: '0',                          role: 'back' },
        { id: 'side_b', x: x(qx),                          y: qy,                           role: 'side' },
        { id: 'fill_b', x: x(`(${qx} - p.depth * ${S})`),  y: `(${qy} + p.depth * ${C})`,  role: 'front',
          filler: { width: 'fill_b', cleat: 'cleat' } },
        { id: 'fill_a', x: x(la),                          y: 'p.depth',                    role: 'front',
          filler: { width: 'fill_a', cleat: 'cleat' } },
        { id: 'side_a', x: x('0'),                         y: 'p.depth',                    role: 'side' },
      ]
    },
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
  // Curved fixed-panel cabinet (z_curved_end): the face board's outline — the
  // front, its 90° curve and the exposed straight it wraps back along are
  // `front` (a benchtop overhangs all three, C5); the neighbour (fixing panel)
  // side is `side`. Built from curved_end settings
  // (curvedEnd/settings.ts), never picked in the Shape section.
  {
    key: 'curved_end', label: 'Curved end', modifier: null, sided: true, internal: true,
    params: [{ key: 'radius', label: 'Radius', default: 150 }],
    build: side => [
      { id: 'back',  x: mx('0', side),                y: '0',                role: 'back' },
      { id: 'end',   x: mx('cab.w', side),            y: '0',                role: 'front' },
      { id: 'curve', x: mx('cab.w', side),            y: 'cab.d - p.radius', role: 'front', arc: { r: 'p.radius' } },
      { id: 'front', x: mx('cab.w - p.radius', side), y: 'cab.d',            role: 'front' },
      { id: 'side',  x: mx('0', side),                y: 'cab.d',            role: 'side' },
    ],
  },
  {
    key: 'curved_end_double', label: 'Curved both ends', modifier: null, sided: false, internal: true,
    params: [{ key: 'radius', label: 'Radius', default: 150 }],
    // both exposed straights are `front` too (benchtop overhang, C5)
    // width = 2 × radius leaves a zero-length front, which consumers drop (isDegenerate)
    build: () => [
      { id: 'back',    x: '0',                y: '0',                role: 'back' },
      { id: 'end_r',   x: 'cab.w',            y: '0',                role: 'front' },
      { id: 'curve_r', x: 'cab.w',            y: 'cab.d - p.radius', role: 'front', arc: { r: 'p.radius' } },
      { id: 'front',   x: 'cab.w - p.radius', y: 'cab.d',            role: 'front' },
      { id: 'curve_l', x: 'p.radius',         y: 'cab.d',            role: 'front', arc: { r: 'p.radius' } },
      { id: 'end_l',   x: '0',                y: 'cab.d - p.radius', role: 'front' },
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
    edge: {
      id: e.id, role: e.role,
      ...(e.filler ? { filler: { width: Number(full[e.filler.width]) || 0, cleat: Number(full[e.filler.cleat]) || 0 } } : {}),
    },
  }))
  const fp: Footprint = {
    preset: preset.key, params: full, from_preset: preset.key, segments,
    ...(roleOverrides && Object.keys(roleOverrides).length ? { role_overrides: roleOverrides } : {}),
  }
  // Fill the numeric cache so readers that skip evaluation still see sane numbers.
  return withRoleOverrides({ ...fp, segments: evaluateFootprint(fp, dims) })
}

/**
 * At placement: set the preset's class-depth params (L corner legs) to the
 * cascaded class depth and rebuild. Faces, role overrides and flush ends key
 * off stable edge ids, so they carry over. Anything else comes back unchanged.
 */
export function seedClassDepthParams(fp: Footprint | null, depth: number | null | undefined, dims: FootprintDims): Footprint | null {
  const preset = getPreset(fp?.preset)
  if (!fp || !preset || !(depth != null && depth > 0)) return fp
  const keys = preset.params.filter(d => d.classDepth).map(d => d.key)
  if (!keys.length) return fp
  const params = { ...fp.params, ...Object.fromEntries(keys.map(k => [k, depth])) }
  const next = buildPresetFootprint(preset.key, params, dims, fp.role_overrides)
  return next && fp.flush_ends?.length ? { ...next, flush_ends: fp.flush_ends } : next
}

/**
 * The box of a boxFromShape preset (z_angled_filler): the outline's bbox, with
 * the outline's min corner at 0, 0. Null for any other footprint — those take
 * their shape from the box, not the other way round.
 */
export function presetBox(fp: Footprint | null | undefined): FootprintDims | null {
  const preset = getPreset(fp?.preset)
  if (!fp || !preset?.boxFromShape) return null
  // The vertices ignore cab.w / cab.d, so any dims evaluate the same outline.
  const pts = evaluateFootprint(fp, { w: 0, d: 0 }).map(s => s.p0)
  if (pts.length < 3) return null
  const w = Math.max(...pts.map(q => q.x)), d = Math.max(...pts.map(q => q.y))
  return w > 0 && d > 0 ? { w: Math.round(w * 10) / 10, d: Math.round(d * 10) / 10 } : null
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
    case 'l_corner':
      if (n('leg_back') >= dims.d) out.push('Back-wall leg is as deep as the cabinet')
      if (n('leg_side') >= dims.w) out.push('Return leg is as deep as the cabinet is wide')
      break
    case 'angled_filler':
      if (n('angle') < 5 || n('angle') > 90) out.push('Wall angle must be between 5° and 90°')
      if (n('fill_a') < 10 || n('fill_b') < 10) out.push('Filler narrower than 10 mm')
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
