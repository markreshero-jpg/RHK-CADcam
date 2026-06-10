import { AssemblyClass } from '@/src/lib/types'
import { MIN_ZOOM, MAX_ZOOM } from '@/src/lib/geometry'
import type { Wall, CabinetInstance, BenchtopArcSegment } from '@/src/lib/types'
import type { Pt } from '@/src/lib/geometry'
import type { DisplayConfig, PresetId, LayerId, AnnotationId } from '@/src/lib/displayConfig'
import { DEFAULT_DISPLAY_CONFIG, applyPreset, toggleLayer, cycleLayerStyle, toggleAnnotation } from '@/src/lib/displayConfig'

export type { DisplayConfig, PresetId, LayerId, AnnotationId }
export { DEFAULT_DISPLAY_CONFIG, applyPreset, toggleLayer, cycleLayerStyle, toggleAnnotation }

export type CanvasView = 'plan' | 'elevation' | 'section' | '3d'

export type SectionCut = { x1: number; y1: number; x2: number; y2: number; lookDir: 1 | -1 }

export type Mode =
  | 'select' | 'draw_wall' | 'draw_island' | 'draw_section' | 'measure'
  | 'draw_benchtop' | 'draw_benchtop_rect' | 'draw_benchtop_l' | 'draw_benchtop_u'
  | 'draw_benchtop_cutout_rect' | 'draw_benchtop_cutout_circle'
  | 'place_base' | 'place_wall_unit' | 'place_tall' | 'place_end_panel'
  | 'place_base_corner' | 'place_wall_corner' | 'place_tall_corner'
  | 'place_definition'
  | 'paste'

// A library definition armed for placement. Carries the geometry the ghost needs
// (assembly_class for collision/blocking, default dims for the footprint) plus the
// definition id, which placeCabinetFromDefinition copies into the new instance.
export type ArmedDefinition = {
  id:             string
  assembly_class: AssemblyClass
  dx:             number
  dy:             number
  dz:             number
  name:           string
}

export type Selected = { type: 'wall'; id: string } | { type: 'cabinet'; id: string } | { type: 'benchtop'; id: string } | null

export type ContextMenuState = { x: number; y: number; cabId?: string; wallId?: string; elevWallId?: string; elevWallT?: number; benchtopId?: string; vertexContext?: { btId: string; vi: number } }

// pos_x/pos_y = snapped back-left landing on the wall.
// freePos = raw cursor world position so the ghost can float at the cursor (matches
// elevation placement); absent = flat-snapped to wall (paste / copy-drag).
export type PlaceGhost = { wall: Wall; pos_x: number; pos_y: number; islandFlip?: boolean; freePos?: { x: number; y: number }; fitDx?: number }

export type CabDrag = { id: string; pos_x: number; pos_y: number }

// Cross-wall move drag / free-float: cabinet picked up and following cursor.
// freePos = raw cursor world position when floating freely; absent = snapped to wall.
export type CabMoveDrag = { id: string; wall: Wall; pos_x: number; pos_y: number; islandFlip: boolean; freePos?: { x: number; y: number } }

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

export type BtMoveDrag = { id: string; originX: number; originY: number; originalPolygon: Array<{x:number;y:number}>; originalArcs: BenchtopArcSegment[]; hasMoved: boolean }
export type BtRotateDrag = { id: string; originX: number; originY: number; centX: number; centY: number; startAngle: number; hasMoved: boolean; originalPolygon: Array<{x:number;y:number}>; originalArcs: BenchtopArcSegment[] }

export type MenuItem = { label: string; action?: () => void; disabled?: boolean; shortcut?: string; checked?: boolean } | null
export type MenuGroup = { label: string; items: MenuItem[] }

export type ContextMenuSubItem = { label: string; onClick: () => void; disabled?: boolean; color?: 'red' | 'blue' | 'amber' }
export type ContextMenuItem = { label: string; onClick?: () => void; children?: ContextMenuSubItem[]; disabled?: boolean; color?: 'red' | 'blue' | 'amber' } | null

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
export type { Wall, CabinetInstance, BenchtopArcSegment, Pt }
