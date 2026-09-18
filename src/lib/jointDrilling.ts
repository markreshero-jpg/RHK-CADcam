// Carcase joint drilling geometry — shared between the 3D view (Cabinet3DView)
// and the 2D ortho SVG views (ResolvedViews). Pure functions, no rendering.
//
// Cabinet origin = bottom-left-back corner (+X=right, +Y=up, +Z=front).
// seamDrillOps() turns a resolved seam joint's operations into a flat list of
// hole positions in cabinet coordinates, each tagged with the drill axis so the
// consumer can render it (bore cylinder in 3D, circle/slot marker in 2D).

import type { Box } from '@/src/components/three/PartViewer'
import type { ResolvedCabinet, ResolvedCasePart, ResolvedInternalPart, ResolvedSeamJoint, JointTypeOp, ResolvedToekickPart } from '@/src/lib/resolver/types'

export function isSide(k: string) { return k === 'left_side' || k === 'right_side' }

// Cabinet-local plan footprint (X along wall, Z = depth) of a toe-kick part —
// shared by the plan canvas and the plan report; mirrors Room3DScene.tkBox.
export function tkPlanBox(p: ResolvedToekickPart) {
  return p.part_key === 'spreader_horizontal'
    ? { x: p.X, z: p.Z, w: p.DX, d: p.DZ }
    : { x: p.X, z: p.Z, w: p.DY, d: p.DZ }
}

// Cabinet-space bounding box for a case part. { x,y,z = min corner, w/h/d = X/Y/Z extents }.
export function caseBox(p: ResolvedCasePart): Box {
  if (isSide(p.part_key))
    return { x: p.X, y: p.Y, z: p.Z, w: p.DZ, h: p.DY, d: p.DX }
  if (p.part_key === 'back')
    return { x: p.X, y: p.Y + p.DZ, z: p.Z, w: p.DY, h: p.DX, d: p.DZ }
  return { x: p.X, y: p.Y, z: p.Z, w: p.DY, h: p.DZ, d: p.DX }
}

// Cabinet-space AABB for the internal parts that participate in seams. A divider
// is a vertical panel (thickness DZ along X, like a gable); shelves are
// horizontal (thickness DZ along Y, like the carcase bottom). Other internal
// parts (drawer/pull-out panels, accessories) carry no seams → null.
export function internalBox(p: ResolvedInternalPart): Box | null {
  switch (p.part_type) {
    case 'divider':
      return { x: p.X, y: p.Y, z: p.Z, w: p.DZ, h: p.DY, d: p.DX }
    case 'adj_shelf':
    case 'fixed_shelf':
      return { x: p.X, y: p.Y, z: p.Z, w: p.DY, h: p.DZ, d: p.DX }
    default:
      return null
  }
}

// Stable seam/box key for an internal part — matches the optimiser's
// source_part_key scheme (normalize.ts) so drills route to the same identity.
export const internalSeamPartKey = (p: ResolvedInternalPart) => `int_${p.part_type}_${p.sort_order}`

export type DrillAxis = 'x-' | 'x+' | 'y-' | 'y+' | 'z-' | 'z+'

export interface DrillOpPos {
  x: number; y: number; z: number
  axis: DrillAxis
  radius: number
  depthLen: number
  targetPartKey: string
  // Tool assignment copied from the owning JointTypeOp so downstream
  // consumers (e.g. the optimiser seam-drill sync) can carry it onto the
  // generated part_operations row. Optional — views ignore them.
  router_tool_id?: string | null
  drill_id?:       string | null
  auto_tool?:      boolean
}

// Expression evaluator: supports math globals + part-dimension variables.
function evalExpr(expr: string, vars: Record<string, number>): number | null {
  try {
    const fn = new Function(...Object.keys(vars), `'use strict'; return +(${expr})`)
    const result = fn(...Object.values(vars))
    return Number.isFinite(result) ? result : null
  } catch { return null }
}

