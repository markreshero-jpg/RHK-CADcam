// ============================================================
// Part Editor — pure logic core (no JSX). Origin classification,
// the flat-part display frame, precision rules, plane-picker
// constants, the joint-library snapshot model and validation.
// Split out of PartEditor.tsx; see that file's banner for the
// editor's overall scope and spec references.
// ============================================================

import { supabase } from '@/src/lib/supabase'
import type { PartMeta } from '@/src/components/three/PartViewer'
import { OPERATION_TYPES, ROUTE_ACTIONS } from '@/src/lib/partOps/enums'
import type { PartOp } from '../CabinetRoutesPanel'

export type OrthoView = 'top' | 'front' | 'side'
export type EditorView = '3d' | OrthoView

export type AddKind = 'single' | 'toolset' | 'drill' | 'groove'

// ── Origin classification (spec §3) ──────────────────────────────────────────────
// Generated rows are tagged parameters.generated; hand-added rows carry no marker.
// NB: actual kind values in the DB are {hinge_cup, hinge_plate, joint, slide, null}.
export type Origin = { generated: boolean; kind?: string; label: string }
export function classify(op: PartOp): Origin {
  const gen  = op.parameters?.generated as string | undefined
  const kind = op.parameters?.kind as string | undefined
  if (gen === 'master_slave') return { generated: true, kind: 'slave', label: 'SLAVE' }
  if (gen)                    return { generated: true, kind, label: (kind ?? 'auto').toUpperCase() }
  return { generated: false, label: 'HAND' }
}

// Coarse tool summary for the list. The properties panel uses OperationToolSelect
// for the real picker.
export function toolLabel(op: PartOp): string {
  if (op.tool_set_id)    return 'Tool set'
  if (op.auto_tool)      return 'Auto tool'
  if (op.router_tool_id) return 'Router bit'
  if (op.drill_id)       return 'Drill'
  return '—'
}

// Lay the part flat (spec §2.2): n = material thickness; u/v are the in-plane axes.
// We deliberately align u = part DX, v = part DY, n = DZ — the SAME footprint frame
// partFootprint.ts uses to project generated holes (pos_x ∈ [0,DX], pos_y ∈ [0,DY]),
// so operation markers land where the resolver placed them. PartMeta's w/h/d are
// remapped per panelKind (see cabinetEditSvgHelpers), so recover DX/DY from that:
//   side:            w=DZ h=DY d=DX  → u=d, v=h
//   horizontal:      w=DY h=DZ d=DX  → u=d, v=w
//   carcase back:    w=DY h=DX d=DZ  → u=h, v=w   (DX=height)
//   front face:      w=DX h=DY d=DZ  → u=w, v=h   (DX=width, dxIsWidth) — front
//     zones (door / drawer front / false panel) resolve upright, so DX is width.
export function flatDims(m: PartMeta): { u: number; v: number; n: number } {
  if (m.panelKind === 'side')       return { u: m.d, v: m.h, n: m.thickness }
  if (m.panelKind === 'horizontal') return { u: m.d, v: m.w, n: m.thickness }
  if (m.dxIsWidth)                  return { u: m.w, v: m.h, n: m.thickness }
  return { u: m.h, v: m.w, n: m.thickness }
}

// ── Precision (spec §6.1) ─────────────────────────────────────────────────────────
// Display rounds to 0.1mm (fmtMm). Store rounds once to 0.01mm at the write boundary
// so repeated read/edit/write cycles don't drift. Angles: near-zero (<0.05°) → 0.
export const roundStore = (v: number) => Math.round(v * 100) / 100
export const roundAngle = (v: number) => (Math.abs(v) < 0.05 ? 0 : Math.round(v * 100) / 100)
export const ANGLE_FIELDS = new Set(['angle_ax', 'angle_ay', 'angle_az'])

// Enums come from the central module (§3). 'saw' and the through/stopped depth
// qualifiers are intentionally gone from these lists — see src/lib/partOps/enums.ts.
export const TYPE_OPTIONS: readonly string[]   = OPERATION_TYPES
export const ACTION_OPTIONS: readonly string[] = ['', ...ROUTE_ACTIONS]

// ── Plane picker (spec §4) ────────────────────────────────────────────────────────
export const PLANE_KINDS = ['face_front', 'face_back', 'edge'] as const
export const PLANE_KIND_LABEL: Record<string, string> = { face_front: 'Front face', face_back: 'Back face', edge: 'Edge' }
// Canonical rectangle-edge ordering for plane_edge_index (0..3). Face coords have
// origin bottom-left, x → u (DX) right, y → v (DY) up; edges run CCW from the bottom.
// This is the ordering every consumer (picker, highlight, firing) must share — no
// prior deriveOutline existed, so it is established here.
export const PLANE_EDGES = ['bottom', 'right', 'top', 'left'] as const
// Edge i as the two part-local face corners it spans (origin bottom-left, x → u
// (DX), y → v (DY)). PartOrthoView maps these through its display frame (swap +
// SVG y-flip) so the edge draws on the correct screen side while plane_edge_index
// stays part-local — the ordering the firing engine relies on.
export const PLANE_EDGE_ENDS: Record<number, [[number, number], [number, number]]> = {
  0: [[0, 0], [1, 0]],  // bottom (face y=0)
  1: [[1, 0], [1, 1]],  // right  (face x=u)
  2: [[0, 1], [1, 1]],  // top    (face y=v)
  3: [[0, 0], [0, 1]],  // left   (face x=0)
}

