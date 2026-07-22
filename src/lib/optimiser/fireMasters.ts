// ============================================================
// Master/joint firing engine — the SHARED, PURE core (spec §5).
//
// A master (or joint-on-a-shared-edge) op sits on ONE plane/edge of its
// source part at a position, and fires a materialised "slave" operation onto
// whatever part is geometrically coincident (within epsilon) at that location
// (§5.1–5.2). This module is the single source of truth for "what fires where":
// both the editor's live preview and the optimiser's authoritative pass call it
// (§5.4), so the two can never disagree.
//
// PURE / framework-free — no supabase, no DB. masterSlaveSync.ts wraps this with
// the resolve + wipe-and-reinsert I/O (mirroring seamDrillSync). Reuses the
// resolved cabinet-space geometry (partFootprint frames + caseBox) and
// projectToFrame — it adds a coincidence test, not a new projection pipeline.
// ============================================================

import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import { caseFrame, zoneFrame, intFrame, projectToFrame, type FootprintFrame, type Axis } from './partFootprint'
import { caseBox } from '@/src/lib/jointDrilling'
import { isFiringRole } from '@/src/lib/partOps/enums'

export const GENERATED_MARK = 'master_slave'

// Epsilon default 0 mm (Pencil, §5.2 / §10) — planes must be coincident to fire.
// Tunable. Compared with a small float-dust guard so exact coincidence never misses.
export const COINCIDENCE_EPS = 0
const FLOAT = 1e-6
// A hand-added local op within this of a slave's landing blocks it (§2.1): the
// local L5 op wins, the slave defers. Matches the resolver's 0.01mm store rounding.
const COLLIDE_MM = 0.5

const round = (n: number) => Math.round(n * 100) / 100
const coordOf = (c: Pt, a: Axis) => (a === 'x' ? c.x : a === 'y' ? c.y : c.z)

type Pt = { x: number; y: number; z: number }

// The op fields the firing core reads — master sources AND existing local ops
// (the latter only for the collision test). A subset of part_operations.
export interface FireOpRow {
  id: string
  source_part_key: string | null
  operation_type: string
  operation_action: string | null
  operation_role: string | null
  pos_x: number | null
  pos_y: number | null
  pos_z: number | null
  diameter: number | null
  depth: number | null
  width: number | null
  length: number | null
  size_dx: number | null
  size_dy: number | null
  size_dz: number | null
  repeat_count: number | null
  repeat_spacing: number | null
  repeat_axis: string | null
  router_tool_id: string | null
  drill_id: string | null
  auto_tool: boolean | null
  tool_set_id: string | null
  output_to_cnc: boolean | null
  parameters: Record<string, unknown> | null
}

// A materialised slave row. DB column defaults fill anything omitted.
export interface SlaveRow {
  source_table: string
  source_cabinet_id: string
  source_part_key: string
  operation_type: string
  operation_action: string | null
  operation_role: 'local'
  is_master: false
  master_operation_id: string
  slave_table: string
  slave_part_id: null
  pos_x: number
  pos_y: number
  pos_z: number | null
  output_face: string
  diameter: number | null
  depth: number | null
  width: number | null
  length: number | null
  size_dx: number | null
  size_dy: number | null
  size_dz: number | null
  repeat_count: number | null
  repeat_spacing: number | null
  repeat_axis: string | null
  router_tool_id: string | null
  drill_id: string | null
  auto_tool: boolean | null
  tool_set_id: string | null
  output_to_cnc: boolean | null
  parameters: Record<string, unknown>
}

// A resolved part reduced to what coincidence + projection need: its footprint
// frame, the two face-plane coordinates along the frame normal, the mid plane
// (for inverting a source op), and the source_part_key form + source table.
interface PartGeom {
  key: string
  table: string
  frame: FootprintFrame
  nMin: number
  nMax: number
  nMid: number
  uExtent: number
  vExtent: number
}

const geom = (key: string, table: string, frame: FootprintFrame, nMin: number, thickness: number): PartGeom => ({
  key, table, frame, nMin, nMax: nMin + thickness, nMid: nMin + thickness / 2,
  uExtent: frame.u.extent, vExtent: frame.v.extent,
})

// Enumerate every drillable part once, keyed by its source_part_key form. Used both
// for target coincidence and for inverting a master op back to cabinet space. Matches
// the part set partOpProject supports (case / face-zone / internal); drawer-box,
// toekick and custom parts are not projected yet (returned nowhere → never targets).
function partGeoms(rp: ResolvedCabinet): Map<string, PartGeom> {
  const m = new Map<string, PartGeom>()
  for (const p of rp.case_parts) {
    const f = caseFrame(p); const b = caseBox(p)
    const nMin = f.normal === 'x' ? b.x : f.normal === 'y' ? b.y : b.z
    const thick = f.normal === 'x' ? b.w : f.normal === 'y' ? b.h : b.d
    m.set(`case_${p.part_key}`, geom(`case_${p.part_key}`, 'case_parts', f, nMin, thick))
  }
  for (const z of rp.face_zones) {
    m.set(`zone_${z.row_index}_${z.col_index}`, geom(`zone_${z.row_index}_${z.col_index}`, 'face_zones', zoneFrame(z), z.Z, z.DZ))
  }
  for (const p of rp.internal_parts) {
    const f = intFrame(p)
    if (!f) continue
    const nMin = f.normal === 'x' ? p.X : p.Y     // thickness (DZ) runs along the normal
    m.set(`int_${p.part_type}_${p.sort_order}`, geom(`int_${p.part_type}_${p.sort_order}`, 'internal_parts', f, nMin, p.DZ))
  }
  return m
}