// Resolve a JointTypeOp's numeric fields + qty/spacing against actual part dimensions.
// thickA/thickB = material thickness of each part (varies by panel orientation in caseBox).
// T resolves to the TARGET part's thickness so expressions like "T" mean "drill to my depth".
// Returns null if any expression-bearing field fails to evaluate — callers must skip the op.
function evalOp(op: JointTypeOp, boxA: Box, boxB: Box, thickA: number, thickB: number): {
  tool_diameter_mm: number; depth_mm: number
  offset_x_mm: number; offset_y_mm: number; offset_z_mm: number
  qty: number; spacing_mm: number | null
  qty2: number; spacing2_mm: number | null
} | null {
  const exprs = op.expressions ?? {}
  const isA   = op.target_part === 'part_a'
  const vars: Record<string, number> = {
    W:  isA ? boxA.w : boxB.w,
    L:  isA ? boxA.h : boxB.h,
    D:  isA ? boxA.d : boxB.d,
    T:  isA ? thickA : thickB,
    MW: boxA.w, ML: boxA.h, MD: boxA.d,
    SW: boxB.w, SL: boxB.h, SD: boxB.d,
  }
  const ev = (field: string, fallback: number): number | null =>
    exprs[field] != null ? evalExpr(exprs[field], vars) : fallback

  const tool  = ev('tool_diameter_mm', op.tool_diameter_mm)
  const depth = ev('depth_mm',         op.depth_mm)
  const ox    = ev('offset_x_mm',      op.offset_x_mm)
  const oy    = ev('offset_y_mm',      op.offset_y_mm)
  const oz    = ev('offset_z_mm',      op.offset_z_mm)
  if (tool === null || depth === null || ox === null || oy === null || oz === null) return null

  const rawQty = exprs.qty != null ? evalExpr(exprs.qty, vars) : (op.qty ?? 1)
  if (rawQty === null) return null
  const rawSpc = exprs.spacing_mm != null ? evalExpr(exprs.spacing_mm, vars) : op.spacing_mm
  if (exprs.spacing_mm != null && rawSpc === null) return null

  const rawQty2 = exprs.qty2 != null ? evalExpr(exprs.qty2, vars) : (op.qty2 ?? 1)
  if (rawQty2 === null) return null
  const rawSpc2 = exprs.spacing2_mm != null ? evalExpr(exprs.spacing2_mm, vars) : op.spacing2_mm
  if (exprs.spacing2_mm != null && rawSpc2 === null) return null

  return {
    tool_diameter_mm: tool,
    depth_mm:         depth,
    offset_x_mm:      ox,
    offset_y_mm:      oy,
    offset_z_mm:      oz,
    qty:              Math.max(1, Math.round(rawQty)),
    spacing_mm:       rawSpc,
    qty2:             Math.max(1, Math.round(rawQty2)),
    spacing2_mm:      rawSpc2,
  }
}

// 2nd-axis expansion: offsets centred on the joint line, matching the library
// preview (JointPreviewPanel). [0] when the op has no second axis.
function uSteps(qty2: number, spacing2: number | null): number[] {
  return (spacing2 != null && spacing2 > 0 && qty2 > 1)
    ? Array.from({ length: qty2 }, (_, j) => (j - (qty2 - 1) / 2) * spacing2)
    : [0]
}

// ── SeamFrame — edge-local coordinate frame ───────────────────────────────────
// Maps joint operation fields (offset_z_mm, offset_y_mm, spacing) to cabinet
// coordinates without any per-part-type special-casing. Works identically for
// horizontal panels (bottom, top, rail) and vertical panels (back).
interface SeamFrame {
  interfaceX:  number
  drillIntoA:  'x+' | 'x-'
  drillIntoB:  'x+' | 'x-'
  alongAxis:   'z' | 'y'
  alongOrigin: number
  insetAxis:   'y' | 'z'
  insetOrigin: number
  jointLength: number
  thickA:      number
  thickB:      number
}

