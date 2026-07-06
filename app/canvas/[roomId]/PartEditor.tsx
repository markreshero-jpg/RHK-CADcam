'use client'

// ============================================================
// Part Editor — Phase 1 (single-part CNC operation editor).
// Opens as a modal-level overlay from the 3D view's right-click
// "Edit Part" action, isolating one part. Three-zone CAD/CAM
// layout: left = ordered operations list (generated + hand-added,
// origin-classified); centre = the part in 3D + ortho views with a
// measure tool; right = contextual properties.
//
// M3 scope (this file): editor shell + single-part scene + the left
// list with origin classification. The properties panel is a
// read-only stub here; editable fields, live operation markers and
// validation arrive in M4, and add/edit/delete + generated lock in
// M5. See z_part_view/RHK-PartEditor-Phase1-Spec.docx §5–§7.
//
// Operations load with the SAME query CabinetRoutesPanel runs
// (source_cabinet_id + source_part_key). A 3D PartMeta.id is exactly
// the source_part_key (e.g. case_left_side / zone_0_0 / int_…_N).
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/src/lib/supabase'
import { Part, PreviewCanvas, type PartMeta } from '@/src/components/three/PartViewer'
import { fmtMm, roundMm } from '@/src/lib/format'
import { evalCalc } from '@/src/lib/calc'
import OperationToolSelect, { useToolLibraries } from '@/src/components/cnc/OperationToolSelect'
import { OPERATION_TYPES, ROUTE_ACTIONS, isFiringRole } from '@/src/lib/partOps/enums'
import { syncMasterSlaves } from '@/src/lib/optimiser/masterSlaveSync'
import type { PartOp } from './CabinetRoutesPanel'
import { useMeasure, MeasureOverlay, rectCorners, type MPt } from './cabinetMeasure'
import { useSvgZoom } from './ResolvedViews'

type OrthoView = 'top' | 'front' | 'side'
type EditorView = '3d' | OrthoView

// ── Origin classification (spec §3) ──────────────────────────────────────────────
// Generated rows are tagged parameters.generated; hand-added rows carry no marker.
// NB: actual kind values in the DB are {hinge_cup, hinge_plate, joint, slide, null}.
type Origin = { generated: boolean; kind?: string; label: string }
function classify(op: PartOp): Origin {
  const gen  = op.parameters?.generated as string | undefined
  const kind = op.parameters?.kind as string | undefined
  if (gen === 'master_slave') return { generated: true, kind: 'slave', label: 'SLAVE' }
  if (gen)                    return { generated: true, kind, label: (kind ?? 'auto').toUpperCase() }
  return { generated: false, label: 'HAND' }
}

// Coarse tool summary for the list. M4 reuses OperationToolSelect for the real picker.
function toolLabel(op: PartOp): string {
  if (op.tool_set_id)    return 'Tool set'
  if (op.auto_tool)      return 'Auto tool'
  if (op.router_tool_id) return 'Router bit'
  if (op.drill_id)       return 'Drill'
  return '—'
}

// Lay the part flat (spec §2.2): n = material thickness; u/v are the in-plane axes.
// We deliberately align u = part DX, v = part DY, n = DZ — the SAME footprint frame
// partFootprint.ts uses to project generated holes (pos_x ∈ [0,DX], pos_y ∈ [0,DY]),
// so M4 operation markers land where the resolver placed them. PartMeta's w/h/d are
// remapped per panelKind (see cabinetEditSvgHelpers), so recover DX/DY from that:
//   side:       w=DZ h=DY d=DX  → u=d, v=h
//   horizontal: w=DY h=DZ d=DX  → u=d, v=w
//   face/back:  w=DY h=DX d=DZ  → u=h, v=w
function flatDims(m: PartMeta): { u: number; v: number; n: number } {
  if (m.panelKind === 'side')       return { u: m.d, v: m.h, n: m.thickness }
  if (m.panelKind === 'horizontal') return { u: m.d, v: m.w, n: m.thickness }
  return { u: m.h, v: m.w, n: m.thickness }
}

// ── Precision (spec §6.1) ─────────────────────────────────────────────────────────
// Display rounds to 0.1mm (fmtMm). Store rounds once to 0.01mm at the write boundary
// so repeated read/edit/write cycles don't drift. Angles: near-zero (<0.05°) → 0.
const roundStore = (v: number) => Math.round(v * 100) / 100
const roundAngle = (v: number) => (Math.abs(v) < 0.05 ? 0 : Math.round(v * 100) / 100)
const ANGLE_FIELDS = new Set(['angle_ax', 'angle_ay', 'angle_az'])

// Enums come from the central module (§3). 'saw' and the through/stopped depth
// qualifiers are intentionally gone from these lists — see src/lib/partOps/enums.ts.
const TYPE_OPTIONS: readonly string[]   = OPERATION_TYPES
const ACTION_OPTIONS: readonly string[] = ['', ...ROUTE_ACTIONS]

type AddKind = 'single' | 'toolset' | 'drill' | 'groove'

// ── Plane picker (spec §4) ────────────────────────────────────────────────────────
const PLANE_KINDS = ['face_front', 'face_back', 'edge'] as const
const PLANE_KIND_LABEL: Record<string, string> = { face_front: 'Front face', face_back: 'Back face', edge: 'Edge' }
// Canonical rectangle-edge ordering for plane_edge_index (0..3). Face coords have
// origin bottom-left, x → u (DX) right, y → v (DY) up; edges run CCW from the bottom.
// This is the ordering every consumer (picker, highlight, firing) must share — no
// prior deriveOutline existed, so it is established here.
const PLANE_EDGES = ['bottom', 'right', 'top', 'left'] as const
// Edge i as an SVG line [x1,y1,x2,y2] in the Front view (SVG y is flipped: face
// y=0 → SVG y=vh). vw=u, vh=v.
function edgeLineSVG(i: number, vw: number, vh: number): [number, number, number, number] {
  switch (i) {
    case 0: return [0, vh, vw, vh]  // bottom (face y=0)
    case 1: return [vw, 0, vw, vh]  // right  (face x=u)
    case 2: return [0, 0, vw, 0]    // top    (face y=v)
    default: return [0, 0, 0, vh]   // left   (face x=0)
  }
}

