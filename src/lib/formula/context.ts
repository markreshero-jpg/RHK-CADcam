// ============================================================
// Formula engine — evaluation context builder (M1).
//
// Assembles the "object tree" view a formula evaluates against, from a
// resolved cabinet + its input:
//
//   cab.w / cab.h / cab.d / cab.kick      cabinet outer dims (display space)
//   r.TOEH, r.SCRT, …                     effective (merged) construction rules
//   t.gable / t.door / t.shelf / …        material thicknesses
//   part("left_gable").dy|dx|dz           resolved parts, RAW CV axes (preferred):
//                                         dy = length (grain), dx = width,
//                                         dz = thickness — orientation-proof
//   part("…").w|h|d|x|y|z|t               display-box extents (legacy aliases)
//   room.* / wall.* / job.*               ancestor scopes (caller-supplied)
//   cabinet("B01") / wall("1")            sibling lookups (caller-supplied)
//
// 2026-08-16: the CV standard-part convention (DY length / DX width / DZ
// thickness, per the Cabinet Vision Part-and-Object-Orientation doc) is the
// preferred vocabulary — it reads identically everywhere a part is shown.
// The display-box w/h/d aliases remain for formulas written before then; the
// per-kind axis mapping below mirrors optimiser/sizeOverrides.ts boxAxes() /
// the svg*Meta builders and must stay in lockstep with them. Positions x/y/z
// are cabinet-space as resolved.
// ============================================================

import type {
  CabinetInput, ResolvedCabinet, ResolvedCasePart,
  ResolvedInternalPart, ResolvedToekickPart, PartTransform,
} from '../resolver/types'
import type { FormulaScope, ScopeValue } from './evaluate'
import type { LookupFn } from './parser'
import { isShapedPanelKey, zonePartId } from '../cabinetShape/partKeys'

/** The numeric view of one part exposed to formulas. */
export interface PartScopeValue {
  readonly [key: string]: number
  // CV standard-part convention (preferred): raw part axes, orientation-proof.
  dy: number; dx: number; dz: number // length (grain) / width / thickness
  w: number; h: number; d: number    // display-box extents (legacy aliases)
  x: number; y: number; z: number    // cabinet-space position
  t: number                          // thickness (DZ)
}

type Axis = 'DX' | 'DY' | 'DZ'

// [box-w, box-h, box-d] per part — mirrors sizeOverrides.boxAxes exactly.
function caseAxes(key: ResolvedCasePart['part_key']): [Axis, Axis, Axis] {
  if (key === 'left_side' || key === 'right_side') return ['DZ', 'DY', 'DX']
  if (key === 'back' || isShapedPanelKey(key)) return ['DY', 'DX', 'DZ']
  return ['DY', 'DZ', 'DX'] // bottom, full_top, rails (horizontal kinds)
}
function toekickAxes(key: ResolvedToekickPart['part_key']): [Axis, Axis, Axis] {
  return key === 'spreader_horizontal' ? ['DX', 'DY', 'DZ'] : ['DY', 'DX', 'DZ']
}
function internalAxes(t: ResolvedInternalPart['part_type']): [Axis, Axis, Axis] {
  if (t === 'inner_drawer_side' || t === 'pull_out_side' || t === 'divider') return ['DZ', 'DY', 'DX']
  if (t === 'inner_drawer_front' || t === 'inner_drawer_back' || t === 'pull_out_back') return ['DY', 'DX', 'DZ']
  return ['DY', 'DZ', 'DX'] // shelves, bottoms, accessories
}
const ZONE_AXES: [Axis, Axis, Axis] = ['DX', 'DY', 'DZ'] // face zones: dxIsWidth

function toPartValue(p: PartTransform, axes: [Axis, Axis, Axis]): PartScopeValue {
  return {
    dy: p.DY, dx: p.DX, dz: p.DZ,   // CV convention — preferred in new formulas
    w: p[axes[0]], h: p[axes[1]], d: p[axes[2]],
    x: p.X, y: p.Y, z: p.Z,
    t: p.DZ,
  }
}

