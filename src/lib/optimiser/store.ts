// ============================================================
// Panel Optimiser workspace store (Zustand).
// Holds the cross-stage working state — selections, filters,
// machine/profile, pre-opt settings, and (later) the nested
// sheets/placements. No persistence: per spec §8.2 the optimiser
// uses Zustand state, never localStorage/sessionStorage.
// ============================================================

import { create } from 'zustand'
import type { OptiSnapshot } from './types'

export type Stage = 1 | 2 | 3 | 4 | 5 | 6

export interface PreOptSettings {
  kerf: number            // saw/router kerf allowance (mm)
  pad: number             // gap padding between parts (mm)
  quality: 'fast' | 'balanced' | 'best'
  allowRotation: boolean  // test 90°/180°/270° for non-grain materials
}

interface OptiState {
  // Snapshot (set once at mount from server props)
  snapshot: OptiSnapshot | null

  stage: Stage
  maxStageReached: Stage

  // Stage 1
  machineId: string | null
  profileId: string | null

  // Stage 2 — filters (selection aids) + the actual selection
  filterRoomIds: string[]      // empty = all
  filterCabinetIds: string[]   // empty = all
  filterMaterialIds: string[]  // empty = all
  selectedUids: Set<string>    // parts included in the run
  cutQty: Record<string, number>  // per-part cut quantity override (optimiser-only)

  // Stage 3
  settings: PreOptSettings

  // Actions
  init: (snap: OptiSnapshot) => void
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
  filterRoomIds: [],
  filterCabinetIds: [],
  filterMaterialIds: [],
  selectedUids: new Set(),
  cutQty: {},
  settings: { ...DEFAULT_SETTINGS },

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
    }
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
}))
