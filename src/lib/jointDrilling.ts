// Carcase joint drilling geometry — shared between the 3D view (Cabinet3DView)
// and the 2D ortho SVG views (ResolvedViews). Pure functions, no rendering.
//
// Cabinet origin = bottom-left-back corner (+X=right, +Y=up, +Z=front).
// seamDrillOps() turns a resolved seam joint's operations into a flat list of
// hole positions in cabinet coordinates, each tagged with the drill axis so the
// consumer can render it (bore cylinder in 3D, circle/slot marker in 2D).

import type { Box } from '@/src/components/three/PartViewer'
import type { ResolvedCabinet, ResolvedCasePart, JointTypeOp } from '@/src/lib/resolver/types'

export function isSide(k: string) { return k === 'left_side' || k === 'right_side' }

// Cabinet-space bounding box for a case part. { x,y,z = min corner, w/h/d = X/Y/Z extents }.
export function caseBox(p: ResolvedCasePart): Box {
  if (isSide(p.part_key))
    return { x: p.X, y: p.Y, z: p.Z, w: p.DZ, h: p.DY, d: p.DX }
  if (p.part_key === 'back')
    return { x: p.X, y: p.Y + p.DZ, z: p.Z, w: p.DY, h: p.DX, d: p.DZ }
  return { x: p.X, y: p.Y, z: p.Z, w: p.DY, h: p.DZ, d: p.DX }
}

export type DrillAxis = 'x-' | 'x+' | 'y-' | 'y+' | 'z-' | 'z+'

export interface DrillOpPos {
  x: number; y: number; z: number
  axis: DrillAxis
  radius: number
  depthLen: number
  targetPartKey: string
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

  return {
    tool_diameter_mm: tool,
    depth_mm:         depth,
    offset_x_mm:      ox,
    offset_y_mm:      oy,
    offset_z_mm:      oz,
    qty:              Math.max(1, Math.round(rawQty)),
    spacing_mm:       rawSpc,
  }
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

function buildSeamFrame(seamKey: string, boxA: Box, boxB: Box): SeamFrame | null {
  const partAKey   = seamKey.slice(0, seamKey.indexOf(':'))
  const partBKey   = seamKey.slice(seamKey.indexOf(':') + 1)
  const isLeft     = partBKey === 'left_side'
  if (!isLeft && partBKey !== 'right_side') return null

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
      const x = boxBack.x + ev.offset_z_mm + i * spc
      let y = 0, z = 0
      let axis: DrillAxis

      if (vertical) {
        z = backFrontZ - ev.offset_y_mm
        if (isBack) { y = backBottomY; axis = 'y+' }
        else        { y = bottomTopY;  axis = 'y-' }
      } else {
        y = bottomTopY - ev.offset_y_mm
        if (isBack) { z = backFrontZ;  axis = 'z-' }
        else        { z = bottomRearZ; axis = 'z+' }
      }

      result.push({
        x, y, z, axis,
        radius: ev.tool_diameter_mm / 2,
        depthLen: ev.depth_mm,
        targetPartKey: isBack ? 'back' : 'bottom',
      })
    }
  }
  return result
}

export function seamDrillOps(
  seamKey: string, boxA: Box, boxB: Box, ops: JointTypeOp[],
  opts?: { bottomBackJoin?: 'back_on_bottom' | 'butts_into_back' },
): DrillOpPos[] {
  const colonIdx = seamKey.indexOf(':')
  const partAKey = seamKey.slice(0, colonIdx)
  const partBKey = seamKey.slice(colonIdx + 1)
  const isLeft   = partBKey === 'left_side'

  if (partBKey === 'bottom') {
    return backBottomDrillOps(boxA, boxB, ops, opts?.bottomBackJoin ?? 'back_on_bottom')
  }

  const frame = buildSeamFrame(seamKey, boxA, boxB)
  if (!frame) return []

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

    for (let i = 0; i < ev.qty; i++) {
      const pos = { x: 0, y: 0, z: 0 }
      let axis: DrillAxis = 'x-'

      const alongCoord = frame.alongOrigin - ev.offset_z_mm - i * spc
      const insetCoord = frame.insetOrigin - ev.offset_y_mm

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
            pos.x = isLeft ? frame.interfaceX + ev.offset_x_mm : frame.interfaceX - ev.offset_x_mm
            pos.y = boxA.y + boxA.h; setAlong(pos, alongCoord)
            axis = 'y-'
            break
          case 'bottom':
            pos.x = isLeft ? frame.interfaceX + ev.offset_x_mm : frame.interfaceX - ev.offset_x_mm
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
            pos.x = isLeft ? bInner - ev.offset_x_mm : bInner + ev.offset_x_mm
            pos.y = boxB.y + boxB.h; setAlong(pos, alongCoord)
            axis = 'y-'
            break
          case 'bottom':
            pos.x = isLeft ? bInner - ev.offset_x_mm : bInner + ev.offset_x_mm
            pos.y = boxB.y; setAlong(pos, alongCoord)
            axis = 'y+'
            break
          default: continue
        }
      }

      const isFaceDrill = op.target_part === 'part_b' && op.face === 'normal'
                       && (axis === 'x-' || axis === 'x+')
      const depthLen    = isFaceDrill ? boxB.w : ev.depth_mm

      const targetPartKey = op.target_part === 'part_a' ? partAKey : partBKey
      result.push({ ...pos, axis, radius: ev.tool_diameter_mm / 2, depthLen, targetPartKey })
    }
  }

  return result
}

// ── Convenience: all drills for a resolved cabinet ────────────────────────────

export function caseBoxByKey(rp: ResolvedCabinet): Record<string, Box> {
  const m: Record<string, Box> = {}
  for (const p of rp.case_parts) m[p.part_key] = caseBox(p)
  return m
}

export type SeamDrill = DrillOpPos & { source: 'cabinet' | 'method'; seamKey: string }

// Flattens every seam joint into hole positions, tagged with the seam's source
// (cabinet override vs method default) for colour-coding in 2D views.
export function cabinetSeamDrills(rp: ResolvedCabinet): SeamDrill[] {
  const boxByKey = caseBoxByKey(rp)
  const out: SeamDrill[] = []
  for (const sj of rp.seam_joints ?? []) {
    const bA = boxByKey[sj.part_a_key]
    const bB = boxByKey[sj.part_b_key]
    if (!bA || !bB) continue
    for (const d of seamDrillOps(sj.seam_key, bA, bB, sj.ops, { bottomBackJoin: sj.bottom_back_join })) {
      out.push({ ...d, source: sj.source, seamKey: sj.seam_key })
    }
  }
  return out
}
