// ============================================================
// Panel Optimiser workspace store (Zustand).
// Holds the cross-stage working state — selections, filters,
// machine/profile, pre-opt settings, and (later) the nested
// sheets/placements. No browser persistence: per spec §8.2 the optimiser
// uses Zustand state, never localStorage/sessionStorage. Runs are saved
// to the DB at G-code time and reopened from Stage 1 (savedRuns.ts).
// ============================================================

import { create } from 'zustand'
import { materialGroupKey, buildMargins, type OptiSnapshot } from './types'
import type { NormalizedProject } from './normalize'
import { grainOrient, type GroupStock, type SheetStock, type NestResult, type NestPartInput, type Placement } from './nest'
import { findBestPlacement, findNearestValid, sheetEfficiency } from './edit'
import { blockOfUid, blockRectOn, detachFromBlock } from './grainBlocks'
import { getUserPrefs, setUserPrefs } from '../userPrefs'
import type { SavedRun, RunSnapshot } from './savedRuns'

export type Stage = 1 | 2 | 3 | 4 | 5 | 6 | 7

// Canonical Stage 2 column set. A persisted order is reconciled against this so
// columns added/removed in code never corrupt a saved layout.
export const DEFAULT_PART_COLS = ['check', 'part', 'cabinet', 'room', 'width', 'height', 'thk', 'material', 'comment', 'qty']
function reconcilePartCols(stored: string[] | null | undefined): string[] {
  if (!Array.isArray(stored)) return [...DEFAULT_PART_COLS]
  const kept = stored.filter(c => DEFAULT_PART_COLS.includes(c))
  const missing = DEFAULT_PART_COLS.filter(c => !kept.includes(c))
  return [...kept, ...missing]
}

const clone = <T,>(v: T): T => structuredClone(v)
// How a part goes onto a sheet by hand: grain-locked parts take the sheet's grain.
const placedAs = (def: NestPartInput, stock: SheetStock) => grainOrient(def, stock) ?? { w: def.w, h: def.h, rotated: false }
let pasteSeq = 0

// Any change to what gets nested (selection, qty, settings, stock) invalidates a
// prior nest layout — otherwise a stale full-run layout would carry into Stages
// 4/5. Clearing forces an explicit re-nest that respects the current inputs.
const INVALIDATE_NEST: Partial<OptiState> = { nestResult: null, partIndex: {}, editPast: [], editFuture: [], selectedUid: null }

export interface PreOptSettings {
  // Part-to-part margin is no longer set here — it's derived per material from the
  // machine profile (nest pad + tool-entry offset) + the material's routing tool Ø.
  quality: 'fast' | 'balanced' | 'best'
  allowRotation: boolean  // test 90°/180°/270° for non-grain materials
}

let offcutSeq = 0
export const nextOffcutId = () => `offcut_${++offcutSeq}`

interface OptiState {
  // Snapshot (set once at mount from server props)
  snapshot: OptiSnapshot | null

  stage: Stage
  maxStageReached: Stage

  // Stage 1
  machineId: string | null
  profileId: string | null

  // Stage 2 — batch projects in scope (initiating project + any added)
  includedProjectIds: string[]

  // Stage 2 — column order (session-persistent; no localStorage) + filters + selection
  partColOrder: string[]
  filterRoomIds: string[]      // empty = all
  filterCabinetIds: string[]   // empty = all
  filterMaterialIds: string[]  // empty = all
  selectedUids: Set<string>    // parts included in the run
  cutQty: Record<string, number>  // per-part cut quantity override (optimiser-only)

  // Stage 3 — settings + per-material-group stock (keyed by materialGroupKey)
  settings: PreOptSettings
  stock: Record<string, GroupStock>

  // Stage 4 — nesting result (in-memory workspace; persisted only at G-code time)
  nestResult: NestResult | null
  nesting: boolean

  // Stage 5 — manual editing
  partIndex: Record<string, NestPartInput>   // every expanded instance by uid
  currentSheet: number
  selectedUid: string | null
  clipboard: NestPartInput[]
  clipboardMode: 'cut' | 'copy'              // cut → relocate from unplaced; copy → duplicate
  editPast: NestResult[]
  editFuture: NestResult[]
  editError: string | null

  // Stage 6 — the saved run behind the current layout (savedRuns.ts). Its files
  // and holes are reused while `savedRun.nest === nestResult`.
  savedRun: SavedRun | null

