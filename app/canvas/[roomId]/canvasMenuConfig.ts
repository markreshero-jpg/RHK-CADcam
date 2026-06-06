import type { CabinetInstance } from '@/src/lib/types'
import type {
  Mode, Selected, PlaceGhost, MenuGroup, ViewAction, CanvasView, DisplayConfig,
} from './canvasTypes'
import { toggleAnnotation } from './canvasTypes'
import type { JobPropertiesTab } from './JobPropertiesModal'
import type { RoomPropertiesTab } from './RoomPropertiesModal'
import type { ReportScope } from './ReportsModal'

export interface MenuActions {
  // Undo / redo
  canUndo: boolean
  canRedo: boolean
  handleUndo: () => void
  handleRedo: () => void
  // Selection & clipboard
  selected:       Selected
  cabinets:       CabinetInstance[]
  clipboard:      CabinetInstance | null
  setClipboard:   (c: CabinetInstance | null) => void
  setMode:        (m: Mode) => void
  setPlaceGhost:  (g: PlaceGhost | null) => void
  // Delete
  handleDeleteCabinet: (id: string) => void
  handleDeleteWall:    (id: string) => void
  // View
  dispatchView: React.Dispatch<ViewAction>
  svgSize:      { w: number; h: number }
  fitToWalls:   () => void
  switchView:   (v: CanvasView) => void
  // Display / annotations
  displayConfig:    DisplayConfig
  setDisplayConfig: React.Dispatch<React.SetStateAction<DisplayConfig>>
  // Modals
  setJobModalTab:    (tab: JobPropertiesTab) => void
  setRoomModalTab:   (tab: RoomPropertiesTab) => void
  openReportModal:   (scope: ReportScope) => void
  openObjectTree:    () => void
  openRoomSwitcher:  () => void
  openAddRoom:       () => void
  // Current project (for the Panel Optimiser entry point)
  projectId:         string | null
}

export function buildMenus(a: MenuActions): MenuGroup[] {
  return [
    { label: 'File', items: [
      { label: '← Back to Projects', action: () => { window.location.href = '/' } },
      null,
      { label: 'Export…', disabled: true },
    ]},
    { label: 'Edit', items: [
      { label: 'Undo', shortcut: 'Ctrl+Z', disabled: !a.canUndo, action: () => { void a.handleUndo() } },
      { label: 'Redo', shortcut: 'Ctrl+Y', disabled: !a.canRedo, action: () => { void a.handleRedo() } },
      null,
      { label: 'Copy Cabinet',  shortcut: 'Ctrl+C', disabled: a.selected?.type !== 'cabinet',
        action: () => {
          const cab = a.cabinets.find(c => c.id === a.selected?.id)
          if (cab) { a.setClipboard(cab); a.setMode('paste'); a.setPlaceGhost(null) }
        },
      },
      { label: 'Paste Cabinet', shortcut: 'Ctrl+V', disabled: !a.clipboard,
        action: () => { if (a.clipboard) { a.setMode('paste'); a.setPlaceGhost(null) } },
      },
      null,
      { label: 'Delete', shortcut: 'Del', disabled: !a.selected,
        action: () => {
          if (a.selected?.type === 'cabinet') a.handleDeleteCabinet(a.selected.id)
          if (a.selected?.type === 'wall')    a.handleDeleteWall(a.selected.id)
        },
      },
    ]},
    { label: 'View', items: [
      { label: 'Zoom In',       shortcut: '+', action: () => a.dispatchView({ type: 'zoom', factor: 1.25,    svgX: a.svgSize.w / 2, svgY: a.svgSize.h / 2 }) },
      { label: 'Zoom Out',      shortcut: '−', action: () => a.dispatchView({ type: 'zoom', factor: 1/1.25, svgX: a.svgSize.w / 2, svgY: a.svgSize.h / 2 }) },
      { label: 'Fit to Screen', shortcut: 'F', action: a.fitToWalls },
      null,
      { label: '3D View', action: () => a.switchView('3d') },
    ]},
    { label: 'Annotations', items: [
      { label: 'Door swings (plan)',         checked: a.displayConfig.annotations.plan_door_swings,    action: () => a.setDisplayConfig(c => toggleAnnotation(c, 'plan_door_swings')) },
      { label: 'Drawer lines (plan)',        checked: a.displayConfig.annotations.plan_drawer_lines,   action: () => a.setDisplayConfig(c => toggleAnnotation(c, 'plan_drawer_lines')) },
      { label: 'Door chevrons (elevation)',  checked: a.displayConfig.annotations.elev_door_chevrons,  action: () => a.setDisplayConfig(c => toggleAnnotation(c, 'elev_door_chevrons')) },
      { label: 'Drawer labels (elevation)',  checked: a.displayConfig.annotations.elev_drawer_labels,  action: () => a.setDisplayConfig(c => toggleAnnotation(c, 'elev_drawer_labels')) },
      { label: 'Inner drawer labels (elev.)', checked: a.displayConfig.annotations.elev_inner_drawer_labels, action: () => a.setDisplayConfig(c => toggleAnnotation(c, 'elev_inner_drawer_labels')) },
      { label: 'Shelf labels (elevation)',   checked: a.displayConfig.annotations.elev_shelf_labels,    action: () => a.setDisplayConfig(c => toggleAnnotation(c, 'elev_shelf_labels')) },
      { label: 'Internal parts (elevation)', checked: a.displayConfig.annotations.elev_internal_parts, action: () => a.setDisplayConfig(c => toggleAnnotation(c, 'elev_internal_parts')) },
      { label: 'Drawer box (elevation)',     checked: a.displayConfig.annotations.elev_drawer_box,      action: () => a.setDisplayConfig(c => toggleAnnotation(c, 'elev_drawer_box')) },
    ]},
    { label: 'Job', items: [
      { label: 'Details',           action: () => a.setJobModalTab('details') },
      { label: 'Cabinet Standards', action: () => a.setJobModalTab('cabinet_standards') },
      null,
      { label: 'Overrides',         action: () => a.setJobModalTab('overrides') },
    ]},
    { label: 'Room', items: [
      { label: 'Room Details', action: () => a.setRoomModalTab('details') },
      { label: 'Switch Room',  action: () => a.openRoomSwitcher() },
      { label: 'Add New Room', action: () => a.openAddRoom() },
      null,
      { label: 'Construction', action: () => a.setRoomModalTab('construction') },
      { label: 'Hardware',     action: () => a.setRoomModalTab('hardware') },
      null,
      { label: 'Overrides',    action: () => a.setRoomModalTab('overrides') },
      null,
      { label: 'Object Tree',  action: () => a.openObjectTree() },
    ]},
    { label: 'Reports', items: [
      { label: 'Job Reports…',  action: () => a.openReportModal('job') },
      { label: 'Room Reports…', action: () => a.openReportModal('room') },
    ]},
    { label: 'Production', items: [
      { label: 'Cut List…',          action: () => a.openReportModal('room') },
      { label: 'Material Schedule…', disabled: true },
      { label: 'Shop Drawings…',     disabled: true },
      null,
      { label: 'Generate CNC…',      disabled: !a.projectId,
        action: () => { if (a.projectId) window.location.href = `/projects/${a.projectId}/optimiser` } },
    ]},
    { label: 'Help', items: [
      { label: 'Documentation',    disabled: true },
      { label: 'About RHK CADcam', disabled: true },
    ]},
  ]
}