function buildSeamFrame(partAKey: string, isLeft: boolean, boxA: Box, boxB: Box): SeamFrame {
  const interfaceX  = isLeft ? boxA.x : boxA.x + boxA.w
  const drillIntoA: 'x+' | 'x-' = isLeft ? 'x+' : 'x-'
  const drillIntoB: 'x+' | 'x-' = isLeft ? 'x-' : 'x+'
  const isVertical  = boxA.h > boxA.d

  const alongAxis:   'z' | 'y' = isVertical ? 'y' : 'z'
  const alongOrigin: number    = isVertical ? boxA.y + boxA.h : boxA.z + boxA.d

  const insetAxis:   'y' | 'z' = isVertical ? 'z' : 'y'
  const insetOrigin: number    = isVertical ? boxA.z + boxA.d : boxA.y + boxA.h

  const jointLength = isVertical ? boxA.h : boxA.d

  const thickA = isSide(partAKey) ? boxA.w : isVertical ? boxA.d : boxA.h
  const thickB = boxB.w

  return { interfaceX, drillIntoA, drillIntoB, alongAxis, alongOrigin, insetAxis, insetOrigin, jointLength, thickA, thickB }
}

// back:bottom seam — the back panel (Part A, vertical) meets the bottom panel
// (Part B, horizontal) along the cabinet width. Holes distribute along X.
function backBottomDrillOps(
  boxBack: Box, boxBottom: Box, ops: JointTypeOp[],
  mode: 'back_on_bottom' | 'butts_into_back',
): DrillOpPos[] {
  const result: DrillOpPos[] = []
  const jointLength = boxBack.w
  const evBack   = { ...boxBack,   d: jointLength }
  const evBottom = { ...boxBottom, d: jointLength }
  const thickBack   = boxBack.d
  const thickBottom = boxBottom.h

  const vertical    = mode === 'back_on_bottom'
  const backFrontZ  = boxBack.z + boxBack.d
  const bottomRearZ = boxBottom.z
  const backBottomY = boxBack.y
  const bottomTopY  = boxBottom.y + boxBottom.h

  for (const op of ops) {
    if (op.machine_operation !== 'drill') continue
    const isBack = op.target_part === 'part_a'
    const ev = evalOp(op, evBack, evBottom, thickBack, thickBottom)
    if (!ev) continue
    const spc = ev.spacing_mm ?? 0

    for (let i = 0; i < ev.qty; i++) {
      for (const du of uSteps(ev.qty2, ev.spacing2_mm)) {
        const x = boxBack.x + ev.offset_z_mm + i * spc
        const oy = ev.offset_y_mm + du
        let y = 0, z = 0
        let axis: DrillAxis

        if (vertical) {
          z = backFrontZ - oy
          if (isBack) { y = backBottomY; axis = 'y+' }
          else        { y = bottomTopY;  axis = 'y-' }
        } else {
          y = bottomTopY - oy
          if (isBack) { z = backFrontZ;  axis = 'z-' }
          else        { z = bottomRearZ; axis = 'z+' }
        }

        result.push({
          x, y, z, axis,
          radius: ev.tool_diameter_mm / 2,
          depthLen: ev.depth_mm,
          targetPartKey: isBack ? 'back' : 'bottom',
          router_tool_id: op.router_tool_id, drill_id: op.drill_id, auto_tool: op.auto_tool,
        })
      }
    }
  }
  return result
}

