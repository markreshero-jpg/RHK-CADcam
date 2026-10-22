import type { CabinetInstance } from '@/src/lib/types'
import { GRID_STEPS } from '@/src/lib/geometry'
import type { PlanGridPrefs } from '@/src/lib/userPrefs'
import type {
  Mode, Selected, PlaceGhost, MenuGroup, ViewAction, CanvasView,
} from './canvasTypes'
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
  /** Room → Centre Room: fit + centre the plan on everything in the room. */
  centreRoom:   () => void
  switchView:   (v: CanvasView) => void
  // Display layers
  openLayerManager: () => void
  // Plan reference grid (per-user, localStorage)
  planGrid:       PlanGridPrefs
  setPlanGrid:    (next: PlanGridPrefs) => void
  // Modals
  setJobModalTab:    (tab: JobPropertiesTab) => void
  setRoomModalTab:   (tab: RoomPropertiesTab) => void
  openReportModal:   (scope: ReportScope) => void
  /** Production → Shop Drawings: the room's reports window, opened on the package. */
  openShopDrawings:  () => void
  openObjectTree:    () => void
  openRoomSwitcher:  () => void
  openAddRoom:       () => void
  // Current project (for the Panel Optimiser entry point)
  projectId:         string | null
  // Tutorial mode (z_tutorial)
  tutorialOn:        boolean
  setTutorialOn:     (on: boolean) => void
}

export function buildMenus(a: MenuActions): MenuGroup[] {
  return [
    { label: 'File', items: [
      { label: '← Back to Projects', action: () => { window.location.href = '/' } },
      null,
      { label: 'Tutorial mode', checked: a.tutorialOn, action: () => a.setTutorialOn(!a.tutorialOn) },
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
    { label: 'Layers', items: [
      { label: 'Manage Layers…', action: () => a.openLayerManager() },
      null,
      { label: 'Show Grid', checked: a.planGrid.visible,
        action: () => a.setPlanGrid({ ...a.planGrid, visible: !a.planGrid.visible }) },
      null,
      { label: 'Grid: Auto', checked: a.planGrid.visible && a.planGrid.step === 0, disabled: !a.planGrid.visible,
        action: () => a.setPlanGrid({ ...a.planGrid, step: 0 }) },
      ...GRID_STEPS.map(step => ({
        label: `Grid: ${step} mm`,
        checked: a.planGrid.visible && a.planGrid.step === step,
        disabled: !a.planGrid.visible,
        action: () => a.setPlanGrid({ ...a.planGrid, step }),
      })),
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
      { label: 'Centre Room',  action: () => a.centreRoom() },
      null,
      { label: 'Construction', action: () => a.setRoomModalTab('construction') },
      { label: 'Hardware',     action: () => a.setRoomModalTab('hardware') },
      { label: 'Doors',        action: () => a.setRoomModalTab('doors') },
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
      { label: 'Shop Drawings…',     action: () => a.openShopDrawings() },
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
