// ============================================================
// CNC tool cross-section geometry.
// Pure, framework-free. Turns a cnc_tools.shape_profile
// ({ type, params }) into a 2-D side-on silhouette (mm, y-up,
// tip at the origin) plus a shank rectangle.
//
// Used by the Tool Library shape editor preview (Step 3) and,
// later, the Phase 2 toolpath simulator to draw the tool head.
// Keep this free of React / DOM so both can share it.
// ============================================================

export type ToolShapeType =
  | 'straight' | 'vbit' | 'roundover' | 'cove' | 'rebate' | 't_slot' | 'drill'

export interface ToolShape {
  type: ToolShapeType
  params: Record<string, number>
}

// tool_type (DB check constraint) → cross-section family.
// chamfer shares the V-bit geometry; the plain cutters are straight.
export const SHAPE_FOR_TOOL_TYPE: Record<string, ToolShapeType> = {
  compression: 'straight', upcut: 'straight', downcut: 'straight', other: 'straight',
  vbit: 'vbit', chamfer: 'vbit',
  roundover: 'roundover', cove: 'cove', rebate: 'rebate', t_slot: 't_slot', drill: 'drill',
}

export interface ParamDef { key: string; label: string; default: number; step?: number }

// Type-specific params shown in the shape editor. `diameter` and
// `cutting_length` are edited via the tool's own fields, so they are
// NOT repeated here — they are merged in at render/save time.
export const SHAPE_EXTRA_PARAMS: Record<ToolShapeType, ParamDef[]> = {
  straight: [],
  vbit:      [{ key: 'angle_deg', label: 'Included angle°', default: 90 },
              { key: 'tip_diameter', label: 'Tip dia', default: 0.2, step: 0.1 }],
  roundover: [{ key: 'radius', label: 'Radius', default: 4 }],
  cove:      [{ key: 'radius', label: 'Radius', default: 5 }],
  rebate:    [{ key: 'rebate_depth', label: 'Rebate depth', default: 6 },
              { key: 'rebate_width', label: 'Rebate width', default: 8 }],
  t_slot:    [{ key: 'shank_diameter', label: 'Shank dia', default: 6 },
              { key: 'slot_diameter', label: 'Slot dia', default: 12 },
              { key: 'slot_height', label: 'Slot height', default: 4 }],
  drill:     [{ key: 'point_angle_deg', label: 'Point angle°', default: 118 }],
}

export function shapeTypeFor(toolType: string | null | undefined): ToolShapeType {
  return SHAPE_FOR_TOOL_TYPE[toolType ?? ''] ?? 'straight'
}

// Build the extra-param defaults for a shape type, optionally carrying
// existing values forward so changing tool_type keeps compatible params.
export function defaultExtraParams(type: ToolShapeType, carry?: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const p of SHAPE_EXTRA_PARAMS[type]) {
    out[p.key] = carry && Number.isFinite(carry[p.key]) ? carry[p.key] : p.default
  }
  return out
}

export interface Pt { x: number; y: number }
export interface ProfileGeometry {
  outline: Pt[]                                   // closed silhouette, mm, y-up, tip at origin
  shank: { halfW: number; bottom: number; top: number }
  widthMm: number
  heightMm: number
}

const num = (v: unknown, fallback: number) => (Number.isFinite(v as number) ? (v as number) : fallback)

function sampleArc(cx: number, cy: number, r: number, a0: number, a1: number, steps = 16): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * (i / steps)
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
  }
  return out
}

// Right-half edge, from the centreline at the tip outward and up to the
// top-right of the cutting body. Mirrored to form the closed outline.
function rightEdge(type: ToolShapeType, p: Record<string, number>, body: number): Pt[] {
  const d = num(p.diameter, 8)
  const r = d / 2
  switch (type) {
    case 'straight':
      return [{ x: 0, y: 0 }, { x: r, y: 0 }, { x: r, y: body }]

    case 'drill': {
      const pa = num(p.point_angle_deg, 118)
      const half = (pa / 2) * (Math.PI / 180)         // half-angle from axis
      const coneH = Math.min(body, r / Math.tan(half))
      return [{ x: 0, y: 0 }, { x: r, y: coneH }, { x: r, y: body }]
    }
    case 'vbit': {
      const a = num(p.angle_deg, 90)
      const t = num(p.tip_diameter, 0.2)
      const half = (a / 2) * (Math.PI / 180)
      const coneH = Math.min(body, (r - t / 2) / Math.tan(half))
      return [{ x: 0, y: 0 }, { x: t / 2, y: 0 }, { x: r, y: coneH }, { x: r, y: body }]
    }
    case 'rebate': {
      const rd = num(p.rebate_depth, 6)
      const rw = num(p.rebate_width, 8)
      const inner = Math.max(0, r - rw)
      return [{ x: 0, y: 0 }, { x: inner, y: 0 }, { x: inner, y: rd }, { x: r, y: rd }, { x: r, y: body }]
    }
    case 't_slot': {
      const sld = num(p.slot_diameter, num(p.diameter, 12))
      const sd = num(p.shank_diameter, sld * 0.5)
      const sh = num(p.slot_height, 4)
      return [{ x: 0, y: 0 }, { x: sld / 2, y: 0 }, { x: sld / 2, y: sh }, { x: sd / 2, y: sh }, { x: sd / 2, y: body }]
    }
    case 'roundover': {
      const rr = Math.min(num(p.radius, 4), r)
      const inner = Math.max(0, r - rr)
      const arc = sampleArc(inner, rr, rr, -Math.PI / 2, 0)   // convex bulge at the corner
      return [{ x: 0, y: 0 }, { x: inner, y: 0 }, ...arc, { x: r, y: body }]
    }
    case 'cove': {
      const rr = num(p.radius, 5)
      const maxX = Math.min(r, rr)
      // concave scoop: y = rr - sqrt(rr² - x²)
      const arc: Pt[] = []
      const steps = 16
      for (let i = 0; i <= steps; i++) {
        const x = (maxX * i) / steps
        arc.push({ x, y: rr - Math.sqrt(Math.max(0, rr * rr - x * x)) })
      }
      const tail: Pt[] = maxX < r ? [{ x: r, y: rr }] : []
      return [...arc, ...tail, { x: r, y: body }]
    }
  }
}

export function buildProfile(shape: ToolShape): ProfileGeometry {
  const p = shape.params ?? {}
  const d = num(p.diameter, 8)
  const slotD = shape.type === 't_slot' ? num(p.slot_diameter, d) : d
  const width = Math.max(d, slotD)
  const body = Math.max(num(p.cutting_length, 24), 6)

  const right = rightEdge(shape.type, p, body)
  // Close the loop: right edge up, across the top, mirror back down.
  const left = right.slice(0, -1).reverse().map(pt => ({ x: -pt.x, y: pt.y }))
  const outline = [...right, ...left]

  const shankHalf = num(p.shank_diameter, width * 0.55) / 2
  const shankLen = Math.max(body * 0.45, 8)

  return {
    outline,
    shank: { halfW: shankHalf, bottom: body, top: body + shankLen },
    widthMm: width,
    heightMm: body + shankLen,
  }
}