export function seamDrillOps(
  seamKey: string, boxA: Box, boxB: Box, ops: JointTypeOp[],
  opts?: {
    bottomBackJoin?: 'back_on_bottom' | 'butts_into_back'
    // Internal shelf seams: the seam key encodes the shelf edge, not the part
    // keys, so orientation and both real part keys come in explicitly.
    side?: 'left' | 'right'
    partAKey?: string
    partBKey?: string
    // Respect the authored depth on part_b normal-face drills instead of forcing
    // a through-bore. Set for adj-shelf seams: pins are stopped holes, unlike the
    // through-bolted carcase/fixed-shelf face drills.
    stoppedFaceDrills?: boolean
  },
): DrillOpPos[] {
  const colonIdx = seamKey.indexOf(':')
  const partAKey = opts?.partAKey ?? seamKey.slice(0, colonIdx)
  const partBKey = opts?.partBKey ?? seamKey.slice(colonIdx + 1)
  const isLeft   = opts?.side ? opts.side === 'left' : partBKey === 'left_side'

  if (seamKey === 'back:bottom') {
    return backBottomDrillOps(boxA, boxB, ops, opts?.bottomBackJoin ?? 'back_on_bottom')
  }
  if (!opts?.side && !isSide(partBKey)) return []

  const frame = buildSeamFrame(partAKey, isLeft, boxA, boxB)

  const evBoxA = { ...boxA, d: frame.jointLength }
  const evBoxB = { ...boxB, d: frame.jointLength }

  const result: DrillOpPos[] = []

  const setAlong = (pos: { x: number; y: number; z: number }, v: number) =>
    { if (frame.alongAxis === 'z') pos.z = v; else pos.y = v }
  const setInset = (pos: { x: number; y: number; z: number }, v: number) =>
    { if (frame.insetAxis === 'z') pos.z = v; else pos.y = v }

  for (const op of ops) {
    if (op.machine_operation !== 'drill') continue
    const ev = evalOp(op, evBoxA, evBoxB, frame.thickA, frame.thickB)
    if (!ev) continue

    const spc = ev.spacing_mm ?? 0
    // 2nd axis lands on the face-local U axis: the X offset for top/bottom
    // (Y-drill) faces, the inset (offset_y) axis for normal/end faces.
    const isYFace = op.face === 'top' || op.face === 'bottom'

    for (let i = 0; i < ev.qty; i++) {
      for (const du of uSteps(ev.qty2, ev.spacing2_mm)) {
        const pos = { x: 0, y: 0, z: 0 }
        let axis: DrillAxis = 'x-'

        const ox = ev.offset_x_mm + (isYFace ? du : 0)
        const oy = ev.offset_y_mm + (isYFace ? 0 : du)
        const alongCoord = frame.alongOrigin - ev.offset_z_mm - i * spc
        const insetCoord = frame.insetOrigin - oy

        if (op.target_part === 'part_a') {
          switch (op.face) {
            case 'normal':
              pos.x = frame.interfaceX; setAlong(pos, alongCoord); setInset(pos, insetCoord)
              axis = frame.drillIntoA
              break
            case 'end':
              pos.x = isLeft ? boxA.x + boxA.w : boxA.x; setAlong(pos, alongCoord); setInset(pos, insetCoord)
              axis = isLeft ? 'x-' : 'x+'
              break
            case 'top':
              pos.x = isLeft ? frame.interfaceX + ox : frame.interfaceX - ox
              pos.y = boxA.y + boxA.h; setAlong(pos, alongCoord)
              axis = 'y-'
              break
            case 'bottom':
              pos.x = isLeft ? frame.interfaceX + ox : frame.interfaceX - ox
              pos.y = boxA.y; setAlong(pos, alongCoord)
              axis = 'y+'
              break
            default: continue
          }
        } else {
          const bInner = isLeft ? boxB.x + boxB.w : boxB.x
          switch (op.face) {
            case 'normal':
              pos.x = bInner; setAlong(pos, alongCoord); setInset(pos, insetCoord)
              axis = frame.drillIntoB
              break
            case 'end':
              pos.x = isLeft ? boxB.x : boxB.x + boxB.w; setAlong(pos, alongCoord); setInset(pos, insetCoord)
              axis = isLeft ? 'x+' : 'x-'
              break
            case 'top':
              pos.x = isLeft ? bInner - ox : bInner + ox
              pos.y = boxB.y + boxB.h; setAlong(pos, alongCoord)
              axis = 'y-'
              break
            case 'bottom':
              pos.x = isLeft ? bInner - ox : bInner + ox
              pos.y = boxB.y; setAlong(pos, alongCoord)
              axis = 'y+'
              break
            default: continue
          }
        }

        const isFaceDrill = op.target_part === 'part_b' && op.face === 'normal'
                         && (axis === 'x-' || axis === 'x+')
        const depthLen    = isFaceDrill && !opts?.stoppedFaceDrills ? boxB.w : ev.depth_mm

        const targetPartKey = op.target_part === 'part_a' ? partAKey : partBKey
        result.push({
          ...pos, axis, radius: ev.tool_diameter_mm / 2, depthLen, targetPartKey,
          router_tool_id: op.router_tool_id, drill_id: op.drill_id, auto_tool: op.auto_tool,
        })
      }
    }
  }

  return result
}