// Invert projectToFrame: part-local (px,py) on a part's mid-thickness plane → the
// cabinet-space point. Mirror/upSign is intentionally omitted (ops are authored in
// the flat frame, not machined-face-up) — same convention as partOpProject.toCabinet.
function toCabinet(g: PartGeom, px: number, py: number): Pt {
  const c: Pt = { x: 0, y: 0, z: 0 }
  c[g.frame.u.axis] = g.frame.u.origin + g.frame.u.dir * px
  c[g.frame.v.axis] = g.frame.v.origin + g.frame.v.dir * py
  c[g.frame.normal] = g.nMid
  return c
}

export interface FireResult {
  slaves: SlaveRow[]
  skipped: number     // slaves suppressed by a local-op collision (§2.1)
  noTouch: number     // master ops whose plane touched no other part (§4)
}

// Fire every master/joint op in `ops` onto its coincident target part(s).
export function fireMasters(rp: ResolvedCabinet, ops: FireOpRow[], cabinetId: string): FireResult {
  const geoms = partGeoms(rp)

  // Existing hand-added LOCAL ops per part — used only to defer a colliding slave
  // (§2.1). Generated rows (seam joints, other slaves) and firing sources don't count.
  const localByKey = new Map<string, FireOpRow[]>()
  for (const op of ops) {
    if (op.parameters?.generated) continue
    if (isFiringRole(op.operation_role)) continue
    if (!op.source_part_key) continue
    const arr = localByKey.get(op.source_part_key) ?? []
    arr.push(op); localByKey.set(op.source_part_key, arr)
  }

  const slaves: SlaveRow[] = []
  let skipped = 0, noTouch = 0

  for (const op of ops) {
    if (!isFiringRole(op.operation_role)) continue
    if (!op.source_part_key) { noTouch++; continue }
    const src = geoms.get(op.source_part_key)
    if (!src) { noTouch++; continue }

    // The op's cabinet-space firing point (on the source part at its position).
    const C = toCabinet(src, op.pos_x ?? 0, op.pos_y ?? 0)

    let touched = false
    for (const t of geoms.values()) {
      if (t.key === src.key) continue
      // Coincidence: C sits on one of the target's two face planes (within epsilon)…
      const cN = coordOf(C, t.frame.normal)
      const sign: '+' | '-' | null =
        Math.abs(cN - t.nMax) <= COINCIDENCE_EPS + FLOAT ? '+' :
        Math.abs(cN - t.nMin) <= COINCIDENCE_EPS + FLOAT ? '-' : null
      if (!sign) continue

      // …and the point lands within the target's face area. projectToFrame reuses
      // the SAME projection math the resolver's holes use (no new projection here).
      const proj = projectToFrame({ x: C.x, y: C.y, z: C.z, axis: t.frame.normal + sign }, t.frame)
      if (!proj) continue
      if (proj.pos_x < -FLOAT || proj.pos_y < -FLOAT || proj.pos_x > t.uExtent + FLOAT || proj.pos_y > t.vExtent + FLOAT) continue

      touched = true
      const px = round(proj.pos_x), py = round(proj.pos_y)

      // Local op already here? It's L5 and more specific — it wins; slave defers (§2.1).
      const locals = localByKey.get(t.key)
      if (locals?.some(l => Math.abs((l.pos_x ?? 0) - px) <= COLLIDE_MM && Math.abs((l.pos_y ?? 0) - py) <= COLLIDE_MM)) {
        skipped++
        continue
      }

      slaves.push({
        source_table: t.table,
        source_cabinet_id: cabinetId,
        source_part_key: t.key,
        operation_type: op.operation_type,
        operation_action: op.operation_action,
        operation_role: 'local',
        is_master: false,
        master_operation_id: op.id,
        slave_table: t.table,
        slave_part_id: null,
        pos_x: px,
        pos_y: py,
        pos_z: op.pos_z,
        output_face: proj.output_face,
        diameter: op.diameter,
        depth: op.depth,
        width: op.width,
        length: op.length,
        size_dx: op.size_dx,
        size_dy: op.size_dy,
        size_dz: op.size_dz,
        repeat_count: op.repeat_count,
        repeat_spacing: op.repeat_spacing,
        repeat_axis: op.repeat_axis,
        router_tool_id: op.router_tool_id,
        drill_id: op.drill_id,
        auto_tool: op.auto_tool,
        tool_set_id: op.tool_set_id,
        output_to_cnc: op.output_to_cnc,
        parameters: { generated: GENERATED_MARK, master_operation_id: op.id, master_source_part_key: op.source_part_key },
      })
    }
    if (!touched) noTouch++
  }

  return { slaves, skipped, noTouch }
}
