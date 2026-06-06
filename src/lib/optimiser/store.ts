// ============================================================
// Panel Optimiser workspace store (Zustand).
// Holds the cross-stage working state — selections, filters,
// machine/profile, pre-opt settings, and (later) the nested
// sheets/placements. No persistence: per spec §8.2 the optimiser
// uses Zustand state, never localStorage/sessionStorage.
// ============================================================

import { create } from 'zustand'
import { materialGroupKey, type OptiSnapshot } from './types'
import type { NormalizedProject } from './normalize'
import type { GroupStock, SheetStock, NestResult, NestPartInput, Placement } from './nest'
import { findBestPlacement, sheetEfficiency } from './edit'

export type Stage = 1 | 2 | 3 | 4 | 5 | 6

const clone = <T,>(v: T): T => structuredClone(v)
let pasteSeq = 0

export interface PreOptSettings {
  kerf: number            // saw/router kerf allowance (mm)
  pad: number             // gap padding between parts (mm)
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

  // Stage 2 — filters (selection aids) + the actual selection
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
  editPast: NestResult[]
  editFuture: NestResult[]
  editError: string | null

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
}

export const DEFAULT_SETTINGS: PreOptSettings = {
  kerf: 3,
  pad: 2,
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
  editPast: [],
  editFuture: [],
  editError: null,

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
    return { snapshot, selectedUids: selected, includedProjectIds: [...st.includedProjectIds, projectId] }
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
    return { snapshot, selectedUids: selected, includedProjectIds: st.includedProjectIds.filter(id => id !== projectId) }
  }),

  setStage: (s) => set(st => ({ stage: s, maxStageReached: Math.max(st.maxStageReached, s) as Stage })),
  setMachine: (id) => set(st => {
    // Reset profile to that machine's default when the machine changes.
    const profile = st.snapshot?.profiles.find(p => p.cnc_machine_id === id && p.is_default)
      ?? st.snapshot?.profiles.find(p => p.cnc_machine_id === id) ?? null
    return { machineId: id, profileId: profile?.id ?? null }
  }),
  setProfile: (id) => set({ profileId: id }),
  setFilterRooms: (ids) => set({ filterRoomIds: ids }),
  setFilterCabinets: (ids) => set({ filterCabinetIds: ids }),
  setFilterMaterials: (ids) => set({ filterMaterialIds: ids }),
  togglePart: (uid) => set(st => {
    const next = new Set(st.selectedUids)
    if (next.has(uid)) next.delete(uid); else next.add(uid)
    return { selectedUids: next }
  }),
  setSelected: (uids) => set({ selectedUids: new Set(uids) }),
  setCutQty: (uid, qty) => set(st => ({ cutQty: { ...st.cutQty, [uid]: Math.max(0, qty) } })),
  setSettings: (patch) => set(st => ({ settings: { ...st.settings, ...patch } })),
  ensureStock: (key, seed) => set(st => st.stock[key]
    ? {}
    : { stock: { ...st.stock, [key]: { standard: seed, offcuts: [] } } }),
  setStock: (key, patch) => set(st => {
    const g = st.stock[key]; if (!g) return {}
    return { stock: { ...st.stock, [key]: { ...g, standard: { ...g.standard, ...patch } } } }
  }),
  addOffcut: (key, offcut) => set(st => {
    const g = st.stock[key]; if (!g) return {}
    return { stock: { ...st.stock, [key]: { ...g, offcuts: [...g.offcuts, offcut] } } }
  }),
  removeOffcut: (key, index) => set(st => {
    const g = st.stock[key]; if (!g) return {}
    return { stock: { ...st.stock, [key]: { ...g, offcuts: g.offcuts.filter((_, i) => i !== index) } } }
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

  relocatePart: (uid, targetIndex, x, y) => set(st => {
    if (!st.nestResult) return {}
    const next = clone(st.nestResult)
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
    return { ...commit(st, next), selectedUid: null }
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
    sheet.placements.push({ uid, baseUid: def.baseUid, label: def.label, x, y, w: def.w, h: def.h, rotated: false })
    return commit(st, next)
  }),

  copyToClipboard: (uid) => set(st => { const def = st.partIndex[uid]; return def ? { clipboard: [clone(def)] } : {} }),

  cutToClipboard: (uid) => set(st => {
    if (!st.nestResult) return {}
    const def = st.partIndex[uid]
    const next = clone(st.nestResult)
    for (const s of next.sheets) { const i = s.placements.findIndex(p => p.uid === uid); if (i >= 0) { s.placements.splice(i, 1); break } }
    next.unplaced = next.unplaced.filter(p => p.uid !== uid)
    return { ...commit(st, next), clipboard: def ? [clone(def)] : [], selectedUid: null }
  }),

  pasteClipboard: (sheetIndex) => set(st => {
    if (!st.nestResult || !st.clipboard.length) return {}
    const next = clone(st.nestResult)
    const sheet = next.sheets.find(s => s.index === sheetIndex)
    if (!sheet) return {}
    const gap = st.settings.kerf + st.settings.pad
    const addedIdx: Record<string, NestPartInput> = {}
    for (const def of st.clipboard) {
      if (materialGroupKey(def.materialId, def.thickness) !== materialGroupKey(sheet.materialId, sheet.thickness)) continue
      const nu = `${def.baseUid}#paste${++pasteSeq}`
      const np: NestPartInput = { ...def, uid: nu }
      addedIdx[nu] = np
      const pos = findBestPlacement(sheet, def.w, def.h, gap)
      if (pos) sheet.placements.push({ uid: nu, baseUid: def.baseUid, label: def.label, x: pos.x, y: pos.y, w: def.w, h: def.h, rotated: false })
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