  // Actions
  init: (snap: OptiSnapshot) => void
  mergeProjectData: (projectId: string, data: NormalizedProject) => void
  removeProjectData: (projectId: string) => void
  setStage: (s: Stage) => void
  setMachine: (id: string | null) => void
  setProfile: (id: string | null) => void
  setFilterRooms: (ids: string[]) => void
  setFilterCabinets: (ids: string[]) => void
  setFilterMaterials: (ids: string[]) => void
  togglePart: (uid: string) => void
  setSelected: (uids: string[]) => void
  setCutQty: (uid: string, qty: number) => void
  setPartColOrder: (order: string[]) => void
  setPartComment: (uid: string, comment: string) => void
  setPartLabel: (uid: string, label: string) => void
  setSettings: (patch: Partial<PreOptSettings>) => void
  ensureStock: (key: string, seed: SheetStock) => void
  setStock: (key: string, patch: Partial<SheetStock>) => void
  addOffcut: (key: string, offcut: SheetStock) => void
  removeOffcut: (key: string, index: number) => void
  setNestResult: (r: NestResult | null) => void
  setNesting: (b: boolean) => void
  setPartIndex: (idx: Record<string, NestPartInput>) => void
  setCurrentSheet: (i: number) => void
  selectPlacement: (uid: string | null) => void
  setEditError: (m: string | null) => void
  movePartWithin: (uid: string, x: number, y: number) => void
  /** Move a grain match block's fronts together (z_grain_match G4). */
  moveBlockBy: (uids: string[], dx: number, dy: number) => void
  rotatePart: (uid: string) => void
  relocatePart: (uid: string, targetSheetIndex: number, x: number, y: number) => void
  removeToUnplaced: (uid: string) => void
  placeFromUnplaced: (uid: string, sheetIndex: number, x: number, y: number) => void
  copyToClipboard: (uid: string) => void
  cutToClipboard: (uid: string) => void
  pasteClipboard: (sheetIndex: number) => void
  addSheet: (stock: SheetStock, materialId: string | null, thickness: number) => void
  deleteSheet: (index: number) => void
  resizeSheet: (index: number, w: number, h: number) => void
  undo: () => void
  redo: () => void
  setSavedRun: (r: SavedRun | null) => void
  /** Reopen a saved run: the workspace as it was when its G-code was made. */
  restoreRun: (snap: RunSnapshot, run: SavedRun) => void
}

export const DEFAULT_SETTINGS: PreOptSettings = {
  quality: 'balanced',
  allowRotation: true,
}