// Map a part-key prefix back to its source table (mirrors seamDrillSync / the
// svg*Meta id scheme) so a hand-added op is keyed to the same identity.
function sourceTableFor(id: string): string {
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
interface JointOp {
  target_part: string; machine_operation: string; face: string | null
  tool_diameter_mm: number | null; depth_mm: number | null
  qty: number | null; spacing_mm: number | null
  router_tool_id: string | null; drill_id: string | null; auto_tool: boolean | null
  operation_order: number | null
}
interface JointType { id: string; name: string; description: string | null; ops: JointOp[] }

// The library op that lands on the part the user placed the joint on. Every library
// joint has ≤1 op per side; prefer part_a (the near/placed-on side, the A/B default),
// else fall back to part_b (joints whose only op is the far hole, e.g. shelf pins).
function localJointOp(jt: JointType): JointOp | null {
  return jt.ops.find(o => o.target_part === 'part_a') ?? jt.ops.find(o => o.target_part === 'part_b') ?? jt.ops[0] ?? null
}

// machine_operation → operation_type verb (+ action). pocket is an action, not a
// type (§3): route + action=pocket.
function jointOpTypeAction(m: string): { operation_type: string; operation_action: string | null } {
  if (m === 'pocket') return { operation_type: 'route', operation_action: 'pocket' }
  if (m === 'route')  return { operation_type: 'route', operation_action: null }
  return { operation_type: 'drill', operation_action: null }
}

// Field snapshot: joint library op → part_operations patch. NB only per-op machining
// FIELDS are snapshotted; the seam-relative offsets (offset_x/y/z) need the two-part
// seam frame to place and are NOT applied here — the op keeps its current plane/pos,
// which the user positions. Asymmetric far-side (part_b) geometry is handled by the
// §5 firing engine (currently a mirror — faithful distinct-part_b geometry deferred).
function jointSnapshotPatch(jt: JointType): Partial<PartOp> {
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

async function loadJointTypes(): Promise<JointType[]> {
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
type Issue = { level: 'error' | 'warn'; msg: string }
function validateOp(op: PartOp, u: number, v: number, n: number): Issue[] {
  const issues: Issue[] = []
  const px = op.pos_x ?? 0, py = op.pos_y ?? 0
  const eps = 0.01

  if (op.operation_type === 'drill') {
    if ((op.diameter ?? 0) <= 0) issues.push({ level: 'error', msg: 'Drill diameter ≤ 0' })
    const r = (op.diameter ?? 0) / 2
    const count = Math.max(1, op.repeat_count ?? 1)
    const step = op.repeat_spacing ?? 0
    const along = op.repeat_axis === 'along'
    let off = false
    for (let i = 0; i < count; i++) {
      const cx = px + (along ? step * i : 0), cy = py + (along ? 0 : step * i)
      if (cx - r < -eps || cy - r < -eps || cx + r > u + eps || cy + r > v + eps) off = true
    }
    if (off) issues.push({ level: 'error', msg: count > 1 ? 'Repeat pattern runs off the part' : 'Hole lies off the part' })
  } else if (op.operation_type === 'groove') {
    const len = op.length ?? 0, w = op.width ?? 0
    if (len <= 0 || w <= 0) issues.push({ level: 'error', msg: 'Groove length / width ≤ 0' })
    else if (px < -eps || py < -eps || px + len > u + eps) issues.push({ level: 'error', msg: 'Groove runs off the part' })
  } else {
    let x = px, y = py, w = op.size_dx ?? 0, h = op.size_dy ?? 0
    if (op.size_dx != null && op.size_dy != null) { x = px - w / 2; y = py - h / 2 }
    else if (op.offset_left_mm != null || op.offset_right_mm != null || op.offset_top_mm != null || op.offset_bottom_mm != null) {
      const l = op.offset_left_mm ?? 0, rt = op.offset_right_mm ?? 0, t = op.offset_top_mm ?? 0, b = op.offset_bottom_mm ?? 0
      x = l; y = b; w = u - l - rt; h = v - t - b
    }
    if (w <= 0 || h <= 0) issues.push({ level: 'error', msg: 'Operation size ≤ 0' })
    else if (x < -eps || y < -eps || x + w > u + eps || y + h > v + eps) issues.push({ level: 'error', msg: 'Operation extends beyond the part' })
  }

  // Depth vs thickness.
  const depth = op.depth ?? op.size_dz
  const start = op.pos_z ?? 0
  if (depth != null) {
    if (op.operation_action !== 'through' && start + depth > n + eps) issues.push({ level: 'error', msg: 'Depth exceeds panel thickness' })
    else if (op.operation_action !== 'through' && depth >= n - eps) issues.push({ level: 'warn', msg: 'Reaches through but not flagged "through"' })
  }
  if (!op.auto_tool && !op.tool_set_id && !op.router_tool_id && !op.drill_id) issues.push({ level: 'warn', msg: 'No tool / tool-set assigned' })
  if (op.plane_kind === 'edge' && op.plane_edge_index == null) issues.push({ level: 'error', msg: 'Edge operation has no edge index' })
  if (op.operation_role === 'joint' && !op.joint_type_id) issues.push({ level: 'error', msg: 'Pick a joint type' })
  return issues
}
const worst = (issues: Issue[] | undefined): 'error' | 'warn' | undefined =>
  !issues ? undefined : issues.some(i => i.level === 'error') ? 'error' : issues.some(i => i.level === 'warn') ? 'warn' : undefined

function PropRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <span className="text-gray-500 self-center">{label}</span>
      <span className="text-gray-200 text-right font-mono">{value}</span>
    </>
  )
}

// ── Operation marker glyphs (spec §5.5) ──────────────────────────────────────────
// One glyph map, used in BOTH the SVG ortho views and the 3D scene. Geometry is
// computed in part-local FACE coords (origin bottom-left; x → DX/u right, y → DY/v
// up); each view maps it into its own space. All current data are face drills.
type FaceGlyph = {
  circles: { cx: number; cy: number; r: number }[]
  rects:   { x: number; y: number; w: number; h: number }[]
  slots:   { x1: number; y1: number; x2: number; y2: number; w: number }[]
}

function opFaceGlyph(op: PartOp, u: number, v: number): FaceGlyph {
  const g: FaceGlyph = { circles: [], rects: [], slots: [] }
  const px = op.pos_x ?? 0, py = op.pos_y ?? 0

  if (op.operation_type === 'drill') {
    const r = Math.max((op.diameter ?? 5) / 2, 0.5)
    const count = Math.max(1, op.repeat_count ?? 1)
    const step  = op.repeat_spacing ?? 0
    const along = op.repeat_axis === 'along'   // 'along' = u, else step up v
    for (let i = 0; i < count; i++) {
      g.circles.push({ cx: px + (along ? step * i : 0), cy: py + (along ? 0 : step * i), r })
    }
  } else if (op.operation_type === 'groove') {
    const len = op.length ?? 0, w = Math.max(op.width ?? 4, 0.5)
    g.slots.push({ x1: px, y1: py, x2: px + len, y2: py, w })
  } else {
    // Area op (pocket / outline / square_off / profile / route).
    if (op.size_dx != null && op.size_dy != null) {
      g.rects.push({ x: px - op.size_dx / 2, y: py - op.size_dy / 2, w: op.size_dx, h: op.size_dy })
    } else if (op.offset_left_mm != null || op.offset_right_mm != null || op.offset_top_mm != null || op.offset_bottom_mm != null) {
      const l = op.offset_left_mm ?? 0, rt = op.offset_right_mm ?? 0, t = op.offset_top_mm ?? 0, b = op.offset_bottom_mm ?? 0
      g.rects.push({ x: l, y: b, w: Math.max(0, u - l - rt), h: Math.max(0, v - t - b) })
    } else {
      g.circles.push({ cx: px, cy: py, r: 3 })   // positionless fallback dot
    }
  }
  return g
}

// Colour priority: validation error/warn (spec §6.2) → selection → generated/hand.
function glyphColours(op: PartOp, selected: boolean, level?: 'error' | 'warn') {
  if (level === 'error')        return { stroke: '#ef4444', fill: 'rgba(239,68,68,0.22)' }
  if (level === 'warn')         return { stroke: '#f59e0b', fill: 'rgba(245,158,11,0.20)' }
  if (selected)                 return { stroke: '#c4b5fd', fill: 'rgba(196,181,253,0.28)' }
  if (op.parameters?.generated) return { stroke: '#38bdf8', fill: 'rgba(56,189,248,0.16)' }
  return { stroke: '#34d399', fill: 'rgba(52,211,153,0.16)' }
}

// Face-plane op centres (for measure snapping + 3D). Front view only — every stored
// generated op is a face bore (partFootprint drops edge bores).
function opCentres(ops: PartOp[]): { x: number; y: number }[] {
  return ops.map(o => ({ x: o.pos_x ?? 0, y: o.pos_y ?? 0 }))
}

// SVG marker layer for the FRONT (face) view. y is flipped (SVG top-down → v-up).
function OpMarkersSVG({ ops, u, v, selectedId, onSelect, interactive, levels }: {
  ops: PartOp[]; u: number; v: number; selectedId: string | null
  onSelect: (id: string) => void; interactive: boolean
  levels: Record<string, 'error' | 'warn' | undefined>
}) {
  return (
    <g>
      {ops.map(op => {
        const g = opFaceGlyph(op, u, v)
        const sel = op.id === selectedId
        const c = glyphColours(op, sel, levels[op.id])
        const sw = sel ? 2 : 1.25
        return (
          <g key={op.id}
            style={{ cursor: interactive ? 'pointer' : 'default', pointerEvents: interactive ? 'auto' : 'none' }}
            onClick={interactive ? (e => { e.stopPropagation(); onSelect(op.id) }) : undefined}>
            {g.circles.map((cir, i) => (
              <circle key={`c${i}`} cx={cir.cx} cy={v - cir.cy} r={cir.r}
                fill={c.fill} stroke={c.stroke} strokeWidth={sw} vectorEffect="non-scaling-stroke" />
            ))}
            {g.rects.map((r, i) => (
              <rect key={`r${i}`} x={r.x} y={v - r.y - r.h} width={r.w} height={r.h}
                fill={c.fill} stroke={c.stroke} strokeWidth={sw} vectorEffect="non-scaling-stroke" />
            ))}
            {g.slots.map((s, i) => (
              <line key={`s${i}`} x1={s.x1} y1={v - s.y1} x2={s.x2} y2={v - s.y2}
                stroke={c.stroke} strokeWidth={s.w} strokeLinecap="round" opacity={0.7} />
            ))}
          </g>
        )
      })}
    </g>
  )
}

// 3D marker layer — drill discs / area outlines on the part's front face (z = n).
// Lives inside the same group the Part is centred in, so local coords match.
function OpMarkers3D({ ops, u, v, n, selectedId, onSelect, levels }: {
  ops: PartOp[]; u: number; v: number; n: number; selectedId: string | null; onSelect: (id: string) => void
  levels: Record<string, 'error' | 'warn' | undefined>
}) {
  return (
    <group>
      {ops.flatMap(op => {
        const g = opFaceGlyph(op, u, v)
        const c = glyphColours(op, op.id === selectedId, levels[op.id]).stroke
        const z = n + 0.4
        return [
          ...g.circles.map((cir, i) => (
            <mesh key={`${op.id}-c${i}`} position={[cir.cx, cir.cy, z]} rotation={[Math.PI / 2, 0, 0]}
              onClick={e => { e.stopPropagation(); onSelect(op.id) }}>
              <cylinderGeometry args={[cir.r, cir.r, 0.8, 20]} />
              <meshBasicMaterial color={c} />
            </mesh>
          )),
          ...g.rects.map((r, i) => (
            <mesh key={`${op.id}-r${i}`} position={[r.x + r.w / 2, r.y + r.h / 2, z]}
              onClick={e => { e.stopPropagation(); onSelect(op.id) }}>
              <boxGeometry args={[r.w, r.h, 0.8]} />
              <meshBasicMaterial color={c} transparent opacity={0.4} />
            </mesh>
          )),
        ]
      })}
    </group>
  )
}

// Orthographic Top / Front / Side as a true-mm SVG (1 user-unit = 1 mm), so it
// reuses the cabinet modal's measure tool verbatim (useMeasure + MeasureOverlay,
// corner snapping, x/y delta readout). The part laid flat is u(width) × v(height)
// × n(thickness); each ortho view is the matching rectangle:
//   front = u × v   ·   top = u × n   ·   side = n × v
function PartOrthoView({ u, v, n, view, measuring, ops, selectedId, onSelect, levels, planePick, onPickPlane }: {
  u: number; v: number; n: number; view: OrthoView; measuring: boolean
  ops: PartOp[]; selectedId: string | null; onSelect: (id: string) => void
  levels: Record<string, 'error' | 'warn' | undefined>
  planePick?: boolean
  onPickPlane?: (patch: { plane_kind: string; plane_edge_index: number | null }) => void
}) {
  const [vw, vh] = view === 'front' ? [u, v] : view === 'top' ? [u, n] : [n, v]
  const { svgRef, viewBox, vb, unit } = useSvgZoom(vw, vh, 1.15)
  const [hoverEdge, setHoverEdge] = useState<number | null>(null)

  // The selected op's current plane, so its edge is highlighted (front view only).
  const selOp = ops.find(o => o.id === selectedId)
  const selEdge = selOp?.plane_kind === 'edge' ? selOp.plane_edge_index ?? null : null
  const pick = !!planePick && view === 'front' && !measuring

  // Snap candidates = part rectangle corners + edge midpoints + (front view) op
  // centres — matching the cabinet modal's "corners, edge midpoints, op centres".
  const measurePts: MPt[] = []
  if (measuring) {
    measurePts.push(...rectCorners({ x: 0, y: 0, w: vw, h: vh }))
    measurePts.push({ x: vw / 2, y: 0 }, { x: vw / 2, y: vh }, { x: 0, y: vh / 2 }, { x: vw, y: vh / 2 })
    if (view === 'front') for (const c of opCentres(ops)) measurePts.push({ x: c.x, y: vh - c.y })
  }
  const measure = useMeasure(measuring, svgRef, measurePts)

  function handleContextMenu(e: React.MouseEvent<SVGSVGElement>) {
    e.preventDefault()
    if (measuring) measure.cancel()
  }

  // Faint mm grid (every 50 mm) inside the part bounds.
  const cell = 50
  const grid: React.ReactNode[] = []
  for (let x = cell; x < vw; x += cell) grid.push(<line key={`gx${x}`} x1={x} y1={0} x2={x} y2={vh} stroke="#1e2636" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />)
  for (let y = cell; y < vh; y += cell) grid.push(<line key={`gy${y}`} x1={0} y1={y} x2={vw} y2={y} stroke="#1e2636" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />)

  return (
    <svg
      ref={svgRef}
      viewBox={viewBox}
      width="100%" height="100%"
      style={{ maxHeight: '100%', maxWidth: '100%', cursor: measuring ? 'crosshair' : 'default' }}
      onClick={measuring ? measure.onClick : undefined}
      onPointerMove={measuring ? measure.onMove : undefined}
      onContextMenu={handleContextMenu}
    >
      <rect x={0} y={0} width={vw} height={vh} fill="#243045" stroke="#5b6373" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <g style={{ pointerEvents: 'none' }}>{grid}</g>
      {/* Operation markers live on the face → shown in the Front view. */}
      {view === 'front' && <OpMarkersSVG ops={ops} u={vw} v={vh} selectedId={selectedId} onSelect={onSelect} interactive={!measuring && !pick} levels={levels} />}

      {/* Selected op's current edge, highlighted (§7.2 "the marker moves live"). */}
      {view === 'front' && selEdge != null && (() => {
        const [x1, y1, x2, y2] = edgeLineSVG(selEdge, vw, vh)
        return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#a78bfa" strokeWidth={3} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
      })()}

      {/* Plane-pick mode (§7.2): click a highlighted edge, or the interior for the front face. */}
      {pick && onPickPlane && (
        <g>
          <rect x={vw * 0.12} y={vh * 0.12} width={vw * 0.76} height={vh * 0.76}
            fill="#a78bfa" fillOpacity={0.06} stroke="#a78bfa" strokeDasharray="4 4"
            strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ cursor: 'pointer' }}
            onClick={() => onPickPlane({ plane_kind: 'face_front', plane_edge_index: null })} />
          {[0, 1, 2, 3].map(i => {
            const [x1, y1, x2, y2] = edgeLineSVG(i, vw, vh)
            return (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={hoverEdge === i ? '#c4b5fd' : '#7c3aed'}
                strokeWidth={hoverEdge === i ? 14 : 9} strokeLinecap="round"
                vectorEffect="non-scaling-stroke" strokeOpacity={hoverEdge === i ? 0.9 : 0.55}
                style={{ cursor: 'pointer' }}
                onPointerEnter={() => setHoverEdge(i)} onPointerLeave={() => setHoverEdge(null)}
                onClick={() => onPickPlane({ plane_kind: 'edge', plane_edge_index: i })} />
            )
          })}
        </g>
      )}
      {measuring && (
        <MeasureOverlay start={measure.start} end={measure.end} cursor={measure.cursor}
          snapped={measure.snapped} unit={unit} vb={vb} pts={measurePts} />
      )}
    </svg>
  )
}

