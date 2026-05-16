import { AssemblyClass } from '@/src/lib/types'
import { MIN_ZOOM, MAX_ZOOM } from '@/src/lib/geometry'
import type { Wall, CabinetInstance } from '@/src/lib/types'
import type { Pt } from '@/src/lib/geometry'
import type { DisplayConfig, PresetId, LayerId } from '@/src/lib/displayConfig'
import { DEFAULT_DISPLAY_CONFIG, applyPreset, toggleLayer, cycleLayerStyle } from '@/src/lib/displayConfig'

export type { DisplayConfig, PresetId, LayerId }
export { DEFAULT_DISPLAY_CONFIG, applyPreset, toggleLayer, cycleLayerStyle }

export type CanvasView = 'plan' | 'elevation' | '3d'

export type Mode =
  | 'select' | 'draw_wall' | 'draw_island'
  | 'place_base' | 'place_wall_unit' | 'place_tall' | 'place_end_panel'
  | 'place_base_corner' | 'place_wall_corner' | 'place_tall_corner'
  | 'paste'

export type Selected = { type: 'wall'; id: string } | { type: 'cabinet'; id: string } | null

export type ContextMenuState = { x: number; y: number; cabId?: string; wallId?: string }

export type PlaceGhost = { wall: Wall; pos_x: number; pos_y: number; islandFlip?: boolean }

export type CabDrag = { id: string; pos_x: number; pos_y: number }

// Cross-wall move drag: cabinet being picked up from one wall and dropped onto another
export type CabMoveDrag = { id: string; wall: Wall; pos_x: number; pos_y: number; islandFlip: boolean }

export type CabResize = {
  cabId: string
  dim: 'dx' | 'dz' | 'dy'
  side: 'left' | 'right' | 'front' | 'top'
  wall: Wall
  perp: Pt
  startCabT: number
  startCabEndT: number
  liveValue: number
  livePosX?: number
  livePosY?: number
}

export type MenuItem = { label: string; action?: () => void; disabled?: boolean; shortcut?: string } | null
export type MenuGroup = { label: string; items: MenuItem[] }

export interface ViewState { panX: number; panY: number; zoom: number }
export type ViewAction =
  | { type: 'pan'; dx: number; dy: number }
  | { type: 'zoom'; factor: number; svgX: number; svgY: number }
  | { type: 'set'; panX: number; panY: number; zoom: number }

export function viewReducer(s: ViewState, a: ViewAction): ViewState {
  switch (a.type) {
    case 'pan': return { ...s, panX: s.panX + a.dx, panY: s.panY + a.dy }
    case 'zoom': {
      const nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s.zoom * a.factor))
      return { panX: a.svgX - (a.svgX - s.panX) * (nz / s.zoom), panY: a.svgY - (a.svgY - s.panY) * (nz / s.zoom), zoom: nz }
    }
    case 'set': return { panX: a.panX, panY: a.panY, zoom: a.zoom }
  }
}

export function modeAssemblyClass(m: Mode): { cls: AssemblyClass; ep: boolean } | null {
  if (m === 'place_base')        return { cls: 'base',        ep: false }
  if (m === 'place_wall_unit')   return { cls: 'wall',        ep: false }
  if (m === 'place_tall')        return { cls: 'tall',        ep: false }
  if (m === 'place_end_panel')   return { cls: 'base',        ep: true  }
  if (m === 'place_base_corner') return { cls: 'base_corner', ep: false }
  if (m === 'place_wall_corner') return { cls: 'wall_corner', ep: false }
  if (m === 'place_tall_corner') return { cls: 'tall_corner', ep: false }
  return null
}

// Re-export types used across canvas files so imports stay short
export type { Wall, CabinetInstance, Pt }