// Friendly aliases → stable part id. Kept small and unambiguous; anything
// else is addressed by its stable id (case_left_side, int_adj_shelf_0,
// zone_0_0, …) which the Part Editor already displays.
const PART_ALIASES: Record<string, string> = {
  left_gable:  'case_left_side',
  right_gable: 'case_right_side',
  bottom:      'case_bottom',
  back:        'case_back',
  top:         'case_full_top',
  front_rail:  'case_front_rail',
  back_rail:   'case_back_rail',
}

export interface FormulaScopeExtras {
  /** Ancestor scopes — plain numeric records. */
  room?: Record<string, ScopeValue>
  wall?: Record<string, ScopeValue>
  job?: Record<string, ScopeValue>
  /** Sibling lookups: cabinet("B01"), wall("1"). Omit → clear eval error. */
  lookupCabinet?: (label: string) => ScopeValue | undefined
  lookupWall?: (name: string) => ScopeValue | undefined
}

/** Build the part map keyed by stable part id (plus part() alias resolution). */
export function buildPartMap(resolved: ResolvedCabinet): Map<string, PartScopeValue> {
  const parts = new Map<string, PartScopeValue>()
  for (const p of resolved.case_parts) {
    parts.set(`case_${p.part_key}`, toPartValue(p, caseAxes(p.part_key)))
  }
  for (const p of resolved.toekick_parts) {
    parts.set(`tk_${p.part_key}_${p.sort_order}`, toPartValue(p, toekickAxes(p.part_key)))
  }
  for (const p of resolved.internal_parts) {
    parts.set(`int_${p.part_type}_${p.sort_order}`, toPartValue(p, internalAxes(p.part_type)))
  }
  for (const z of resolved.face_zones) {
    parts.set(zonePartId(z), toPartValue(z, ZONE_AXES))
  }
  return parts
}

/** Numeric-only projection of the merged construction rules. */
function numericRules(rules: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(rules)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
  }
  return out
}

/** Assemble the evaluation scope for one cabinet. */
export function buildFormulaScope(
  resolved: ResolvedCabinet,
  input: CabinetInput,
  extras: FormulaScopeExtras = {},
): FormulaScope {
  const rules = numericRules(input.rules as unknown as Record<string, unknown>)
  const kick = input.has_toekick ? ((input.rules.TOEH as number | undefined) ?? 0) : 0

  const cab: Record<string, number> = {
    w: input.DX, h: input.DY, d: input.DZ,
    kick,
  }

  const t: Record<string, number> = {
    gable:   input.material?.DZ ?? 0,
    back:    input.material?.DZ ?? 0,
    door:    input.door_thickness ?? input.door_material?.DZ ?? 0,
    shelf:   input.shelf_material?.DZ ?? input.material?.DZ ?? 0,
    toe:     input.toekick_face_material?.DZ ?? input.material?.DZ ?? 0,
    drw:     input.drawer_material?.DZ ?? input.material?.DZ ?? 0,
    exposed: input.exposed_material?.DZ ?? input.material?.DZ ?? 0,
  }

  const parts = buildPartMap(resolved)

  const roots: Record<string, ScopeValue> = { cab, r: rules, t }
  if (extras.room) roots.room = extras.room
  if (extras.wall) roots.wall = extras.wall
  if (extras.job) roots.job = extras.job

  const lookup = (fn: LookupFn, name: string): ScopeValue | undefined => {
    switch (fn) {
      case 'part': {
        const id = PART_ALIASES[name] ?? name
        return parts.get(id)
      }
      case 'cabinet':
        return extras.lookupCabinet?.(name)
      case 'wall':
        return extras.lookupWall?.(name)
    }
  }

  return { roots, lookup }
}
