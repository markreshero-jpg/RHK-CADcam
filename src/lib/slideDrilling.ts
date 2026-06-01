// Drawer-slide drilling geometry — turns a slide's drill_ops into absolute
// cabinet-space hole positions. The slide analogue of jointDrilling.ts. Pure
// functions, no rendering.
//
// Cabinet origin = bottom-left-back corner (+X=right, +Y=up, +Z=front).
//
// A slide is positioned by resolveDrawerStack as a rail with:
//   X = outer edge of the runner (against the gable inner face)
//   Y = bottom of the slide channel (= drawer-box bottom line)
//   Z = back face of the runner
//   DX = nominal_length (runs back along Z), DY = channel height (Y),
//   DZ = runner_thickness (X)
// The rail FRONT is at Z = s.Z + s.DX (front of cabinet); it runs back to s.Z.
//
// Each op names a target_surface and gives two in-plane offsets:
//   along_off_mm — position from the surface's front/near datum
//   up_off_mm    — height (or across, for the bottom face)
// plus qty/spacing stepping in repeat_axis ('along' | 'up').
//
// Datums (agreed with the shop, undermount DTC Dragon Pro):
//   cabinet_member — drills into the gable inner face. along = from cabinet
//     FRONT going back; up = height from the drawer-box bottom line (s.Y).
//   drawer_bottom  — drills UP into the underside. along = from box front; up =
//     across the box width from the runner's inner edge.
//   drawer_back    — drills FRONT-ward into the back panel. along = across the
//     box width from the runner's inner edge; up = height from box floor.
//   drawer_front   — drills into the BACK of the visible face. along = across
//     the face from the runner's inner edge; up = height from box floor. Depth
//     is capped so it can't break through the face.

import type {
  ResolvedDrawerSlide, ResolvedDrawerStack, ResolvedSlideDrill,
  ResolvedDrawerBoxPart, ResolvedFaceZone,
  SlideDrillOp, SlideDrillAxis,
} from './resolver/types'

// The actual resolved geometry a slide's holes reference. Each op targets a real
// part (the back/bottom panel or the visible face), NOT a box envelope — that's
// the only way setbacks, dado heights, and face overhang land correctly.
export interface SlideDrillContext {
  backPart?:   ResolvedDrawerBoxPart   // db_back, cabinet space (absent on some boxes)
  bottomPart?: ResolvedDrawerBoxPart   // db_bottom, cabinet space
  sidePart?:   ResolvedDrawerBoxPart   // db side matching THIS rail (five-piece only)
  face:        ResolvedFaceZone        // the visible drawer face, cabinet space
}

// Expression evaluator — mirrors jointDrilling.evalExpr. Variables exposed:
//   NL (nominal length), BH (box height/channel), RT (runner thickness),
//   BW (drawer box width), BHt (drawer box height), BD (box depth).
function evalExpr(expr: string, vars: Record<string, number>): number | null {
  try {
    const fn = new Function(...Object.keys(vars), `'use strict'; return +(${expr})`)
    const result = fn(...Object.values(vars))
    return Number.isFinite(result) ? result : null
  } catch { return null }
}

interface EvOp {
  tool_diameter_mm: number; depth_mm: number
  along_off_mm: number; up_off_mm: number
  qty: number; spacing_mm: number
}

function evalOp(op: SlideDrillOp, vars: Record<string, number>): EvOp | null {
  const exprs = op.expressions ?? {}
  const ev = (field: string, fallback: number): number | null =>
    exprs[field] != null ? evalExpr(exprs[field], vars) : fallback

  const tool  = ev('tool_diameter_mm', op.tool_diameter_mm)
  const depth = ev('depth_mm',         op.depth_mm)
  const along = ev('along_off_mm',     op.along_off_mm)
  const up    = ev('up_off_mm',        op.up_off_mm)
  if (tool === null || depth === null || along === null || up === null) return null

  const rawQty = exprs.qty != null ? evalExpr(exprs.qty, vars) : op.qty
  if (rawQty === null) return null
  const rawSpc = exprs.spacing_mm != null ? evalExpr(exprs.spacing_mm, vars) : (op.spacing_mm ?? 0)
  if (exprs.spacing_mm != null && rawSpc === null) return null

  return {
    tool_diameter_mm: tool,
    depth_mm:         depth,
    along_off_mm:     along,
    up_off_mm:        up,
    qty:              Math.max(1, Math.round(rawQty)),
    spacing_mm:       rawSpc ?? 0,
  }
}