// ── Divider end seams (divider:top / divider:bottom) ─────────────────────────
// The divider (Part A, vertical) meets a horizontal panel (Part B: bottom, top
// or a fixed shelf) along its depth. Holes distribute along Z from the divider's
// front edge (offset_z / qty / spacing); offset_y is measured from the divider's
// +X face across its thickness (T/2 centres), and the 2nd axis fans across the
// same axis. Face is ignored (like back:bottom): part_a ops bore into the
// divider's end grain, part_b ops into the panel at the seam plane.
function dividerSeamDrillOps(
  edge: 'top' | 'bottom',
  boxA: Box, boxB: Box, ops: JointTypeOp[],
  partAKey: string, partBKey: string,
): DrillOpPos[] {
  const result: DrillOpPos[] = []
  const evA = boxA
  const evB = { ...boxB, d: boxA.d }   // joint length = divider depth
  const thickA = boxA.w
  const thickB = boxB.h
  const interfaceY  = edge === 'bottom' ? boxA.y : boxA.y + boxA.h
  const insetOrigin = boxA.x + boxA.w
  const alongOrigin = boxA.z + boxA.d

  for (const op of ops) {
    if (op.machine_operation !== 'drill') continue
    const isA = op.target_part === 'part_a'
    const ev = evalOp(op, evA, evB, thickA, thickB)
    if (!ev) continue
    const spc = ev.spacing_mm ?? 0

    for (let i = 0; i < ev.qty; i++) {
      for (const du of uSteps(ev.qty2, ev.spacing2_mm)) {
        const z = alongOrigin - ev.offset_z_mm - i * spc
        const x = insetOrigin - (ev.offset_y_mm + du)
        const axis: DrillAxis = isA
          ? (edge === 'bottom' ? 'y+' : 'y-')   // up/down into the divider's end
          : (edge === 'bottom' ? 'y-' : 'y+')   // into the panel from the seam plane
        result.push({
          x, y: interfaceY, z, axis,
          radius: ev.tool_diameter_mm / 2,
          depthLen: ev.depth_mm,
          targetPartKey: isA ? partAKey : partBKey,
          router_tool_id: op.router_tool_id, drill_id: op.drill_id, auto_tool: op.auto_tool,
        })
      }
    }
  }
  return result
}