// Map a part-key prefix back to its source table (mirrors seamDrillSync / the
// svg*Meta id scheme) so a hand-added op is keyed to the same identity.
export function sourceTableFor(id: string): string {
  if (id.startsWith('case_'))   return 'case_parts'
  if (id.startsWith('tk_'))     return 'toekick_parts'
  if (id.startsWith('int_'))    return 'internal_parts'
  if (id.startsWith('zone_'))   return 'face_zones'
  if (id.startsWith('db_'))     return 'drawer_box_parts'
  if (id.startsWith('custom_')) return 'cabinet_custom_parts'
  return 'case_parts'
}

// ── Joint role (spec §6) ──────────────────────────────────────────────────────────
// A joint op snapshots a library joint's machining params (copy-not-link) and is
// tagged joint_type_id for the explicit "Update joints from library" re-sync.
export interface JointOp {
  target_part: string; machine_operation: string; face: string | null
  tool_diameter_mm: number | null; depth_mm: number | null
  qty: number | null; spacing_mm: number | null
  router_tool_id: string | null; drill_id: string | null; auto_tool: boolean | null
  operation_order: number | null
}
export interface JointType { id: string; name: string; description: string | null; ops: JointOp[] }

// The library op that lands on the part the user placed the joint on. Every library
// joint has ≤1 op per side; prefer part_a (the near/placed-on side, the A/B default),
// else fall back to part_b (joints whose only op is the far hole, e.g. shelf pins).
export function localJointOp(jt: JointType): JointOp | null {
  return jt.ops.find(o => o.target_part === 'part_a') ?? jt.ops.find(o => o.target_part === 'part_b') ?? jt.ops[0] ?? null
}

// machine_operation → operation_type verb (+ action). pocket is an action, not a
// type (§3): route + action=pocket.
export function jointOpTypeAction(m: string): { operation_type: string; operation_action: string | null } {
  if (m === 'pocket') return { operation_type: 'route', operation_action: 'pocket' }
  if (m === 'route')  return { operation_type: 'route', operation_action: null }
  return { operation_type: 'drill', operation_action: null }
}

// Field snapshot: joint library op → part_operations patch. NB only per-op machining
// FIELDS are snapshotted; the seam-relative offsets (offset_x/y/z) need the two-part
// seam frame to place and are NOT applied here — the op keeps its current plane/pos,
// which the user positions. Asymmetric far-side (part_b) geometry is handled by the
// §5 firing engine (currently a mirror — faithful distinct-part_b geometry deferred).
export function jointSnapshotPatch(jt: JointType): Partial<PartOp> {
  const base: Partial<PartOp> = { operation_role: 'joint', is_master: true, joint_type_id: jt.id }
  const op = localJointOp(jt)
  if (!op) return base
  const { operation_type, operation_action } = jointOpTypeAction(op.machine_operation)
  return {
    ...base, operation_type, operation_action,
    diameter: op.tool_diameter_mm, depth: op.depth_mm,
    repeat_count: op.qty && op.qty > 1 ? op.qty : 1,
    repeat_spacing: op.spacing_mm,
    router_tool_id: op.router_tool_id, drill_id: op.drill_id, auto_tool: op.auto_tool ?? false,
  }
}

export async function loadJointTypes(): Promise<JointType[]> {
  const { data, error } = await supabase.from('joint_types')
    .select('id, name, description, joint_type_operations(target_part, machine_operation, face, tool_diameter_mm, depth_mm, qty, spacing_mm, router_tool_id, drill_id, auto_tool, operation_order)')
    .order('name')
  if (error) { console.error('[PartEditor] load joint types', error); return [] }
  return (data ?? []).map(r => {
    const rr = r as unknown as JointType & { joint_type_operations?: JointOp[] }
    return { id: rr.id, name: rr.name, description: rr.description, ops: (rr.joint_type_operations ?? []).slice().sort((a, b) => (a.operation_order ?? 0) - (b.operation_order ?? 0)) }
  })
}