// Resolve one slide rail's ops to absolute cabinet-space holes.
// `box` gives the drawer-box dimensions/anchors this rail serves (from the stack).
export function slideDrillOps(
  slide: ResolvedDrawerSlide,
  ops: SlideDrillOp[],
  ctx: SlideDrillContext,
): ResolvedSlideDrill[] {
  const out: ResolvedSlideDrill[] = []
  const isLeft = slide.side === 'left'

  // Rail geometry in cabinet coords.
  const railFrontZ  = slide.Z + slide.DX            // cabinet front of the runner
  const railBottomY = slide.Y                        // drawer-box bottom line
  // Gable inner face this runner mounts against (outer side of the runner). Also
  // the "outside" datum for the visible face: a small +along sits near the gable.
  const gableFaceX  = isLeft ? slide.X : slide.X + slide.DZ
  const intoGable: SlideDrillAxis = isLeft ? 'x-' : 'x+'
  const inward = isLeft ? 1 : -1   // +X moves toward cabinet centre on the left

  // ── Real-part frames (NOT the box envelope) ────────────────────────────────
  // db_bottom: Y = underside, Y+DZ = top. DX runs back in Z from the front (Z=p.Z).
  const bottom = ctx.bottomPart
  // db_back: front face at p.Z, rear (toward cabinet back) at p.Z − DZ. X..X+DY =
  // panel width; Y..Y+DX = height. This already carries the setback + Y-offset.
  const back = ctx.backPart
  // Visible face: z.Z = back face, z.Z+DZ = front face. X..X+DY = face width.
  const face = ctx.face
  const side = ctx.sidePart

  const vars: Record<string, number> = {
    NL: slide.nominal_length, BH: slide.box_height, RT: slide.runner_thickness,
    BW: back?.DY ?? face.DY, BHt: slide.box_height, BD: slide.nominal_length,
  }

  for (const op of ops) {
    if (op.side !== 'both' && op.side !== slide.side) continue
    const ev = evalOp(op, vars)
    if (!ev) continue

    for (let i = 0; i < ev.qty; i++) {
      const alongStep = op.repeat_axis === 'along' ? i * ev.spacing_mm : 0
      const upStep    = op.repeat_axis === 'up'    ? i * ev.spacing_mm : 0
      const along = ev.along_off_mm + alongStep
      const up    = ev.up_off_mm + upStep

      let x = 0, y = 0, z = 0
      let axis: SlideDrillAxis = 'x-'
      let depthLen = ev.depth_mm

      switch (op.target_surface) {
        case 'cabinet_member': {
          // Into the gable inner face; along = back from cabinet front; up = from
          // the drawer-box bottom line.
          x = gableFaceX
          y = railBottomY + up
          z = railFrontZ - along
          axis = intoGable
          break
        }
        case 'drawer_bottom': {
          // Up into the real bottom panel's underside (respects dado raise).
          // along = back from the panel front; up = across width from this rail's edge.
          if (!bottom) continue
          const panelFrontZ = bottom.Z                       // cabinet front of bottom panel
          const nearX = isLeft ? bottom.X : bottom.X + bottom.DY
          z = panelFrontZ - along
          x = nearX + inward * up
          y = bottom.Y                                       // underside of the real panel
          axis = 'y+'
          break
        }
        case 'drawer_back': {
          // Into the real back panel (respects DB_BACK_SETBACK + Y-offset).
          // Enter the rear face (toward cabinet back); bore forward into the panel.
          // along = across width from this rail's edge; up = height from panel floor.
          if (!back) continue
          const rearZ = back.Z - back.DZ                     // back panel's rear face
          const nearX = isLeft ? back.X : back.X + back.DY
          x = nearX + inward * along
          y = back.Y + up
          z = rearZ
          axis = 'z+'
          break
        }
        case 'drawer_front': {
          // Drill lands on the BACK face of the visible front, but along is
          // referenced from the SLIDE's outside edge (gable-side edge of the
          // runner) — a real machining datum — not the face's own (overhanging)
          // edge. along moves inward from there; up = height. Depth capped so it
          // can't break through the face front.
          x = gableFaceX + inward * along
          y = face.Y + up
          z = face.Z                                         // back face of the visible front
          axis = 'z+'                                        // bore forward into the face
          depthLen = Math.min(ev.depth_mm, Math.max(1, face.DZ - 1))   // through-break guard
          break
        }
        case 'drawer_side': {
          // Into the drawer-box side (five-piece only); along = back from the side
          // front; up = height. Bore inward, away from the runner.
          if (!side) continue
          const sideFrontZ = side.Z
          x = isLeft ? side.X + side.DZ : side.X             // inner face of the side panel
          y = side.Y + up
          z = sideFrontZ - along
          axis = isLeft ? 'x+' : 'x-'
          break
        }
        default:
          continue
      }

      out.push({
        x, y, z, axis,
        radius: ev.tool_diameter_mm / 2,
        depthLen,
        surface: op.target_surface,
        side: slide.side,
        machine_operation: op.machine_operation,
      })
    }
  }

  return out
}

// All slide drills for a resolved cabinet's drawer stacks, flattened.
export function cabinetSlideDrills(stacks: ResolvedDrawerStack[]): ResolvedSlideDrill[] {
  const out: ResolvedSlideDrill[] = []
  for (const stack of stacks) {
    for (const slide of stack.slides) {
      out.push(...slide.drills)
    }
  }
  return out
}