// Calc-aware numeric field ("100+12" → 112). Reseeds by remounting (key on op
// change) rather than a setState-in-effect. Commits on blur / Enter, reverts on Esc.
function NumField({ value, onCommit, disabled }: {
  value: number | null; onCommit: (v: number) => void; disabled?: boolean
}) {
  const init = value == null ? '' : String(roundMm(value))
  const [draft, setDraft] = useState(init)
  function commit() {
    const x = evalCalc(draft)
    if (x != null && Number.isFinite(x)) onCommit(x)
    else setDraft(init)
  }
  return (
    <input
      type="text" inputMode="decimal" value={draft} disabled={disabled}
      onChange={e => setDraft(e.target.value)}
      onFocus={e => e.target.select()}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(init); e.currentTarget.blur() } }}
      className="w-20 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-right font-mono text-gray-100 disabled:text-gray-500 disabled:bg-gray-900/60 disabled:cursor-not-allowed focus:outline-none focus:border-blue-500"
    />
  )
}

export default function PartEditor({ cabinetId, part, onClose }: {
  cabinetId: string
  part:      PartMeta
  onClose:   () => void
}) {
  const [ops, setOps]               = useState<PartOp[]>([])
  const [loadedKey, setLoadedKey]   = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<EditorView>('front')
  const [measuring, setMeasuring] = useState(false)
  // Plane-pick mode (§7.2): the Front view exposes clickable edges/face.
  const [planePick, setPlanePick] = useState(false)
  // Live firing (§6.2): true while syncMasterSlaves regenerates this cabinet's slaves.
  const [firing, setFiring] = useState(false)
  // Joint library (§6): types + their ops, for the enforced-first joint picker.
  const [jointTypes, setJointTypes] = useState<JointType[]>([])
  const [jointQuery, setJointQuery] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const dragRef = useRef(false)
  // Tool libraries (router bits + drills) + tool sets, for the tool picker / add.
  const { tools, drills } = useToolLibraries()
  const [toolSets, setToolSets] = useState<{ id: string; name: string }[]>([])
  // Session undo stack (§6.3) — closures that revert local + DB. Capped ~20.
  const undoRef = useRef<(() => Promise<void>)[]>([])
  const [undoDepth, setUndoDepth] = useState(0)
  // Derived (not effect-set) so we never call setState synchronously in an effect.
  const loading = loadedKey !== part.id

  useEffect(() => {
    let cancelled = false
    supabase.from('cnc_tool_sets').select('id,name').eq('is_active', true).order('sort_order').order('name')
      .then(({ data }) => { if (!cancelled) setToolSets((data ?? []) as { id: string; name: string }[]) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    loadJointTypes().then(jt => { if (!cancelled) setJointTypes(jt) })
    return () => { cancelled = true }
  }, [])

  // Same load query as CabinetRoutesPanel, scoped to the one part.
  useEffect(() => {
    let cancelled = false
    supabase.from('part_operations').select('*')
      .eq('source_cabinet_id', cabinetId)
      .eq('source_part_key', part.id)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error('[PartEditor] load operations', error)
        setOps(((data ?? []) as PartOp[]).slice().sort((a, b) => a.sort_order - b.sort_order))
        setLoadedKey(part.id)
      })
    return () => { cancelled = true }
  }, [cabinetId, part.id])

  // Reload this part's ops from the DB (after live firing materialises slaves).
  async function reloadOps() {
    const { data, error } = await supabase.from('part_operations').select('*')
      .eq('source_cabinet_id', cabinetId).eq('source_part_key', part.id)
    if (error) { console.error('[PartEditor] reload operations', error); return }
    setOps(((data ?? []) as PartOp[]).slice().sort((a, b) => a.sort_order - b.sort_order))
  }

  // Live firing (§6.2): regenerate the cabinet's master/joint slave rows, then
  // reload so any slave that landed on THIS part appears immediately (locked +
  // SLAVE-badged). The optimise pass re-runs this authoritatively (M6).
  async function refire() {
    setFiring(true)
    try { await syncMasterSlaves(cabinetId); await reloadOps() }
    catch (e) { console.error('[PartEditor] refire', e) }
    finally { setFiring(false) }
  }

  // Snapshot a library joint onto the selected op (§6). patchOp carries the undo +
  // (role=joint → firing) re-fire. Copy-not-link: the op keeps these values until an
  // explicit re-sync.
  async function pickJoint(jt: JointType) {
    setJointQuery('')
    await patchOp(jointSnapshotPatch(jt))
  }

  // "Update joints from library" (§6) — re-read the library and re-materialise every
  // joint-tagged op in THIS cabinet. Explicit/user-triggered (never automatic), so it
  // respects the hierarchy. Job/room-wide broadening is a follow-up.
  async function resyncJointsFromLibrary() {
    setFiring(true)
    try {
      const fresh = await loadJointTypes()
      setJointTypes(fresh)
      const byId = new Map(fresh.map(j => [j.id, j]))
      const { data, error } = await supabase.from('part_operations')
        .select('id, joint_type_id').eq('source_cabinet_id', cabinetId).not('joint_type_id', 'is', null)
      if (error) { console.error('[PartEditor] resync joints', error); return }
      for (const row of (data ?? []) as { id: string; joint_type_id: string }[]) {
        const jt = byId.get(row.joint_type_id)
        if (jt) await supabase.from('part_operations').update(jointSnapshotPatch(jt)).eq('id', row.id)
      }
      await syncMasterSlaves(cabinetId)
      await reloadOps()
    } catch (e) { console.error('[PartEditor] resync joints', e) }
    finally { setFiring(false) }
  }

  // Escape closes the editor. Capture phase + stopImmediatePropagation so the
  // cabinet modal's own Escape handler behind it doesn't also fire.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      const t = e.target
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return
      e.stopImmediatePropagation(); e.preventDefault()
      // Esc exits the measure tool first (mirrors the cabinet modal); only when
      // not measuring does it close the editor.
      if (measuring) { setMeasuring(false); return }
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose, measuring])

  const { u, v, n } = useMemo(() => flatDims(part), [part])
  const selected = ops.find(o => o.id === selectedId) ?? null
  const sel = selected ? classify(selected) : null

  // Validation (§6.2) — flag, never block. Recomputed from ops + part dims.
  const issuesById = useMemo(() => {
    const m: Record<string, Issue[]> = {}
    for (const op of ops) m[op.id] = validateOp(op, u, v, n)
    return m
  }, [ops, u, v, n])
  const levels = useMemo(() => {
    const m: Record<string, 'error' | 'warn' | undefined> = {}
    for (const op of ops) m[op.id] = worst(issuesById[op.id])
    return m
  }, [ops, issuesById])
  const errorCount = Object.values(levels).filter(l => l === 'error').length
  const warnCount  = Object.values(levels).filter(l => l === 'warn').length
  const selIssues  = selected ? (issuesById[selected.id] ?? []) : []
  const selLocked  = !!sel?.generated   // generated rows are read-only (spec §3.1)
  // Enforced-first joint pick (§7.1): a joint op with no type collapses the inspector
  // to just the picker until a joint is chosen.
  const jointPicking = !!selected && !selLocked && selected.operation_role === 'joint' && !selected.joint_type_id
  const jointName = selected?.joint_type_id ? (jointTypes.find(j => j.id === selected.joint_type_id)?.name ?? 'joint') : null
  const jointHits = jointTypes.filter(j => j.name.toLowerCase().includes(jointQuery.trim().toLowerCase()))

  // ── Data layer (reuses CabinetRoutesPanel's insert/patch/delete shape) ──────────
  const roundChanges = (changes: Partial<PartOp>) => {
    const r: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(changes)) {
      r[k] = typeof val === 'number' ? (ANGLE_FIELDS.has(k) ? roundAngle(val) : roundStore(val)) : val
    }
    return r
  }
  const applyLocal = (id: string, changes: Record<string, unknown>) =>
    setOps(prev => prev.map(o => (o.id === id ? { ...o, ...(changes as Partial<PartOp>) } : o)))
  async function dbUpdate(id: string, changes: Record<string, unknown>) {
    const { error } = await supabase.from('part_operations').update(changes).eq('id', id)
    if (error) console.error('[PartEditor] update', error)
  }
  function pushUndo(fn: () => Promise<void>) {
    undoRef.current = [...undoRef.current.slice(-19), fn]
    setUndoDepth(undoRef.current.length)
  }
  async function undo() {
    const fn = undoRef.current.pop()
    setUndoDepth(undoRef.current.length)
    if (fn) await fn()
  }

  // Edit a field. Numbers round at the boundary: 0.01mm, angles near-zero → 0 (§6.1).
  // Optimistic local update (markers re-render live) + immediate DB write. On-blur
  // commit already coalesces per-keystroke edits (§6.3). Generated rows never patch.
  async function patchOp(changes: Partial<PartOp>) {
    if (!selected || selLocked) return
    const id = selected.id
    const rounded = roundChanges(changes)
    const prev: Record<string, unknown> = {}
    for (const k of Object.keys(rounded)) prev[k] = (selected as unknown as Record<string, unknown>)[k]
    applyLocal(id, rounded)
    pushUndo(async () => { applyLocal(id, prev); await dbUpdate(id, prev) })
    await dbUpdate(id, rounded)
    // Re-fire when a master/joint op's geometry/role changed, or a role toggled
    // (either direction — turning a master back to local must drop its slaves).
    if ('operation_role' in rounded || isFiringRole(selected.operation_role)) await refire()
  }

  // Add a hand operation (spec §5.3 kinds). New ops default plane_kind='face_front'
  // and are placed near the part centre so they're visible immediately.
  async function addOp(kind: AddKind) {
    setAddOpen(false)
    const nextOrder = ops.length ? Math.max(...ops.map(o => o.sort_order)) + 1 : 0
    const cx = roundStore(u / 2), cy = roundStore(v / 2)
    const base = {
      source_table: sourceTableFor(part.id),
      source_cabinet_id: cabinetId,
      source_part_key: part.id,
      output_to_cnc: true,
      sort_order: nextOrder,
      plane_kind: 'face_front',
      operation_role: 'local',   // §2 — every op is local until roles land in M4
    }
    const extra: Record<string, unknown> =
      kind === 'single'  ? { operation_type: 'route', operation_action: 'pocket', auto_tool: true, pos_x: cx, pos_y: cy, size_dx: 50, size_dy: 50 }
    : kind === 'toolset' ? { operation_type: 'route', operation_action: 'pocket', tool_set_id: toolSets[0]?.id ?? null, pos_x: cx, pos_y: cy, size_dx: 50, size_dy: 50 }
    : kind === 'drill'   ? { operation_type: 'drill', auto_tool: true, repeat_count: 1, repeat_spacing: 32, diameter: 5, depth: 10, pos_x: cx, pos_y: cy }
    :                      { operation_type: 'groove', auto_tool: true, width: 8, depth: 6, pos_x: roundStore(Math.max(10, u * 0.1)), pos_y: cy, length: roundStore(Math.max(10, u * 0.8)) }

    const { data, error } = await supabase.from('part_operations').insert({ ...base, ...extra }).select().single()
    if (error || !data) { console.error('[PartEditor] add operation', error); return }
    const row = data as PartOp
    setOps(prev => [...prev, row])
    setSelectedId(row.id)
    pushUndo(async () => {
      setOps(prev => prev.filter(o => o.id !== row.id))
      await supabase.from('part_operations').delete().eq('id', row.id)
    })
  }

  // Delete the selected hand op. No confirm — undo covers it (§6.3).
  async function deleteSelected() {
    if (!selected || selLocked) return
    const row = selected
    setOps(prev => prev.filter(o => o.id !== row.id))
    setSelectedId(null)
    pushUndo(async () => {
      const { data } = await supabase.from('part_operations').insert(row as unknown as Record<string, unknown>).select().single()
      if (data) setOps(prev => [...prev, data as PartOp].sort((a, b) => a.sort_order - b.sort_order))
      await refire()
    })
    await supabase.from('part_operations').delete().eq('id', row.id)
    // Deleting a master drops its slaves; deleting a local op that was blocking a
    // slave lets it fire (§2.1). Either way, re-fire the cabinet.
    await refire()
  }

  // Convert a generated op into a hand-owned one by stripping parameters.generated
  // (spec §3.1). It then survives the next sync (which only wipes generated rows).
  async function convertToManual() {
    if (!selected || !sel?.generated) return
    const id = selected.id
    const oldParams = selected.parameters
    const newParams: Record<string, unknown> = { ...(selected.parameters ?? {}) }
    delete newParams.generated
    applyLocal(id, { parameters: newParams })
    pushUndo(async () => { applyLocal(id, { parameters: oldParams }); await dbUpdate(id, { parameters: oldParams }) })
    await dbUpdate(id, { parameters: newParams })
  }

  // Drag-reorder the list → renumber sort_order (= execution order). Only changed
  // rows are written. Undoable.
  async function persistOrder(next: PartOp[], prev: PartOp[]) {
    const prevById = new Map(prev.map(o => [o.id, o.sort_order]))
    const changed = next.filter(o => prevById.get(o.id) !== o.sort_order)
    await Promise.all(changed.map(o => supabase.from('part_operations').update({ sort_order: o.sort_order }).eq('id', o.id)))
  }
  function reorder(fromId: string, toId: string) {
    if (fromId === toId) return
    const from = ops.findIndex(o => o.id === fromId)
    const to   = ops.findIndex(o => o.id === toId)
    if (from < 0 || to < 0) return
    const prev = ops
    const next = ops.slice()
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    const renumbered = next.map((o, i) => ({ ...o, sort_order: i }))
    setOps(renumbered)
    pushUndo(async () => { setOps(prev); await persistOrder(prev, renumbered) })
    void persistOrder(renumbered, prev)
  }

  // Arrow ↑/↓ move the list selection (ignored while typing). Delete is intentionally
  // NOT bound — the 3D view behind captures it (would hide the whole part); use the
  // panel's Delete button + undo instead.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      const t = e.target
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return
      if (ops.length === 0) return
      e.preventDefault(); e.stopImmediatePropagation()
      const idx = ops.findIndex(o => o.id === selectedId)
      const nextIdx = e.key === 'ArrowDown'
        ? Math.min(ops.length - 1, idx + 1)
        : Math.max(0, (idx < 0 ? 0 : idx - 1))
      setSelectedId(ops[nextIdx]?.id ?? null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [ops, selectedId])

  // Ctrl/Cmd+Z → session undo (ignored while typing in a field).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
      const t = e.target
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return
      e.preventDefault(); e.stopImmediatePropagation()
      void undo()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const allGenerated = ops.length > 0 && ops.every(o => !!o.parameters?.generated)

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/85 flex flex-col"
      onPointerDown={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex-none bg-gray-900 border-b border-gray-700 px-4 py-2 flex items-center justify-between">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="text-sm font-semibold text-white">Part Editor</span>
          <span className="text-xs text-gray-300 truncate">{part.label}</span>
          <span className="text-[11px] text-gray-500 font-mono whitespace-nowrap">{fmtMm(u)} × {fmtMm(v)} × {fmtMm(n)} mm</span>
          {(errorCount > 0 || warnCount > 0) && (
            <span className="flex items-center gap-1.5 text-[10px]">
              {errorCount > 0 && <span title="Operations with errors" className="px-1.5 py-0.5 rounded bg-red-900/60 text-red-300 font-medium">{errorCount} error{errorCount > 1 ? 's' : ''}</span>}
              {warnCount > 0 && <span title="Operations with warnings" className="px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-300 font-medium">{warnCount} warning{warnCount > 1 ? 's' : ''}</span>}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void undo()} disabled={undoDepth === 0}
            title="Undo (Ctrl+Z)"
            className="text-[11px] px-2 py-0.5 rounded border border-gray-700 text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed">
            ↺ Undo{undoDepth > 0 ? ` (${undoDepth})` : ''}
          </button>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none px-1" aria-label="Close">✕</button>
        </div>
      </div>

      {/* Body — three zones */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left — operations list */}
        <div className="flex-none w-72 bg-gray-900 border-r border-gray-800 flex flex-col">
          <div className="flex-none px-3 py-2 border-b border-gray-800 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
              Operations{ops.length ? ` (${ops.length})` : ''}
            </span>
            <div className="relative">
              <button onClick={() => setAddOpen(o => !o)}
                className="text-[11px] px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors">+ Add ▾</button>
              {addOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setAddOpen(false)} />
                  <div className="absolute right-0 mt-1 z-20 w-40 bg-gray-800 border border-gray-700 rounded shadow-xl py-1">
                    {([['single', 'Single operation'], ['toolset', 'Tool set'], ['drill', 'Drill pattern'], ['groove', 'Groove']] as [AddKind, string][]).map(([k, lbl]) => (
                      <button key={k} onClick={() => addOp(k)}
                        className="w-full text-left px-3 py-1.5 text-[11px] text-gray-300 hover:bg-gray-700 transition-colors">{lbl}</button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
          {ops.length > 0 && (
            <div className="flex-none px-3 py-1 text-[9px] text-gray-600 border-b border-gray-800/60">
              Order = execution (drill before route) · drag ⠿ to reorder
            </div>
          )}
          {!loading && allGenerated && (
            <div className="flex-none px-3 py-1.5 text-[10px] text-amber-400/80 bg-amber-950/20 border-b border-gray-800 leading-snug">
              All operations are generated (locked). Add a hand operation, or select one and “Convert to manual override” to edit.
            </div>
          )}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-xs text-gray-500">Loading…</div>
            ) : ops.length === 0 ? (
              <div className="p-4 text-xs text-gray-500">
                No operations on this part yet.
                <div className="mt-1 text-gray-600">Use <span className="text-blue-400">+ Add</span> to place one.</div>
              </div>
            ) : ops.map((op, i) => {
              const o = classify(op)
              const isSel = op.id === selectedId
              return (
                <button
                  key={op.id}
                  draggable
                  onDragStart={() => setDragId(op.id)}
                  onDragOver={e => { e.preventDefault(); if (overId !== op.id) setOverId(op.id) }}
                  onDrop={e => { e.preventDefault(); if (dragId) reorder(dragId, op.id); setDragId(null); setOverId(null) }}
                  onDragEnd={() => { setDragId(null); setOverId(null) }}
                  onClick={() => setSelectedId(op.id)}
                  className={`w-full text-left px-3 py-2 border-b border-gray-800/60 transition-colors ${
                    dragId && overId === op.id && dragId !== op.id ? 'border-t-2 border-t-blue-500' : ''
                  } ${dragId === op.id ? 'opacity-40' : ''} ${isSel ? 'bg-blue-600/20' : 'hover:bg-gray-800/60'}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600 shrink-0 cursor-grab select-none" title="Drag to reorder">⠿</span>
                    <span className="text-[10px] font-mono text-gray-600 w-4 shrink-0">{i + 1}</span>
                    <span className="text-xs text-gray-200 flex-1 truncate">
                      {op.operation_type}
                      {op.operation_action ? <span className="text-gray-400"> · {op.operation_action}</span> : null}
                    </span>
                    {levels[op.id] && (
                      <span title={(issuesById[op.id] ?? []).map(is => is.msg).join('\n')}
                        className={`text-[11px] leading-none ${levels[op.id] === 'error' ? 'text-red-400' : 'text-amber-400'}`}>⚠</span>
                    )}
                    {!op.output_to_cnc && <span title="Excluded from CNC output" className="text-[10px] text-gray-600">⊘</span>}
                    <span className={`text-[8px] px-1 py-0.5 rounded font-bold tracking-wide ${
                      o.generated ? 'bg-amber-900/60 text-amber-300' : 'bg-emerald-900/50 text-emerald-300'
                    }`}>{o.label}</span>
                  </div>
                  <div className="flex items-center gap-2 pl-6 mt-0.5">
                    <span className="text-[10px] text-gray-500">{toolLabel(op)}</span>
                    {op.diameter != null && <span className="text-[10px] text-gray-600 font-mono">⌀{fmtMm(op.diameter)}</span>}
                    {op.output_face && <span className="text-[10px] text-gray-600">{op.output_face}</span>}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Centre — single-part scene: 3D (R3F) + ortho Top/Front/Side (SVG, true mm). */}
        <div className="flex-1 relative bg-gray-950 min-w-0">
          <div className="absolute top-2 left-2 z-10 flex items-center gap-2 select-none">
            <div className="flex rounded-md overflow-hidden border border-gray-700 bg-gray-900/90">
              {(['3d', 'top', 'front', 'side'] as const).map(vm => (
                <button
                  key={vm}
                  onClick={() => { setView(vm); if (vm === '3d') setMeasuring(false) }}
                  className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    view === vm ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {vm === '3d' ? '3D' : vm[0].toUpperCase() + vm.slice(1)}
                </button>
              ))}
            </div>
            {view !== '3d' && (
              <button
                onClick={() => setMeasuring(m => !m)}
                title="Measure between part corners — click two points"
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors ${
                  measuring
                    ? 'bg-amber-600 border-amber-500 text-white'
                    : 'bg-gray-900/90 border-gray-700 text-gray-300 hover:bg-gray-700'
                }`}
              >
                Measure
              </button>
            )}
          </div>

          {view === '3d' ? (
            <PreviewCanvas dx={u} dy={v} dz={n} bgColor="#0b1220">
              <group position={[-u / 2, -v / 2, -n / 2]}>
                <Part
                  b={{ x: 0, y: 0, z: 0, w: u, h: v, d: n }}
                  // face kind colours: [edge×4, +Z face, −Z back]
                  faceColors={['#5b6373', '#5b6373', '#5b6373', '#5b6373', '#c9ccd4', '#9aa0ad']}
                  edgeLineColor="#475569"
                  meta={part}
                  selected={false}
                  highlighted={false}
                  onSelect={() => {}}
                  dragRef={dragRef}
                />
                <OpMarkers3D ops={ops} u={u} v={v} n={n} selectedId={selectedId} onSelect={setSelectedId} levels={levels} />
              </group>
            </PreviewCanvas>
          ) : (
            <div className="w-full h-full flex items-center justify-center p-6">
              <PartOrthoView u={u} v={v} n={n} view={view} measuring={measuring}
                ops={ops} selectedId={selectedId} onSelect={setSelectedId} levels={levels}
                planePick={planePick && !selLocked}
                onPickPlane={patch => { patchOp(patch); setPlanePick(false) }} />
            </div>
          )}
        </div>

        {/* Right — contextual properties (read-only stub; editable in M4) */}
        <div className="flex-none w-72 bg-gray-900 border-l border-gray-800 overflow-y-auto">
          <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">Properties</span>
            {sel && (
              <span className={`text-[8px] px-1 py-0.5 rounded font-bold tracking-wide ${
                sel.generated ? 'bg-amber-900/60 text-amber-300' : 'bg-emerald-900/50 text-emerald-300'
              }`}>{sel.label}</span>
            )}
          </div>
          {selected ? (
            <div className="px-3 py-2 text-xs">
              {/* Validation banner (§6.2) */}
              {selIssues.length > 0 && (
                <div className="mb-2 rounded border border-gray-700 overflow-hidden">
                  {selIssues.map((is, i) => (
                    <div key={i} className={`px-2 py-1 text-[11px] flex items-start gap-1.5 ${
                      is.level === 'error' ? 'bg-red-950/50 text-red-300' : 'bg-amber-950/40 text-amber-300'
                    }`}>
                      <span>{is.level === 'error' ? '⛔' : '⚠'}</span><span>{is.msg}</span>
                    </div>
                  ))}
                </div>
              )}
              {selLocked && (
                <div className="mb-2 text-[10px] text-amber-400/80 leading-snug">
                  Generated operation — read-only (it’s re-created on every sync).
                  “Convert to manual override” arrives in M5.
                </div>
              )}

              {/* Slave pointer (§5.5): edit it on the source part, not here. */}
              {sel?.kind === 'slave' && (
                <div className="mb-2 text-[10px] text-sky-300/80 leading-snug">
                  Slave hole — fired by a master on{' '}
                  <span className="font-mono text-sky-200">{String(selected.parameters?.master_source_part_key ?? '?')}</span>.
                  Edit it on that part.
                </div>
              )}

              {/* Role (§2, §7.1) — hand ops only. Master fires a slave onto the
                  coincident part; Joint snapshots a library joint (§6). */}
              {!selLocked && (
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-gray-500 text-[10px] uppercase tracking-wider">Role</span>
                  <div className="flex rounded overflow-hidden border border-gray-700">
                    {(['local', 'master', 'joint'] as const).map(r => {
                      const active = (selected.operation_role ?? 'local') === r
                      return (
                        <button key={r} type="button"
                          onClick={() => { if (!active) patchOp({ operation_role: r, is_master: isFiringRole(r), ...(r !== 'joint' ? { joint_type_id: null } : {}) }) }}
                          className={`px-2 py-0.5 text-[11px] capitalize ${active ? 'bg-violet-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>
                          {r}
                        </button>
                      )
                    })}
                  </div>
                  {firing && <span className="text-[9px] text-violet-300">firing…</span>}
                </div>
              )}
              {!selLocked && selected.operation_role === 'master' && (
                <div className="mb-2 text-[10px] text-violet-300/80 leading-snug">
                  Master — fires a matching hole onto whatever part its plane/edge touches at this position.
                </div>
              )}
              {/* Double-fire advisory (§6.1) — non-blocking. */}
              {!selLocked && isFiringRole(selected.operation_role) && selected.plane_kind === 'edge' && (
                <div className="mb-2 text-[10px] text-amber-300/80 leading-snug">
                  ⚠ If this edge also has an automatic construction-method joint, both will fire (possible double-drill).
                </div>
              )}

              {jointPicking ? (
                /* Enforced-first joint picker (§7.1) — the one "you must pick this" case. */
                <div className="mb-2">
                  <div className="text-[10px] text-violet-300 mb-1">Pick a joint from the library:</div>
                  <input autoFocus type="text" value={jointQuery} onChange={e => setJointQuery(e.target.value)}
                    placeholder="Search joints…"
                    className="w-full mb-1.5 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-100 focus:outline-none focus:border-violet-500" />
                  <div className="flex flex-col gap-0.5 max-h-64 overflow-y-auto">
                    {jointHits.length === 0 && <div className="text-[10px] text-gray-500 px-1 py-2">No matching joints.</div>}
                    {jointHits.map(j => (
                      <button key={j.id} type="button" onClick={() => pickJoint(j)}
                        className="text-left px-2 py-1 rounded bg-gray-800 hover:bg-violet-900/40 border border-gray-700 hover:border-violet-600">
                        <div className="text-gray-100 text-[11px]">{j.name}</div>
                        <div className="text-gray-500 text-[9px]">{j.ops.map(o => `${o.target_part === 'part_a' ? 'A' : 'B'}:${o.machine_operation}`).join(' · ') || 'no ops'}</div>
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={() => patchOp({ operation_role: 'local', is_master: false })}
                    className="mt-1.5 text-[10px] text-gray-400 hover:text-gray-200">Cancel — back to Local</button>
                </div>
              ) : (
              <>
              {/* Joint header (§6): chosen joint + re-sync, once picked. */}
              {!selLocked && selected.operation_role === 'joint' && selected.joint_type_id && (
                <div className="mb-2 flex items-center justify-between gap-2 rounded border border-violet-800/60 bg-violet-950/30 px-2 py-1">
                  <span className="text-[11px] text-violet-200">Joint: <span className="font-medium">{jointName}</span></span>
                  <div className="flex gap-1">
                    <button type="button" onClick={resyncJointsFromLibrary} title="Re-read the library and re-materialise every joint op in this cabinet"
                      className="text-[9px] px-1.5 py-0.5 rounded border border-violet-700 text-violet-200 hover:bg-violet-800/40">Re-sync</button>
                    <button type="button" onClick={() => patchOp({ joint_type_id: null })}
                      className="text-[9px] px-1.5 py-0.5 rounded border border-gray-700 text-gray-300 hover:bg-gray-800">Change</button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 items-center">
                <span className="text-gray-500">Type</span>
                <select value={selected.operation_type} disabled={selLocked}
                  onChange={e => patchOp({ operation_type: e.target.value })}
                  className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-gray-100 disabled:text-gray-500 disabled:bg-gray-900/60 focus:outline-none focus:border-blue-500">
                  {/* keep any legacy value selectable */}
                  {!(TYPE_OPTIONS as readonly string[]).includes(selected.operation_type) && <option value={selected.operation_type}>{selected.operation_type}</option>}
                  {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>

                <span className="text-gray-500">Action</span>
                <select value={selected.operation_action ?? ''} disabled={selLocked}
                  onChange={e => patchOp({ operation_action: e.target.value || null })}
                  className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-gray-100 disabled:text-gray-500 disabled:bg-gray-900/60 focus:outline-none focus:border-blue-500">
                  {ACTION_OPTIONS.map(a => <option key={a} value={a}>{a === '' ? '—' : a}</option>)}
                </select>

                <span className="text-gray-600 col-span-2 text-[9px] uppercase tracking-wider pt-1">Position (part-local)</span>
                <span className="text-gray-500">X</span>
                <NumField key={`${selected.id}-px`} value={selected.pos_x} disabled={selLocked} onCommit={x => patchOp({ pos_x: x })} />
                <span className="text-gray-500">Y</span>
                <NumField key={`${selected.id}-py`} value={selected.pos_y} disabled={selLocked} onCommit={x => patchOp({ pos_y: x })} />
                <span className="text-gray-500">Z (depth)</span>
                <NumField key={`${selected.id}-pz`} value={selected.pos_z} disabled={selLocked} onCommit={x => patchOp({ pos_z: x })} />

                {selected.operation_type === 'drill' ? (
                  <>
                    <span className="text-gray-600 col-span-2 text-[9px] uppercase tracking-wider pt-1">Drill</span>
                    <span className="text-gray-500">⌀ Diameter</span>
                    <NumField key={`${selected.id}-dia`} value={selected.diameter} disabled={selLocked} onCommit={x => patchOp({ diameter: x })} />
                    <span className="text-gray-500">Depth</span>
                    <NumField key={`${selected.id}-dep`} value={selected.depth} disabled={selLocked} onCommit={x => patchOp({ depth: x })} />
                    <span className="text-gray-500">Repeat ×</span>
                    <NumField key={`${selected.id}-rc`} value={selected.repeat_count} disabled={selLocked} onCommit={x => patchOp({ repeat_count: Math.max(1, Math.round(x)) })} />
                    <span className="text-gray-500">Spacing</span>
                    <NumField key={`${selected.id}-rs`} value={selected.repeat_spacing} disabled={selLocked} onCommit={x => patchOp({ repeat_spacing: x })} />
                  </>
                ) : selected.operation_type === 'groove' ? (
                  <>
                    {/* Groove = straight slot; the tool drives the profile (§3.3). Length/width/
                        depth are its own columns. Repeat + spacing turn one groove into a
                        slatted/fluted run — no N hand-placed slots. */}
                    <span className="text-gray-600 col-span-2 text-[9px] uppercase tracking-wider pt-1">Groove</span>
                    <span className="text-gray-500">Length</span>
                    <NumField key={`${selected.id}-glen`} value={selected.length} disabled={selLocked} onCommit={x => patchOp({ length: x })} />
                    <span className="text-gray-500">Width</span>
                    <NumField key={`${selected.id}-gw`} value={selected.width} disabled={selLocked} onCommit={x => patchOp({ width: x })} />
                    <span className="text-gray-500">Depth</span>
                    <NumField key={`${selected.id}-gd`} value={selected.depth} disabled={selLocked} onCommit={x => patchOp({ depth: x })} />
                    <span className="text-gray-500">Repeat ×</span>
                    <NumField key={`${selected.id}-grc`} value={selected.repeat_count} disabled={selLocked} onCommit={x => patchOp({ repeat_count: Math.max(1, Math.round(x)) })} />
                    <span className="text-gray-500">Spacing</span>
                    <NumField key={`${selected.id}-grs`} value={selected.repeat_spacing} disabled={selLocked} onCommit={x => patchOp({ repeat_spacing: x })} />
                  </>
                ) : (
                  <>
                    <span className="text-gray-600 col-span-2 text-[9px] uppercase tracking-wider pt-1">Size</span>
                    <span className="text-gray-500">dx</span>
                    <NumField key={`${selected.id}-sx`} value={selected.size_dx} disabled={selLocked} onCommit={x => patchOp({ size_dx: x })} />
                    <span className="text-gray-500">dy</span>
                    <NumField key={`${selected.id}-sy`} value={selected.size_dy} disabled={selLocked} onCommit={x => patchOp({ size_dy: x })} />
                    <span className="text-gray-500">dz (depth)</span>
                    <NumField key={`${selected.id}-sz`} value={selected.size_dz} disabled={selLocked} onCommit={x => patchOp({ size_dz: x })} />
                  </>
                )}

                <span className="text-gray-600 col-span-2 text-[9px] uppercase tracking-wider pt-1">Angle</span>
                <span className="text-gray-500">ax</span>
                <NumField key={`${selected.id}-ax`} value={selected.angle_ax} disabled={selLocked} onCommit={x => patchOp({ angle_ax: x })} />
                <span className="text-gray-500">ay</span>
                <NumField key={`${selected.id}-ay`} value={selected.angle_ay} disabled={selLocked} onCommit={x => patchOp({ angle_ay: x })} />
                <span className="text-gray-500">az</span>
                <NumField key={`${selected.id}-az`} value={selected.angle_az} disabled={selLocked} onCommit={x => patchOp({ angle_az: x })} />

                <span className="text-gray-600 col-span-2 text-[9px] uppercase tracking-wider pt-1">Plane / output</span>
                {selLocked ? (
                  <>
                    <PropRow label="Plane" value={PLANE_KIND_LABEL[selected.plane_kind ?? 'face_front'] ?? selected.plane_kind} />
                    {selected.plane_kind === 'edge' && (
                      <PropRow label="Edge" value={selected.plane_edge_index != null ? `${selected.plane_edge_index} · ${PLANE_EDGES[selected.plane_edge_index] ?? '?'}` : '—'} />
                    )}
                  </>
                ) : (
                  <>
                    <span className="text-gray-500 self-center">Plane</span>
                    <select value={selected.plane_kind ?? 'face_front'}
                      onChange={e => { const pk = e.target.value; patchOp(pk === 'edge' ? { plane_kind: pk } : { plane_kind: pk, plane_edge_index: null }); if (pk !== 'edge') setPlanePick(false) }}
                      className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-gray-100 focus:outline-none focus:border-blue-500">
                      {PLANE_KINDS.map(pk => <option key={pk} value={pk}>{PLANE_KIND_LABEL[pk]}</option>)}
                    </select>
                    {selected.plane_kind === 'edge' && (
                      <>
                        <span className="text-gray-500 self-center">Edge</span>
                        <div className="flex gap-1 justify-end items-center">
                          <select value={selected.plane_edge_index ?? ''}
                            onChange={e => patchOp({ plane_edge_index: e.target.value === '' ? null : Number(e.target.value) })}
                            className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-gray-100 focus:outline-none focus:border-blue-500">
                            <option value="">—</option>
                            {PLANE_EDGES.map((lbl, i) => <option key={i} value={i}>{i} · {lbl}</option>)}
                          </select>
                          <button type="button"
                            onClick={() => { setView('front'); setMeasuring(false); setPlanePick(p => !p) }}
                            className={`px-1.5 py-0.5 rounded text-[10px] border ${planePick ? 'bg-violet-600 border-violet-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-violet-500'}`}>
                            {planePick ? 'Picking…' : 'Pick in view'}
                          </button>
                        </div>
                      </>
                    )}
                  </>
                )}
                <PropRow label="Out face" value={selected.output_face ?? '—'} />

                <span className="text-gray-600 col-span-2 text-[9px] uppercase tracking-wider pt-1">Tool</span>
                <span className="text-gray-500 self-center">Tool set</span>
                <select value={selected.tool_set_id ?? ''} disabled={selLocked}
                  onChange={e => patchOp({ tool_set_id: e.target.value || null })}
                  className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-gray-100 disabled:text-gray-500 disabled:bg-gray-900/60 focus:outline-none focus:border-blue-500">
                  <option value="">— none —</option>
                  {toolSets.map(ts => <option key={ts.id} value={ts.id}>{ts.name}</option>)}
                </select>
                {!selected.tool_set_id && (
                  <>
                    <span className="text-gray-500 self-center">Bit</span>
                    <OperationToolSelect
                      operationType={selected.operation_type}
                      value={{ router_tool_id: selected.router_tool_id, drill_id: selected.drill_id, auto_tool: selected.auto_tool }}
                      tools={tools} drills={drills} disabled={selLocked}
                      onChange={val => patchOp({ router_tool_id: val.router_tool_id, drill_id: val.drill_id, auto_tool: val.auto_tool })}
                      className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-gray-100 disabled:text-gray-500 disabled:bg-gray-900/60 focus:outline-none focus:border-blue-500"
                    />
                  </>
                )}

                <span className="text-gray-500 self-center">CNC output</span>
                <label className="flex items-center gap-1.5 justify-end">
                  <input type="checkbox" checked={selected.output_to_cnc} disabled={selLocked}
                    onChange={e => patchOp({ output_to_cnc: e.target.checked })}
                    className="accent-blue-500 w-3.5 h-3.5 disabled:opacity-50" />
                  <span className="text-gray-400 text-[10px]">{selected.output_to_cnc ? 'included' : 'excluded'}</span>
                </label>
              </div>

              <div className="mt-3 flex flex-col gap-1.5">
                {selLocked ? (
                  <button onClick={() => void convertToManual()}
                    className="w-full text-[11px] px-2 py-1 rounded border border-amber-700/60 text-amber-300 hover:bg-amber-900/30 transition-colors">
                    Convert to manual override
                  </button>
                ) : (
                  <button onClick={() => void deleteSelected()}
                    className="w-full text-[11px] px-2 py-1 rounded border border-red-800/60 text-red-300 hover:bg-red-900/30 transition-colors">
                    Delete operation
                  </button>
                )}
              </div>
              <div className="mt-2 text-[10px] text-gray-600 leading-snug">
                Drag-to-place arrives later in Phase 2. Undo with ↺ / Ctrl+Z.
              </div>
              </>
              )}
            </div>
          ) : (
            <div className="p-4 text-xs text-gray-500">
              Select an operation to see and edit its properties.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
