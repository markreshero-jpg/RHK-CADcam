// ============================================================
// Panel door profiles (z_doorFace_module/DOOR_SYSTEM_SPEC.md §Panel profiles).
//
// A panel cabinet opted in with rules.PANEL_PROFILE (the cabinet face its seen
// side is on) carries the room / job door style's routing ops
// (ResolvedCabinet.panel_profile). Each of its panel pieces gets that profile
// evaluated at its own size — the Shaker frame 60 in all round, like the doors:
//   - island back panel pieces `ibp:<n>` (case parts, face-kind, turned AY 180),
//     one route per piece;
//   - applied end panels (custom parts from the `applied_panel` library part),
//     side or front standing.
// One place for the geometry: the seen face in cabinet space (3D + elevation
// overlays) and the piece's nest frame (the optimiser's generated routes).
// Pure / framework-free.
// ============================================================

import type { PanelProfileSpec, ResolvedCabinet, ResolvedCasePart, ResolvedCustomPart, ResolvedDoorProfile } from './resolver/types'
import { evaluateProfileOps } from './doorProfile'

type V3 = { x: number; y: number; z: number }

export interface PanelProfileTarget {
  id:           string                           // part id: case_ibp:1 | custom_<id>
  source_table: 'case_parts' | 'custom_parts'
  part_key:     string                           // part_operations.source_part_key (= the id)
  face:         PanelProfileSpec['face']
  w: number; h: number; thickness: number        // the seen face: w across (viewer's left → right), h up
  profile:      ResolvedDoorProfile
  // Seen face in cabinet space: a seen-face point (u across, v up) is
  // origin + across·u + (0,1,0)·v; `normal` points out of the seen face.
  origin: V3; across: V3; normal: V3
  // Nest frame (part-local pos_x along the part's DX, pos_y along its DY), before
  // the down-face mirror: seen (u, v) → (px, py). `nestW` = the DX extent (pos_x).
  toNest: (u: number, v: number) => { px: number; py: number }
  nestW:  number
}

const r2 = (v: number) => Math.round(v * 100) / 100

function evaluate(spec: PanelProfileSpec, w: number, h: number, t: number): ResolvedDoorProfile {
  return {
    profile_type: spec.profile_type,
    ops: evaluateProfileOps(spec.ops, { w, h, thickness: t, toolDiameter: spec.ops[0]?.tool_diameter_mm ?? 0 }),
  }
}

/** An island back panel piece: face-kind (DY width, DX height, DZ thick), turned AY 0 or 180 about its start corner. */
function ibpTarget(p: ResolvedCasePart, spec: PanelProfileSpec): PanelProfileTarget | null {
  if (spec.face !== 'front' && spec.face !== 'back') return null
  const turned = Math.abs(Math.abs(p.AY) - 180) < 0.5
  if (!turned && Math.abs(p.AY) > 0.5) return null
  const W = p.DY, H = p.DX, T = p.DZ
  const x0 = turned ? p.X - W : p.X
  const zLo = turned ? p.Z - T : p.Z, zHi = zLo + T
  const front = spec.face === 'front'
  // Local x runs from the piece's start corner (p.X) along its turned x axis.
  const localX = (cx: number) => turned ? p.X - cx : cx - p.X
  const cabX = (u: number) => front ? x0 + u : x0 + W - u
  return {
    id: `case_${p.part_key}`, source_table: 'case_parts', part_key: `case_${p.part_key}`, face: spec.face,
    w: W, h: H, thickness: T, profile: evaluate(spec, W, H, T),
    origin: front ? { x: x0, y: p.Y, z: zHi } : { x: x0 + W, y: p.Y, z: zLo },
    across: { x: front ? 1 : -1, y: 0, z: 0 },
    normal: { x: 0, y: 0, z: front ? 1 : -1 },
    // Nest frame. A vertical-grain piece (every resolved one) is nested turned,
    // w = its width (normalize.ts), so pos_x = width (DY), pos_y = height (DX) and
    // the down-face mirror goes across the width. Otherwise the face-kind frame:
    // pos_x = height (DX), pos_y = width (DY).
    ...(p.grain_direction === 'vertical'
      ? { toNest: (u: number, v: number) => ({ px: localX(cabX(u)), py: v }), nestW: W }
      : { toNest: (u: number, v: number) => ({ px: v, py: localX(cabX(u)) }), nestW: H }),
  }
}