// Full-bank adj-shelf drilling (ADJ_DRILL: 'full_bank'): one pitch-snapped run
// of holes per compartment support face, replacing the per-shelf clusters.
// The joint still supplies everything else — Ø, depth, the front/back columns
// (offset_z / qty / spacing) and the pitch (spacing2, default 32). Only part_b
// (support-face) drill ops apply; per-shelf fields (offset_y, qty2) and part_a
// shelf ops are ignored, since the bank exists independently of shelf count.
// The run is centred in the bank extent: n = floor(extent / pitch) holes.
function bankDrillOps(
  side: 'left' | 'right', bank: { y0: number; y1: number },
  boxA: Box, boxB: Box, ops: JointTypeOp[], partBKey: string,
  rowsOverride?: number,
): DrillOpPos[] {
  const out: DrillOpPos[] = []
  const isLeft = side === 'left'
  const evB = { ...boxB, d: boxA.d }
  const thickA = boxA.h
  const thickB = boxB.w
  const bInner = isLeft ? boxB.x + boxB.w : boxB.x
  const axis: DrillAxis = isLeft ? 'x-' : 'x+'
  const alongOrigin = boxA.z + boxA.d
  const usable = bank.y1 - bank.y0
  if (usable <= 0) return out

  for (const op of ops) {
    if (op.machine_operation !== 'drill' || op.target_part !== 'part_b') continue
    const ev = evalOp(op, boxA, evB, thickA, thickB)
    if (!ev) continue
    const pitch = (ev.spacing2_mm != null && ev.spacing2_mm > 0) ? ev.spacing2_mm : 32
    // Rows override wins over the auto pitch-fill, clamped so the run still
    // fits the bank extent.
    const nAuto = Math.max(1, Math.floor(usable / pitch))
    const n = rowsOverride && rowsOverride > 0
      ? Math.max(1, Math.min(rowsOverride, Math.floor(usable / pitch) + 1))
      : nAuto
    const yStart = bank.y0 + (usable - (n - 1) * pitch) / 2
    const spc = ev.spacing_mm ?? 0

    for (let i = 0; i < ev.qty; i++) {
      const z = alongOrigin - ev.offset_z_mm - i * spc
      for (let j = 0; j < n; j++) {
        out.push({
          x: bInner, y: yStart + j * pitch, z, axis,
          radius: ev.tool_diameter_mm / 2,
          depthLen: ev.depth_mm,
          targetPartKey: partBKey,
          router_tool_id: op.router_tool_id, drill_id: op.drill_id, auto_tool: op.auto_tool,
        })
      }
    }
  }
  return out
}

// Dispatch a resolved seam joint to the right drilling geometry. Internal seams
// carry internal_edge + the real part keys on the joint record; carcase seams
// keep the legacy seam-key-driven path.
export function seamJointDrillOps(sj: ResolvedSeamJoint, boxA: Box, boxB: Box): DrillOpPos[] {
  switch (sj.internal_edge) {
    case 'top':
    case 'bottom':
      return dividerSeamDrillOps(sj.internal_edge, boxA, boxB, sj.ops, sj.part_a_key, sj.part_b_key)
    case 'left':
    case 'right': {
      if (sj.bank) return bankDrillOps(sj.internal_edge, sj.bank, boxA, boxB, sj.ops, sj.part_b_key, sj.rows_override)
      // Cluster mode rows override: replace each op's qty2 (and any qty2
      // expression) with the override; a joint authored without a 2nd axis
      // gets the default 32mm pitch so the extra rows have somewhere to go.
      const ops = sj.rows_override && sj.rows_override > 0
        ? sj.ops.map(o => {
            if (o.machine_operation !== 'drill') return o
            const ex = o.expressions ? { ...o.expressions } : null
            if (ex) delete ex.qty2
            return {
              ...o,
              qty2: sj.rows_override!,
              spacing2_mm: (o.spacing2_mm && o.spacing2_mm > 0) ? o.spacing2_mm : 32,
              expressions: ex && Object.keys(ex).length ? ex : null,
            }
          })
        : sj.ops
      return seamDrillOps(sj.seam_key, boxA, boxB, ops, {
        side: sj.internal_edge, partAKey: sj.part_a_key, partBKey: sj.part_b_key,
        // Adjustable shelves sit on stopped pin holes; fixed shelves keep the
        // carcase-style through face bore.
        stoppedFaceDrills: sj.part_a_key.startsWith('int_adj_shelf_'),
      })
    }
    default:
      return seamDrillOps(sj.seam_key, boxA, boxB, sj.ops, { bottomBackJoin: sj.bottom_back_join })
  }
}

