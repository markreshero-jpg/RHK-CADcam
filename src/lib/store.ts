import { create } from 'zustand'
import { Project, Room, Wall, CabinetInstance } from './types'
import { DEFAULT_CONSTRUCTION_METHOD, ConstructionRules } from './defaults/constructionMethod'

interface AppState {
  project: Project | null
  room: Room | null
  walls: Wall[]
  activeWallId: string | null
  cabinets: CabinetInstance[]
  selectedCabinetId: string | null

  // Shop-level construction defaults (overridable per-job/room/cabinet)
  constructionMethod: typeof DEFAULT_CONSTRUCTION_METHOD

  // Default dimensions per assembly class mm
  dimensions: {
    base: { dy: number; dz: number }
    wall: { dy: number; dz: number }
    tall: { dy: number; dz: number }
  }

  setProject: (project: Project) => void
  setRoom: (room: Room) => void
  setWalls: (walls: Wall[]) => void
  addWall: (wall: Wall) => void
  setActiveWallId: (id: string | null) => void
  setCabinets: (cabinets: CabinetInstance[]) => void
  selectCabinet: (id: string | null) => void
  addCabinet: (cabinet: CabinetInstance) => void
  updateCabinet: (id: string, updates: Partial<CabinetInstance>) => void
  removeCabinet: (id: string) => void
  setConstructionMethod: (rules: Partial<ConstructionRules>) => void
}

export const useAppStore = create<AppState>((set) => ({
  project: null,
  room: null,
  walls: [],
  activeWallId: null,
  cabinets: [],
  selectedCabinetId: null,

  constructionMethod: DEFAULT_CONSTRUCTION_METHOD,

  dimensions: {
    base: { dy: 900,  dz: 580 },
    wall: { dy: 700,  dz: 350 },
    tall: { dy: 2100, dz: 580 },
  },

  setProject:      (project)  => set({ project }),
  setRoom:         (room)     => set({ room }),
  setWalls:        (walls)    => set({ walls }),
  addWall:         (wall)     => set((s) => ({ walls: [...s.walls, wall] })),
  setActiveWallId: (id)       => set({ activeWallId: id }),
  setCabinets:     (cabinets) => set({ cabinets }),
  selectCabinet:   (id)       => set({ selectedCabinetId: id }),

  addCabinet: (cabinet) =>
    set((s) => ({ cabinets: [...s.cabinets, cabinet] })),

  updateCabinet: (id, updates) =>
    set((s) => ({
      cabinets: s.cabinets.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    })),

  removeCabinet: (id) =>
    set((s) => ({
      cabinets: s.cabinets.filter((c) => c.id !== id),
      selectedCabinetId: s.selectedCabinetId === id ? null : s.selectedCabinetId,
    })),

  setConstructionMethod: (rules) =>
    set((s) => ({
      constructionMethod: {
        ...s.constructionMethod,
        rules: { ...s.constructionMethod.rules, ...rules },
      },
    })),
}))
