// Parametric custom-part formulas. Each custom part can carry an expression per
// dimension/position field (dx/dy/dz/x/y/z). Formulas are evaluated against the
// part's OWN resolved assembly:
//   cab.w / cab.h / cab.d           → assembly outer width / height / depth
//   cab.<part>.dx|dy|dz|x|y|z       → a resolved part of this assembly
//                                     (left_gable, right_gable, top, bottom, back,
//                                      door, shelf, drw — missing → 0)
//   t.door|gable|shelf|back|toe|drw → material thickness for that role (schedule)
// plus plain numbers and math. Examples: `cab.d + t.door + 2`, `cab.h`, `70`.

import type { ResolvedCabinet, CabinetInput } from './resolver/types'

export type PartDims = { dx: number; dy: number; dz: number; x: number; y: number; z: number }
export type FormulaCtx = { cab: Record<string, number | PartDims>; t: Record<string, number> }

const PART_ALIASES = ['left_gable', 'right_gable', 'top', 'bottom', 'back', 'door', 'shelf', 'drw'] as const

type XF = { DX: number; DY: number; DZ: number; X: number; Y: number; Z: number }
const toDims = (p: XF): PartDims => ({ dx: p.DX, dy: p.DY, dz: p.DZ, x: p.X, y: p.Y, z: p.Z })

// Build the formula context from a resolved cabinet + its input (materials).
export function buildPartContext(resolved: ResolvedCabinet, input: CabinetInput): FormulaCtx {
  const cab: Record<string, number | PartDims> = {
    w: input.DX, h: input.DY, d: input.DZ,
  }
  const caseBy = (k: string) => resolved.case_parts.find(p => p.part_key === k)
  if (caseBy('left_side'))  cab.left_gable  = toDims(caseBy('left_side')!)
  if (caseBy('right_side')) cab.right_gable = toDims(caseBy('right_side')!)
  if (caseBy('bottom'))     cab.bottom      = toDims(caseBy('bottom')!)
  if (caseBy('back'))       cab.back        = toDims(caseBy('back')!)
  const top = caseBy('full_top') ?? caseBy('front_rail') ?? caseBy('back_rail')
  if (top) cab.top = toDims(top)
  const door = resolved.face_zones.find(z => z.face_type === 'door') ?? resolved.face_zones[0]
  if (door) cab.door = toDims(door)
  const shelf = resolved.internal_parts.find(p => p.part_type === 'adj_shelf' || p.part_type === 'fixed_shelf')
  if (shelf) cab.shelf = toDims(shelf)
  const drw = resolved.internal_parts.find(p => p.part_type.startsWith('inner_drawer') || p.part_type.startsWith('pull_out'))
  if (drw) cab.drw = toDims(drw)

  // Default any missing alias to a zero part so `cab.x.dy` never throws.
  const ZERO: PartDims = { dx: 0, dy: 0, dz: 0, x: 0, y: 0, z: 0 }
  for (const a of PART_ALIASES) if (!(a in cab)) cab[a] = { ...ZERO }

  const t: Record<string, number> = {
    door:  input.door_material?.DZ ?? 0,
    gable: input.material?.DZ ?? 0,
    shelf: input.shelf_material?.DZ ?? input.material?.DZ ?? 0,
    back:  input.material?.DZ ?? 0,
    toe:   input.toekick_face_material?.DZ ?? input.material?.DZ ?? 0,
    drw:   input.drawer_material?.DZ ?? input.material?.DZ ?? 0,
  }
  return { cab, t }
}

// Evaluate one formula. Returns null on any error / non-finite result.
export function evalPartExpr(expr: string, ctx: FormulaCtx): number | null {
  try {
    const fn = new Function('cab', 't', `'use strict'; return +(${expr})`)
    const r = fn(ctx.cab, ctx.t)
    return Number.isFinite(r) ? r : null
  } catch { return null }
}

// Given a custom part's stored fields + its expressions, return the fields whose
// evaluated value differs from the stored literal (to persist as the resolved cache).
export function evalPartFields(
  literal: PartDims,
  expressions: Record<string, string> | null | undefined,
  ctx: FormulaCtx,
): Partial<PartDims> {
  const out: Partial<PartDims> = {}
  if (!expressions) return out
  for (const field of ['dx', 'dy', 'dz', 'x', 'y', 'z'] as const) {
    const f = expressions[field]
    if (typeof f === 'string' && f.trim()) {
      const v = evalPartExpr(f, ctx)
      if (v != null && Math.abs(v - literal[field]) > 1e-6) out[field] = v
    }
  }
  return out
}