// ── Convenience: all drills for a resolved cabinet ────────────────────────────

// Every seam-capable part box: case parts under their plain keys plus internal
// shelves/dividers under int_<type>_<sort> keys (the seam part_a/part_b_key
// vocabulary).
export function caseBoxByKey(rp: ResolvedCabinet): Record<string, Box> {
  const m: Record<string, Box> = {}
  for (const p of rp.case_parts) m[p.part_key] = caseBox(p)
  for (const p of rp.internal_parts ?? []) {
    const b = internalBox(p)
    if (b) m[internalSeamPartKey(p)] = b
  }
  return m
}

// Rotate a local offset by an Euler (degrees), matching three.js Matrix4
// makeRotationFromEuler order 'XYZ'. Shared by the 2D silhouette projection
// (cabinetEditSvgHelpers.rotatedBoxPolygon) and seam-drill orientation below so
// holes and the part they sit in rotate identically.
export function rotEulerXYZ(axDeg: number, ayDeg: number, azDeg: number, x: number, y: number, z: number): [number, number, number] {
  const D = Math.PI / 180
  const a = Math.cos(axDeg * D), b = Math.sin(axDeg * D)
  const c = Math.cos(ayDeg * D), d = Math.sin(ayDeg * D)
  const e = Math.cos(azDeg * D), f = Math.sin(azDeg * D)
  const ae = a * e, af = a * f, be = b * e, bf = b * f
  return [
    (c * e) * x + (-c * f) * y + (d) * z,
    (af + be * d) * x + (ae - bf * d) * y + (-b * c) * z,
    (bf - ae * d) * x + (be + af * d) * y + (a * c) * z,
  ]
}

const AXIS_VEC: Record<DrillAxis, [number, number, number]> = {
  'x+': [1, 0, 0], 'x-': [-1, 0, 0],
  'y+': [0, 1, 0], 'y-': [0, -1, 0],
  'z+': [0, 0, 1], 'z-': [0, 0, -1],
}

// Minimal shape of a per-part position/rotation override (see canvasDB.PartPosOverrides).
export interface PartPosOv { ox: number; oy: number; oz: number; oax?: number; oay?: number; oaz?: number }

export type SeamDrill = DrillOpPos & { source: 'cabinet' | 'method'; seamKey: string }

// A drill whose entry point and bore direction have been transformed by its owning
// (master) part's edit-modal override, with the bore direction carried as an explicit
// cabinet-space unit vector so 2D overlays can project a correctly-angled slot.
export type OrientedDrill = SeamDrill & { dir: [number, number, number] }

// A joint/operation is OWNED by its master part (part_a of the seam). The whole
// operation — both the holes bored into the master AND the holes it bores into the
// slave — moves and rotates rigidly with the master, pivoting about the master's
// reference corner exactly like its silhouette (rotatedBoxPolygon). This mirrors how
// operations will attach to a single part in the per-part operations module: the op
// lives on the part and travels with it. (Slave-side holes stay glued to the master's
// edge that touches the slave, rather than to the slave itself.)
export function orientSeamDrills(
  drills: SeamDrill[],
  boxByKey: Record<string, Box>,
  overrides: Record<string, PartPosOv> | undefined,
): OrientedDrill[] {
  return drills.map(d => {
    const base = AXIS_VEC[d.axis]
    // Master part = part_a, the left-hand side of the seam key (e.g. front_rail
    // in "front_rail:left_side"). Every hole in the seam follows this part.
    // Internal masters (int_adj_shelf_0, …) already carry their override key.
    const masterKey = d.seamKey.slice(0, d.seamKey.indexOf(':'))
    const ov   = overrides?.[masterKey.startsWith('int_') ? masterKey : `case_${masterKey}`]
    const box  = boxByKey[masterKey]
    if (!ov || !box) return { ...d, dir: base }

    const rot = !!(ov.oax || ov.oay || ov.oaz)
    const [lx, ly, lz] = [d.x - box.x, d.y - box.y, d.z - box.z]
    const [rx, ry, rz] = rot ? rotEulerXYZ(ov.oax ?? 0, ov.oay ?? 0, ov.oaz ?? 0, lx, ly, lz) : [lx, ly, lz]
    const dir = rot ? rotEulerXYZ(ov.oax ?? 0, ov.oay ?? 0, ov.oaz ?? 0, base[0], base[1], base[2]) : base
    return {
      ...d,
      x: box.x + (ov.ox ?? 0) + rx,
      y: box.y + (ov.oy ?? 0) + ry,
      z: box.z + (ov.oz ?? 0) + rz,
      dir,
    }
  })
}