// ── Validation (spec §6.2) — flag, never block ────────────────────────────────────
export type Issue = { level: 'error' | 'warn'; msg: string }
export function validateOp(op: PartOp, u: number, v: number, n: number): Issue[] {
  const issues: Issue[] = []
  const px = op.pos_x ?? 0, py = op.pos_y ?? 0
  const eps = 0.01

  // Required-field completeness (§7.3): UNSET required fields are warnings (amber /
  // "incomplete"); a SET-but-invalid value (≤0, off-part) is a hard error (red).
  if (op.operation_type === 'drill') {
    if (op.diameter == null) issues.push({ level: 'warn', msg: 'Diameter required' })
    else if (op.diameter <= 0) issues.push({ level: 'error', msg: 'Drill diameter ≤ 0' })
    if (op.depth == null) issues.push({ level: 'warn', msg: 'Depth required' })
    if (op.diameter != null && op.diameter > 0) {
      const r = op.diameter / 2
      const count = Math.max(1, op.repeat_count ?? 1)
      const step = op.repeat_spacing ?? 0
      const along = op.repeat_axis === 'along'
      let off = false
      for (let i = 0; i < count; i++) {
        const cx = px + (along ? step * i : 0), cy = py + (along ? 0 : step * i)
        if (cx - r < -eps || cy - r < -eps || cx + r > u + eps || cy + r > v + eps) off = true
      }
      if (off) issues.push({ level: 'error', msg: count > 1 ? 'Repeat pattern runs off the part' : 'Hole lies off the part' })
    }
  } else if (op.operation_type === 'groove') {
    if (op.width == null) issues.push({ level: 'warn', msg: 'Width required' })
    else if (op.width <= 0) issues.push({ level: 'error', msg: 'Groove width ≤ 0' })
    if (op.length == null) issues.push({ level: 'warn', msg: 'Length required' })
    else if (op.length <= 0) issues.push({ level: 'error', msg: 'Groove length ≤ 0' })
    if (op.depth == null) issues.push({ level: 'warn', msg: 'Depth required' })
    if (op.length != null && op.length > 0 && (px < -eps || py < -eps || px + op.length > u + eps)) issues.push({ level: 'error', msg: 'Groove runs off the part' })
  } else {
    const hasSize = op.size_dx != null && op.size_dy != null
    const hasOffsets = op.offset_left_mm != null || op.offset_right_mm != null || op.offset_top_mm != null || op.offset_bottom_mm != null
    if (!hasSize && !hasOffsets) {
      issues.push({ level: 'warn', msg: 'Size required' })
    } else {
      let x = px, y = py, w = op.size_dx ?? 0, h = op.size_dy ?? 0
      if (hasSize) { x = px - w / 2; y = py - h / 2 }
      else {
        const l = op.offset_left_mm ?? 0, rt = op.offset_right_mm ?? 0, t = op.offset_top_mm ?? 0, b = op.offset_bottom_mm ?? 0
        x = l; y = b; w = u - l - rt; h = v - t - b
      }
      if (w <= 0 || h <= 0) issues.push({ level: 'error', msg: 'Operation size ≤ 0' })
      else if (x < -eps || y < -eps || x + w > u + eps || y + h > v + eps) issues.push({ level: 'error', msg: 'Operation extends beyond the part' })
    }
    if (op.depth == null && op.size_dz == null) issues.push({ level: 'warn', msg: 'Depth required' })
  }

  // Depth vs thickness.
  const depth = op.depth ?? op.size_dz
  const start = op.pos_z ?? 0
  if (depth != null) {
    if (op.operation_action !== 'through' && start + depth > n + eps) issues.push({ level: 'error', msg: 'Depth exceeds panel thickness' })
    else if (op.operation_action !== 'through' && depth >= n - eps) issues.push({ level: 'warn', msg: 'Reaches through but not flagged "through"' })
  }
  // Routing ops (route/groove) are only machined when they carry a concrete tool —
  // a single router bit or a tool-set (no auto/fallback). Missing → hard error, so it
  // shows in the part error list and never silently drops at the optimiser. Drills can
  // still auto-pick a bit by diameter, so there it stays a warning.
  const isRouting = op.operation_type === 'route' || op.operation_type === 'groove'
  if (isRouting) {
    if (!op.router_tool_id && !op.tool_set_id) issues.push({ level: 'error', msg: 'No router tool / tool-set assigned' })
  } else if (!op.auto_tool && !op.tool_set_id && !op.router_tool_id && !op.drill_id) {
    issues.push({ level: 'warn', msg: 'No tool / tool-set assigned' })
  }
  if (op.plane_kind === 'edge' && op.plane_edge_index == null) issues.push({ level: 'error', msg: 'Edge operation has no edge index' })
  if (op.operation_role === 'joint' && !op.joint_type_id) issues.push({ level: 'error', msg: 'Pick a joint type' })
  return issues
}
export const worst = (issues: Issue[] | undefined): 'error' | 'warn' | undefined =>
  !issues ? undefined : issues.some(i => i.level === 'error') ? 'error' : issues.some(i => i.level === 'warn') ? 'warn' : undefined