export const useOptiStore = create<OptiState>((set) => ({
  snapshot: null,
  stage: 1,
  maxStageReached: 1,
  machineId: null,
  profileId: null,
  includedProjectIds: [],
  partColOrder: [...DEFAULT_PART_COLS],
  filterRoomIds: [],
  filterCabinetIds: [],
  filterMaterialIds: [],
  selectedUids: new Set(),
  cutQty: {},
  settings: { ...DEFAULT_SETTINGS },
  stock: {},
  nestResult: null,
  nesting: false,
  partIndex: {},
  currentSheet: 0,
  selectedUid: null,
  clipboard: [],
  clipboardMode: 'copy',
  editPast: [],
  editFuture: [],
  editError: null,
  savedRun: null,

  init: (snap) => set(() => {
    // Default machine/profile to the marked defaults; pre-select parts flagged
    // for CNC output.
    const machine = snap.machines.find(m => m.is_default) ?? snap.machines[0] ?? null
    const profile = snap.profiles.find(p => p.cnc_machine_id === machine?.id && p.is_default)
      ?? snap.profiles.find(p => p.cnc_machine_id === machine?.id) ?? null
    const selected = new Set(snap.parts.filter(p => p.output_to_cnc).map(p => p.uid))
    return {
      snapshot: snap,
      machineId: machine?.id ?? null,
      profileId: profile?.id ?? null,
      selectedUids: selected,
      includedProjectIds: [snap.projectId],
      partColOrder: reconcilePartCols(getUserPrefs().optimiserPartCols),
    }
  }),

  mergeProjectData: (projectId, data) => set(st => {
    if (!st.snapshot || st.includedProjectIds.includes(projectId)) return {}
    const existingRoom = new Set(st.snapshot.rooms.map(r => r.id))
    const existingCab = new Set(st.snapshot.cabinets.map(c => c.id))
    const existingPart = new Set(st.snapshot.parts.map(p => p.uid))
    const snapshot: OptiSnapshot = {
      ...st.snapshot,
      rooms: [...st.snapshot.rooms, ...data.rooms.filter(r => !existingRoom.has(r.id))],
      cabinets: [...st.snapshot.cabinets, ...data.cabinets.filter(c => !existingCab.has(c.id))],
      parts: [...st.snapshot.parts, ...data.parts.filter(p => !existingPart.has(p.uid))],
    }
    const selected = new Set(st.selectedUids)
    for (const p of data.parts) if (p.output_to_cnc) selected.add(p.uid)
    return { snapshot, selectedUids: selected, includedProjectIds: [...st.includedProjectIds, projectId], ...INVALIDATE_NEST }
  }),

  removeProjectData: (projectId) => set(st => {
    if (!st.snapshot || projectId === st.snapshot.projectId) return {}   // can't remove the initiating project
    const dropPart = new Set(st.snapshot.parts.filter(p => p.project_id === projectId).map(p => p.uid))
    const dropRoom = new Set(st.snapshot.parts.filter(p => p.project_id === projectId).map(p => p.room_id))
    const dropCab = new Set(st.snapshot.parts.filter(p => p.project_id === projectId).map(p => p.cabinet_instance_id))
    const snapshot: OptiSnapshot = {
      ...st.snapshot,
      parts: st.snapshot.parts.filter(p => p.project_id !== projectId),
      rooms: st.snapshot.rooms.filter(r => !dropRoom.has(r.id)),
      cabinets: st.snapshot.cabinets.filter(c => !dropCab.has(c.id)),
    }
    const selected = new Set([...st.selectedUids].filter(u => !dropPart.has(u)))
    return { snapshot, selectedUids: selected, includedProjectIds: st.includedProjectIds.filter(id => id !== projectId), ...INVALIDATE_NEST }
  }),

  setStage: (s) => set(st => ({ stage: s, maxStageReached: Math.max(st.maxStageReached, s) as Stage })),
  setMachine: (id) => set(st => {
    // Reset profile to that machine's default when the machine changes.
    const profile = st.snapshot?.profiles.find(p => p.cnc_machine_id === id && p.is_default)
      ?? st.snapshot?.profiles.find(p => p.cnc_machine_id === id) ?? null
    return { machineId: id, profileId: profile?.id ?? null }
  }),
  setProfile: (id) => set({ profileId: id }),
  // Filters now constrain what gets nested, so a filter change invalidates a
  // prior layout (forces a fresh, filter-respecting re-nest).
  setFilterRooms: (ids) => set({ filterRoomIds: ids, ...INVALIDATE_NEST }),
  setFilterCabinets: (ids) => set({ filterCabinetIds: ids, ...INVALIDATE_NEST }),
  setFilterMaterials: (ids) => set({ filterMaterialIds: ids, ...INVALIDATE_NEST }),
  togglePart: (uid) => set(st => {
    const next = new Set(st.selectedUids)
    if (next.has(uid)) next.delete(uid); else next.add(uid)
    return { selectedUids: next, ...INVALIDATE_NEST }
  }),
  setSelected: (uids) => set({ selectedUids: new Set(uids), ...INVALIDATE_NEST }),
  setCutQty: (uid, qty) => set(st => ({ cutQty: { ...st.cutQty, [uid]: Math.max(0, qty) }, ...INVALIDATE_NEST })),
  setPartColOrder: (order) => { setUserPrefs({ optimiserPartCols: order }); set({ partColOrder: order }) },
  // Comment is part metadata, not a nest input — does NOT invalidate the layout.
  setPartComment: (uid, comment) => set(st => {
    if (!st.snapshot) return {}
    const c = comment.trim() || null
    return { snapshot: { ...st.snapshot, parts: st.snapshot.parts.map(p => p.uid === uid ? { ...p, comment: c } : p) } }
  }),
  // Display name is part metadata, not a nest input — does NOT invalidate the
  // layout. An empty name falls back to the part's default_label.
  setPartLabel: (uid, label) => set(st => {
    if (!st.snapshot) return {}
    return { snapshot: { ...st.snapshot, parts: st.snapshot.parts.map(p =>
      p.uid === uid ? { ...p, label: label.trim() || p.default_label } : p) } }
  }),
  setSettings: (patch) => set(st => ({ settings: { ...st.settings, ...patch }, ...INVALIDATE_NEST })),
  ensureStock: (key, seed) => set(st => st.stock[key]
    ? {}
    : { stock: { ...st.stock, [key]: { standard: seed, offcuts: [] } } }),
  setStock: (key, patch) => set(st => {
    const g = st.stock[key]; if (!g) return {}
    return { stock: { ...st.stock, [key]: { ...g, standard: { ...g.standard, ...patch } } }, ...INVALIDATE_NEST }
  }),
  addOffcut: (key, offcut) => set(st => {
    const g = st.stock[key]; if (!g) return {}
    return { stock: { ...st.stock, [key]: { ...g, offcuts: [...g.offcuts, offcut] } }, ...INVALIDATE_NEST }
  }),
  removeOffcut: (key, index) => set(st => {
    const g = st.stock[key]; if (!g) return {}
    return { stock: { ...st.stock, [key]: { ...g, offcuts: g.offcuts.filter((_, i) => i !== index) } }, ...INVALIDATE_NEST }
  }),
  setNestResult: (r) => set({ nestResult: r, editPast: [], editFuture: [], selectedUid: null, currentSheet: 0 }),
  setNesting: (b) => set({ nesting: b }),
  setPartIndex: (idx) => set({ partIndex: idx }),
  setCurrentSheet: (i) => set({ currentSheet: i, selectedUid: null }),
  selectPlacement: (uid) => set({ selectedUid: uid }),
  setEditError: (m) => set({ editError: m }),

  movePartWithin: (uid, x, y) => set(st => {
    if (!st.nestResult) return {}
    const next = clone(st.nestResult)
    for (const s of next.sheets) { const p = s.placements.find(p => p.uid === uid); if (p) { p.x = x; p.y = y; break } }
    return commit(st, next)
  }),

  moveBlockBy: (uids, dx, dy) => set(st => {
    if (!st.nestResult) return {}
    const next = clone(st.nestResult)
    for (const s of next.sheets) for (const p of s.placements) if (uids.includes(p.uid)) { p.x += dx; p.y += dy }
    return commit(st, next)
  }),

  rotatePart: (uid) => set(st => {
    if (!st.nestResult) return {}
    const blk = blockOfUid(st.nestResult, uid)
    if (blk) return { editError: `Grain-matched front — it turns with its ${blk.name} block, never on its own.` }
    if (st.partIndex[uid]?.grainLock) return { editError: 'Grained part — it stays with the sheet grain.' }
    const next = clone(st.nestResult)
    const margins = st.snapshot ? buildMargins(st.snapshot, st.profileId) : { byMaterial: {}, fallback: 4 }
    for (const s of next.sheets) {
      const pl = s.placements.find(p => p.uid === uid)
      if (!pl) continue
      const gap = (s.materialId != null ? margins.byMaterial[s.materialId] : undefined) ?? margins.fallback
      const nw = pl.h, nh = pl.w
      const pos = findNearestValid(s, uid, nw, nh, pl.x, pl.y, gap)
      if (!pos) return { editError: 'No room to rotate this part here.' }
      pl.w = nw; pl.h = nh; pl.rotated = !pl.rotated; pl.x = pos.x; pl.y = pos.y
      return commit(st, next)
    }
    return {}
  }),

  relocatePart: (uid, targetIndex, x, y) => set(st => {
    if (!st.nestResult) return {}
    const next = clone(st.nestResult)
    // A grain-matched front takes its whole block to the other sheet.
    const blk = blockOfUid(next, uid)
    const from = blk && next.sheets.find(s => s.placements.some(p => p.uid === uid))
    const target0 = next.sheets.find(s => s.index === targetIndex)
    if (blk && from && target0) {
      const r = blockRectOn(from, blk)!
      const margins = st.snapshot ? buildMargins(st.snapshot, st.profileId) : { byMaterial: {}, fallback: 4 }
      const gap = (target0.materialId != null ? margins.byMaterial[target0.materialId] : undefined) ?? margins.fallback
      const pos = findBestPlacement(target0, r.w, r.h, gap)
      if (!pos) return { editError: `No room on that sheet for the whole ${blk.name} block.` }
      const moving = from.placements.filter(p => blk.memberUids.includes(p.uid))
      from.placements = from.placements.filter(p => !blk.memberUids.includes(p.uid))
      for (const p of moving) { p.x += pos.x - r.x; p.y += pos.y - r.y; target0.placements.push(p) }
      return commit(st, next)
    }
    let moved: Placement | undefined
    for (const s of next.sheets) { const i = s.placements.findIndex(p => p.uid === uid); if (i >= 0) { moved = s.placements.splice(i, 1)[0]; break } }
    const target = next.sheets.find(s => s.index === targetIndex)
    if (moved && target) { moved.x = x; moved.y = y; target.placements.push(moved) }
    return commit(st, next)
  }),

  removeToUnplaced: (uid) => set(st => {
    if (!st.nestResult) return {}
    const next = clone(st.nestResult)
    for (const s of next.sheets) { const i = s.placements.findIndex(p => p.uid === uid); if (i >= 0) { s.placements.splice(i, 1); break } }
    const def = st.partIndex[uid]
    if (def) next.unplaced.push(clone(def))
    const broke = detachFromBlock(next, uid, def?.label ?? 'a front')
    return { ...commit(st, next), selectedUid: null, ...(broke ? { editError: broke } : {}) }
  }),

  placeFromUnplaced: (uid, sheetIndex, x, y) => set(st => {
    if (!st.nestResult) return {}
    const def = st.partIndex[uid]
    const next = clone(st.nestResult)
    const sheet = next.sheets.find(s => s.index === sheetIndex)
    if (!def || !sheet) return {}
    if (materialGroupKey(def.materialId, def.thickness) !== materialGroupKey(sheet.materialId, sheet.thickness)) {
      return { editError: 'Part material/thickness does not match this sheet.' }
    }
    next.unplaced = next.unplaced.filter(p => p.uid !== uid)
    sheet.placements.push({ uid, baseUid: def.baseUid, label: def.label, x, y, ...placedAs(def, sheet.stock) })
    // If this was the cut part, the clipboard is now consumed.
    const clip = st.clipboardMode === 'cut' && st.clipboard.some(c => c.uid === uid) ? { clipboard: [] } : {}
    return { ...commit(st, next), ...clip }
  }),

  copyToClipboard: (uid) => set(st => { const def = st.partIndex[uid]; return def ? { clipboard: [clone(def)], clipboardMode: 'copy' } : {} }),

  // Cut → move the part to the unplaced pool (visible) and remember it so Paste
  // can relocate it. No duplicate is created on paste (unlike copy).
  cutToClipboard: (uid) => set(st => {
    if (!st.nestResult) return {}
    const def = st.partIndex[uid]
    const next = clone(st.nestResult)
    for (const s of next.sheets) { const i = s.placements.findIndex(p => p.uid === uid); if (i >= 0) { s.placements.splice(i, 1); break } }
    if (def && !next.unplaced.some(u => u.uid === uid)) next.unplaced.push(clone(def))
    const broke = detachFromBlock(next, uid, def?.label ?? 'a front')
    return { ...commit(st, next), clipboard: def ? [clone(def)] : [], clipboardMode: 'cut', selectedUid: null, ...(broke ? { editError: broke } : {}) }
  }),

  pasteClipboard: (sheetIndex) => set(st => {
    if (!st.nestResult || !st.clipboard.length) return {}
    const next = clone(st.nestResult)
    const sheet = next.sheets.find(s => s.index === sheetIndex)
    if (!sheet) return {}
    const margins = st.snapshot ? buildMargins(st.snapshot, st.profileId) : { byMaterial: {}, fallback: 4 }
    const gap = (sheet.materialId != null ? margins.byMaterial[sheet.materialId] : undefined) ?? margins.fallback
    const sameGroup = (def: NestPartInput) => materialGroupKey(def.materialId, def.thickness) === materialGroupKey(sheet.materialId, sheet.thickness)

    if (st.clipboardMode === 'cut') {
      // Relocate the cut part(s) from the unplaced pool onto this sheet (no copy).
      let moved = false
      for (const def of st.clipboard) {
        if (!sameGroup(def)) continue
        const idx = next.unplaced.findIndex(u => u.uid === def.uid)
        if (idx < 0) continue                       // already placed elsewhere
        const o = placedAs(def, sheet.stock)
        const pos = findBestPlacement(sheet, o.w, o.h, gap)
        if (!pos) continue
        next.unplaced.splice(idx, 1)
        sheet.placements.push({ uid: def.uid, baseUid: def.baseUid, label: def.label, x: pos.x, y: pos.y, ...o })
        moved = true
      }
      if (!moved) return { editError: 'No room on this sheet for the cut part.' }
      return { ...commit(st, next), clipboard: [] }   // cut consumed
    }

    // Copy → duplicate as new instances.
    const addedIdx: Record<string, NestPartInput> = {}
    for (const def of st.clipboard) {
      if (!sameGroup(def)) continue
      const nu = `${def.baseUid}#paste${++pasteSeq}`
      const np: NestPartInput = { ...def, uid: nu }
      addedIdx[nu] = np
      const o = placedAs(def, sheet.stock)
      const pos = findBestPlacement(sheet, o.w, o.h, gap)
      if (pos) sheet.placements.push({ uid: nu, baseUid: def.baseUid, label: def.label, x: pos.x, y: pos.y, ...o })
      else next.unplaced.push(np)
    }
    return { ...commit(st, next), partIndex: { ...st.partIndex, ...addedIdx } }
  }),

  addSheet: (stock, materialId, thickness) => set(st => {
    const cur = st.nestResult ?? { sheets: [], unplaced: [] }
    const next = clone(cur)
    const index = next.sheets.length ? Math.max(...next.sheets.map(s => s.index)) + 1 : 0
    next.sheets.push({ index, materialId, thickness, stock, placements: [], efficiency: 0 })
    return commit(st, next)
  }),

  deleteSheet: (index) => set(st => {
    if (!st.nestResult) return {}
    const next = clone(st.nestResult)
    const si = next.sheets.findIndex(s => s.index === index)
    if (si < 0) return {}
    for (const p of next.sheets[si].placements) { const def = st.partIndex[p.uid]; if (def) next.unplaced.push(clone(def)) }
    next.sheets.splice(si, 1)
    return { ...commit(st, next), currentSheet: 0 }
  }),

  resizeSheet: (index, w, h) => set(st => {
    if (!st.nestResult) return {}
    const next = clone(st.nestResult)
    const sheet = next.sheets.find(s => s.index === index)
    if (!sheet) return {}
    sheet.stock = { ...sheet.stock, w, h }
    return commit(st, next)
  }),

  undo: () => set(st => {
    if (!st.editPast.length || !st.nestResult) return {}
    const prev = st.editPast[st.editPast.length - 1]
    return { nestResult: prev, editPast: st.editPast.slice(0, -1), editFuture: [st.nestResult, ...st.editFuture].slice(0, 50), selectedUid: null }
  }),

  setSavedRun: (r) => set({ savedRun: r }),

  restoreRun: (rs, run) => set(st => {
    if (!st.snapshot) return {}
    // The nested parts as they were cut win over today's (names, comments,
    // shapes); parts deleted since are put back so every label still prints.
    const saved = new Map(rs.parts.map(p => [p.uid, p]))
    const live = new Set(st.snapshot.parts.map(p => p.uid))
    const parts = [...st.snapshot.parts.map(p => saved.get(p.uid) ?? p), ...rs.parts.filter(p => !live.has(p.uid))]
    return {
      snapshot: { ...st.snapshot, parts },
      machineId: rs.machineId, profileId: rs.profileId,
      includedProjectIds: rs.includedProjectIds,
      filterRoomIds: rs.filterRoomIds, filterCabinetIds: rs.filterCabinetIds, filterMaterialIds: rs.filterMaterialIds,
      selectedUids: new Set(rs.selectedUids), cutQty: rs.cutQty,
      settings: rs.settings, stock: rs.stock,
      nestResult: run.nest, partIndex: rs.partIndex,
      editPast: [], editFuture: [], selectedUid: null, currentSheet: 0, editError: null,
      savedRun: run, stage: 7, maxStageReached: 7,
    }
  }),

  redo: () => set(st => {
    if (!st.editFuture.length) return {}
    const nextR = st.editFuture[0]
    return { nestResult: nextR, editFuture: st.editFuture.slice(1), editPast: st.nestResult ? [...st.editPast, st.nestResult].slice(-50) : st.editPast, selectedUid: null }
  }),
}))

// History-wrapping commit: snapshot the prior layout, recompute efficiencies.
function commit(st: OptiState, next: NestResult): Partial<OptiState> {
  for (const s of next.sheets) s.efficiency = sheetEfficiency(s)
  return {
    nestResult: next,
    editPast: st.nestResult ? [...st.editPast, st.nestResult].slice(-50) : st.editPast,
    editFuture: [],
    editError: null,
  }
}