/** An applied end panel (custom part): side (thin across X, dx deep, dy tall) or front (dx wide, thin front-to-back). */
function customTarget(p: PanelPiece, spec: PanelProfileSpec): PanelProfileTarget | null {
  const dx = Number(p.dx), dy = Number(p.dy), dz = Number(p.dz)
  const x = Number(p.x), y = Number(p.y), z = Number(p.z)
  if (!(dx > 0 && dy > 0 && dz > 0)) return null
  const id = `custom_${p.id}`
  const base = { id, source_table: 'custom_parts' as const, part_key: id, face: spec.face, w: dx, h: dy, thickness: dz, profile: evaluate(spec, dx, dy, dz), nestW: dx }
  if (p.orientation === 'side') {
    // Looking at +X from outside (facing −X) the viewer's right is −Z; at −X it is +Z.
    if (spec.face === 'right') return { ...base, origin: { x: x + dz, y, z: z + dx }, across: { x: 0, y: 0, z: -1 }, normal: { x: 1, y: 0, z: 0 },
      toNest: (u, v) => ({ px: dx - u, py: v }) }
    if (spec.face === 'left') return { ...base, origin: { x, y, z }, across: { x: 0, y: 0, z: 1 }, normal: { x: -1, y: 0, z: 0 },
      toNest: (u, v) => ({ px: u, py: v }) }
    return null
  }
  if (p.orientation === 'front') {
    if (spec.face === 'front') return { ...base, origin: { x, y, z: z + dz }, across: { x: 1, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 },
      toNest: (u, v) => ({ px: u, py: v }) }
    if (spec.face === 'back') return { ...base, origin: { x: x + dx, y, z }, across: { x: -1, y: 0, z: 0 }, normal: { x: 0, y: 0, z: -1 },
      toNest: (u, v) => ({ px: dx - u, py: v }) }
  }
  return null
}

// An applied end panel: the `applied_panel` library part — or, where the loader
// carries no library key (the cabinet editor's rows), any standing panel-sized
// part (fillers / cleats are narrower than a Shaker frame anyway).
const MIN_PANEL = 150
type PanelPiece = Pick<ResolvedCustomPart, 'id' | 'dx' | 'dy' | 'dz' | 'x' | 'y' | 'z' | 'orientation'> & { library_key?: string | null }
function isPanelPiece(p: PanelPiece): boolean {
  if (p.orientation !== 'side' && p.orientation !== 'front') return false
  if (p.library_key) return p.library_key === 'applied_panel'
  return Number(p.dx) >= MIN_PANEL && Number(p.dy) >= MIN_PANEL
}

/** The cabinet's panel pieces that take its panel profile (none without rules.PANEL_PROFILE). */
export function panelProfileTargets(rp: Pick<ResolvedCabinet, 'panel_profile' | 'case_parts'> & { custom_parts?: PanelPiece[] | null }): PanelProfileTarget[] {
  const spec = rp.panel_profile
  if (!spec?.ops.length) return []
  const out: PanelProfileTarget[] = []
  for (const p of rp.case_parts) if (p.part_key.startsWith('ibp:')) { const t = ibpTarget(p, spec); if (t) out.push(t) }
  for (const p of rp.custom_parts ?? []) if (isPanelPiece(p)) { const t = customTarget(p, spec); if (t) out.push(t) }
  return out
}

/** A seen-face point in cabinet space, `lift` mm proud of the face. */
export function seenFacePoint(t: PanelProfileTarget, u: number, v: number, lift = 0): V3 {
  return {
    x: r2(t.origin.x + t.across.x * u + t.normal.x * lift),
    y: r2(t.origin.y + v),
    z: r2(t.origin.z + t.across.z * u + t.normal.z * lift),
  }
}
