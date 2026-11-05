'use client'

// ============================================================
// Part Editor — data/mutation layer for one part's operations.
// Owns the ops list, selection, undo stack, live firing and the
// joint library; reuses CabinetRoutesPanel's insert/patch/delete
// shape against part_operations. The shell (PartEditor.tsx) and
// panels consume this hook and stay purely presentational.
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { PartMeta } from '@/src/components/three/PartViewer'
import { isFiringRole } from '@/src/lib/partOps/enums'
import { pointInShape, sampleOutline, type ShapePt } from '@/src/lib/shapePath'
import { syncMasterSlaves } from '@/src/lib/optimiser/masterSlaveSync'
import { syncSeamDrillOperations } from '@/src/lib/optimiser/seamDrillSync'
import { opFrameMirrored } from '@/src/lib/optimiser/partFootprint'
import type { PartOp } from '../CabinetRoutesPanel'
import {
  ANGLE_FIELDS, classify, flatDims, roundAngle, roundStore, sourceTableFor,
  jointSnapshotPatch, loadJointTypes, validateOp, worst,
  type AddKind, type Issue, type JointType,
} from './partEditorCore'

// Resolver cut-outs (rangehood hole in a bottom / under panel, curved-end rib
// cut-outs) as read-only CUT-OUT rows: virtual — never stored, the optimiser cuts
// them from the part's `cutouts` (normalize cutoutsToOp). Shape frame (y-down,
// as `outline`) → op frame by the same mapping the validation below uses:
// swap → pos_x = u − sy, pos_y = sx; else pos_x = sx, pos_y = v − sy.
// Each shows as its bounding rectangle, depth = thickness − onion skin.
export function cutoutOps(part: PartMeta, u: number, v: number, n: number): PartOp[] {
  if (!part.cutouts?.length) return []
  const swap = part.panelKind !== 'side' && !part.dxIsWidth
  const r = (x: number) => Math.round(x * 100) / 100
  return part.cutouts.map((c, i) => {
    const pts = sampleOutline(c.pts, 2)
    const xs = pts.map(q => q.x), ys = pts.map(q => q.y)
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
    const skin = Number(c.skin) || 0
    return {
      id: `cutout_${part.id}_${i}`, source_table: 'virtual', source_part_id: null, source_cabinet_id: null, source_part_key: part.id,
      operation_type: 'route', operation_action: 'pocket', operation_role: 'local', joint_type_id: null,
      operation_key: `cutout_${i}`, router_tool_id: null, drill_id: null, auto_tool: true, tool_set_id: null,
      depth: r(n - skin), diameter: null, width: null, length: null,
      pos_x: r(swap ? u - cy : cx), pos_y: r(swap ? cx : v - cy), pos_z: null,
      size_dx: r(swap ? y1 - y0 : x1 - x0), size_dy: r(swap ? x1 - x0 : y1 - y0), size_dz: null,
      angle_ax: 0, angle_ay: 0, angle_az: 0,
      repeat_count: null, repeat_spacing: null, repeat_axis: null,
      offset_top_mm: null, offset_bottom_mm: null, offset_left_mm: null, offset_right_mm: null,
      fill_strategy: null, raster_angle_deg: null, raster_stepover_pct: null,
      output_face: null, plane_kind: 'face_front', plane_edge_index: null,
      is_master: false, master_operation_id: null, slave_table: null, slave_part_id: null,
      output_to_cnc: true, sort_order: 100000 + i,
      parameters: { generated: 'cutout', kind: 'cut-out', virtual: true, skin,
        note: skin > 0 ? `Cut-out, ${skin} onion skin left (break out after)` : 'Cut-out, through' },
      created_at: '', updated_at: '',
    }
  })
}