// Merge opposing coincident bores — same target part, same axis line, same
// radius, entered from opposite faces — into a single through-bore when their
// combined depth crosses the panel. This is how a division drilled from both
// compartments (pin clusters or full banks that line up) becomes one through
// hole instead of two blind ones. Bores that line up but don't meet in the
// middle are left as two stopped holes.
export function coalesceOpposingDrills<T extends DrillOpPos>(
  drills: T[], boxByKey: Record<string, Box>,
): T[] {
  const r1 = (n: number) => Math.round(n * 10) / 10
  const byLine = new Map<string, T[]>()
  for (const d of drills) {
    const a = d.axis[0]
    const key = a === 'x' ? `${d.targetPartKey}|x|${r1(d.y)}|${r1(d.z)}|${r1(d.radius)}`
              : a === 'y' ? `${d.targetPartKey}|y|${r1(d.x)}|${r1(d.z)}|${r1(d.radius)}`
              :             `${d.targetPartKey}|z|${r1(d.x)}|${r1(d.y)}|${r1(d.radius)}`
    const arr = byLine.get(key)
    if (arr) arr.push(d); else byLine.set(key, [d])
  }

  const out: T[] = []
  for (const group of byLine.values()) {
    if (group.length < 2) { out.push(...group); continue }
    const box = boxByKey[group[0].targetPartKey]
    const ax  = group[0].axis[0]
    const ext = box ? (ax === 'x' ? box.w : ax === 'y' ? box.h : box.d) : null
    const plus  = group.filter(d => d.axis[1] === '+')
    const minus = group.filter(d => d.axis[1] === '-')
    if (ext == null || plus.length === 0 || minus.length === 0) { out.push(...group); continue }
    const deepPlus  = plus.reduce((a, b) => (a.depthLen >= b.depthLen ? a : b))
    const deepMinus = minus.reduce((a, b) => (a.depthLen >= b.depthLen ? a : b))
    if (deepPlus.depthLen + deepMinus.depthLen >= ext - 0.1) {
      out.push({ ...deepPlus, depthLen: ext })   // one through-bore replaces the pair(s)
    } else {
      out.push(...group)
    }
  }
  return out
}

// Flattens every seam joint into hole positions, tagged with the seam's source
// (cabinet override vs method default) for colour-coding in 2D views.
// Opposing coincident bores (e.g. both faces of a division) are coalesced into
// through-bores before returning.
export function cabinetSeamDrills(rp: ResolvedCabinet): SeamDrill[] {
  const boxByKey = caseBoxByKey(rp)
  const out: SeamDrill[] = []
  for (const sj of rp.seam_joints ?? []) {
    const bA = boxByKey[sj.part_a_key]
    const bB = boxByKey[sj.part_b_key]
    if (!bA || !bB) continue
    for (const d of seamJointDrillOps(sj, bA, bB)) {
      out.push({ ...d, source: sj.source, seamKey: sj.seam_key })
    }
  }
  return coalesceOpposingDrills(out, boxByKey)
}