// shapePoly: the part's saved outline, sampled, in the shape/display frame
// (mm, y-down, authored face-front) — adds an "outside the outline" warning
// per op on top of validateOp. null/omitted = plain rectangle, no check.
export function usePartOps(cabinetId: string, part: PartMeta, shapePoly?: ShapePt[] | null) {
  const [ops, setOps]               = useState<PartOp[]>([])
  const [loadedKey, setLoadedKey]   = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Live firing (§6.2): true while syncMasterSlaves regenerates this cabinet's slaves.
  const [firing, setFiring] = useState(false)
  // Joint library (§6): types + their ops, for the enforced-first joint picker.
  const [jointTypes, setJointTypes] = useState<JointType[]>([])
  // How many slaves each master/joint op fired (§4 no-touch + multi-slave display),
  // keyed by master_operation_id. Refreshed on load + after each re-fire.
  const [slavesByMaster, setSlavesByMaster] = useState<Map<string, number>>(new Map())
  // Tool sets for the tool picker / "add tool-set op".
  const [toolSets, setToolSets] = useState<{ id: string; name: string }[]>([])
  // Session undo stack (§6.3) — closures that revert local + DB. Capped ~20.
  const undoRef = useRef<(() => Promise<void>)[]>([])
  const [undoDepth, setUndoDepth] = useState(0)
  // Derived (not effect-set) so we never call setState synchronously in an effect.
  const loading = loadedKey !== part.id

  const { u, v, n } = useMemo(() => flatDims(part), [part])

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

  // The automatic drilling (carcase seam joints, hinge cups/plates, slide holes)
  // is computed live by the resolver and only materialised into part_operations by
  // seamDrillSync — which otherwise runs solely on a nest/optimise pass or the
  // manual "Regenerate joint drilling" button. So on a freshly-edited cabinet those
  // rows don't exist yet and the editor would show none of them, even though the
  // 3D/elevation views draw them live. Regenerate this cabinet's generated drill
  // rows on open (idempotent wipe+reinsert; hand-added rows are left untouched),
  // THEN run the same per-part load query — so joints/hinges/slides appear as the
  // read-only generated rows they are. A sync failure is non-fatal: still load.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try { await syncSeamDrillOperations(cabinetId) }
      catch (e) { console.error('[PartEditor] regenerate joint drilling', e) }
      if (cancelled) return
      const { data, error } = await supabase.from('part_operations').select('*')
        .eq('source_cabinet_id', cabinetId)
        .eq('source_part_key', part.id)
      if (cancelled) return
      if (error) console.error('[PartEditor] load operations', error)
      setOps(((data ?? []) as PartOp[]).slice().sort((a, b) => a.sort_order - b.sort_order))
      setLoadedKey(part.id)
      void loadSlaveCounts()
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cabinetId, part.id])

  // Count materialised slaves per master op (cabinet-wide — slaves land on OTHER
  // parts), so a firing op can show "fires N slaves" or the "no touching part" state.
  async function loadSlaveCounts() {
    const { data, error } = await supabase.from('part_operations')
      .select('parameters').eq('source_cabinet_id', cabinetId).contains('parameters', { generated: 'master_slave' })
    if (error) { console.error('[PartEditor] slave counts', error); return }
    const m = new Map<string, number>()
    for (const row of (data ?? []) as { parameters: Record<string, unknown> | null }[]) {
      const mid = row.parameters?.master_operation_id as string | undefined
      if (mid) m.set(mid, (m.get(mid) ?? 0) + 1)
    }
    setSlavesByMaster(m)
  }

  // Reload this part's ops from the DB (after live firing materialises slaves).
  async function reloadOps() {
    const { data, error } = await supabase.from('part_operations').select('*')
      .eq('source_cabinet_id', cabinetId).eq('source_part_key', part.id)
    if (error) { console.error('[PartEditor] reload operations', error); return }
    setOps(((data ?? []) as PartOp[]).slice().sort((a, b) => a.sort_order - b.sort_order))
    await loadSlaveCounts()
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

  // The stored ops + this part's read-only resolver cut-outs (listed last).
  const cutOps = useMemo(() => cutoutOps(part, u, v, n), [part, u, v, n])
  const allOps = useMemo(() => cutOps.length ? [...ops, ...cutOps] : ops, [ops, cutOps])
  const selected = allOps.find(o => o.id === selectedId) ?? null
  const sel = selected ? classify(selected) : null
  const selLocked = !!sel?.generated   // generated rows are read-only (spec §3.1)

  // Validation (§6.2) — flag, never block. Recomputed from ops + part dims.
  // With a shape override, an op positioned outside the drawn outline gets an
  // extra warning: its material is cut away. Op pos is part-local (origin
  // bottom-left, x→u, y→v); the shape frame is the front display view (y-down,
  // mirror applied for right-hand twins) — same mapping the ortho glyphs use.
  // Boundary ops (edge planes) count as inside via a 1mm tolerance.
  const issuesById = useMemo(() => {
    const m: Record<string, Issue[]> = {}
    const swap = part.panelKind !== 'side' && !part.dxIsWidth
    const mirror = part.panelKind === 'side' && (part.id.includes('right_side') !== opFrameMirrored(part.id))
    const sh = swap ? u : v
    for (const op of allOps) {
      const issues = validateOp(op, u, v, n)
      if (shapePoly && shapePoly.length > 2) {
        const px = op.pos_x ?? 0, py = op.pos_y ?? 0
        const sx = swap ? py : mirror ? u - px : px
        const syUp = swap ? px : py
        if (!pointInShape({ x: sx, y: sh - syUp }, shapePoly, 1)) {
          issues.push({ level: 'warn', msg: 'Outside the shaped outline — this area is cut away' })
        }
      }
      m[op.id] = issues
    }
    return m
  }, [allOps, u, v, n, part, shapePoly])
  const levels = useMemo(() => {
    const m: Record<string, 'error' | 'warn' | undefined> = {}
    for (const op of allOps) m[op.id] = worst(issuesById[op.id])
    return m
  }, [allOps, issuesById])
  const errorCount = Object.values(levels).filter(l => l === 'error').length
  const warnCount  = Object.values(levels).filter(l => l === 'warn').length
  const selIssues  = selected ? (issuesById[selected.id] ?? []) : []
  const allGenerated = ops.length > 0 && ops.every(o => !!o.parameters?.generated)

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

  // Drag-to-place (§8). Live move = local-only (no DB, no re-fire) so dragging is
  // smooth; commit on release persists + (for masters) re-fires — never per move.
  function dragMoveOp(id: string, px: number, py: number) {
    applyLocal(id, { pos_x: px, pos_y: py })
  }
  async function commitDragOp(id: string, px: number, py: number) {
    const op = ops.find(o => o.id === id)
    if (!op) return
    const rounded = { pos_x: roundStore(px), pos_y: roundStore(py) }
    if (roundStore(op.pos_x ?? 0) === rounded.pos_x && roundStore(op.pos_y ?? 0) === rounded.pos_y) { applyLocal(id, rounded); return }
    const prev = { pos_x: op.pos_x, pos_y: op.pos_y }
    applyLocal(id, rounded)
    pushUndo(async () => { applyLocal(id, prev); await dbUpdate(id, prev); if (isFiringRole(op.operation_role)) await refire() })
    await dbUpdate(id, rounded)
    if (isFiringRole(op.operation_role)) await refire()
  }

  // Snapshot a library joint onto the selected op (§6). patchOp carries the undo +
  // (role=joint → firing) re-fire. Copy-not-link: the op keeps these values until an
  // explicit re-sync.
  async function pickJoint(jt: JointType) {
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

  // Add a hand operation (spec §5.3 kinds). Placed near the part centre so they're
  // visible immediately, on the face the editor is currently working on (front by
  // default; the caller passes 'face_back' when the Back face is active).
  async function addOp(kind: AddKind, planeKind: string = 'face_front') {
    const nextOrder = ops.length ? Math.max(...ops.map(o => o.sort_order)) + 1 : 0
    const cx = roundStore(u / 2), cy = roundStore(v / 2)
    const base = {
      source_table: sourceTableFor(part.id),
      source_cabinet_id: cabinetId,
      source_part_key: part.id,
      output_to_cnc: true,
      sort_order: nextOrder,
      plane_kind: planeKind,
      operation_role: 'local',   // §2 — every op is local until a role is chosen
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
    if (!selected || !sel?.generated || selected.parameters?.virtual) return
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

  return {
    // part frame
    u, v, n,
    // data + selection (incl. the read-only cut-out rows)
    ops: allOps, loading, selectedId, setSelectedId, selected, sel, selLocked,
    // validation
    issuesById, levels, errorCount, warnCount, selIssues, allGenerated,
    // firing + joints
    firing, jointTypes, slavesByMaster,
    // undo
    undo, undoDepth,
    // mutations
    patchOp, addOp, deleteSelected, convertToManual, reorder,
    dragMoveOp, commitDragOp, pickJoint, resyncJointsFromLibrary,
    // reference data
    toolSets,
  }
}
