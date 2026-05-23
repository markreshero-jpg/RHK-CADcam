import type { CabinetInstance, Wall, Room, AssemblyClass } from '@/src/lib/types'
import { DEFAULT_DIMS } from '@/src/lib/types'
import { wallDir, findFreeSlot, cabT, cabBlocks, nextLabel } from '@/src/lib/geometry'
import { dbInsertCabinet, dbResolveAndPersistCabinet } from './canvasDB'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import type { Selected } from './canvasTypes'

interface CabinetOpsParams {
  cabinets:             CabinetInstance[]
  walls:                Wall[]
  room:                 Room
  captureSnapshot:      () => void
  setCabinets:          React.Dispatch<React.SetStateAction<CabinetInstance[]>>
  setSelected:          React.Dispatch<React.SetStateAction<Selected>>
  setResolvedParts:     React.Dispatch<React.SetStateAction<Map<string, ResolvedCabinet>>>
  setSplitCabId:        React.Dispatch<React.SetStateAction<string | null>>
  applyInputColours:    (id: string) => void
  applyInputEdgebands:  (id: string) => void
  handleUpdateCabinet:  (id: string, u: Partial<CabinetInstance>) => Promise<void>
  placeCabinet:         (wall: Wall, pos_x: number, pos_y: number, cls: AssemblyClass) => Promise<void>
}

export function useCabinetOps(p: CabinetOpsParams) {
  const {
    cabinets, walls, room, captureSnapshot,
    setCabinets, setSelected, setResolvedParts, setSplitCabId,
    applyInputColours, applyInputEdgebands,
    handleUpdateCabinet, placeCabinet,
  } = p

  function onResolved(id: string, resolved: ResolvedCabinet) {
    setResolvedParts(m => new Map(m).set(id, resolved))
    applyInputColours(id)
    applyInputEdgebands(id)
  }

  async function handleInsertAdjacent(cabId: string, type: 'panel' | 'filler', side: 'left' | 'right') {
    const cab = cabinets.find(c => c.id === cabId)
    if (!cab) return
    const wall = walls.find(w => w.id === cab.wall_id)
    if (!wall) return
    const dx = type === 'panel' ? 18 : 50
    const t = cabT(cab, wall)
    const occ = cabinets
      .filter(c => c.id !== cab.id && c.wall_id === wall.id && cabBlocks('base', c.assembly_class))
      .map(c => ({ t: cabT(c, wall), dx: c.dx }))
    const desired = side === 'right'
      ? Math.min(wall.length - dx, t + cab.dx)
      : Math.max(0, t - dx)
    const freeT = findFreeSlot(desired, dx, wall.length, occ)
    const wd = wallDir(wall)
    captureSnapshot()
    const data: Omit<CabinetInstance, 'id' | 'created_at' | 'updated_at'> = {
      room_id: room.id, wall_id: wall.id, cabinet_definition_id: null,
      label: nextLabel(cabinets, 'ep'),
      assembly_class: 'base',
      pos_x: wall.pos_x + freeT * wd.x,
      pos_y: wall.pos_y + freeT * wd.y,
      pos_z: 0, rotation: wall.angle,
      dx, dy: cab.dy, dz: cab.dz,
      has_carcass: false, has_internal: false, has_face: true, has_toekick: false,
      construction_method_id: null, top_type: 'front_rail', toe_type: 'ladder',
      left_neighbour_type: 'wall', right_neighbour_type: 'wall',
      exposed_interior: false, rule_overrides: {}, material_overrides: {},
      toekick_overrides: {}, drawerbox_overrides: {}, hardware_overrides: {},
      face_grid: null, internal_grid: null, carcase_joints: {}, schema_version: '0.4', notes: null,
    }
    const cabinet = await dbInsertCabinet(data)
    if (cabinet) {
      setCabinets(cs => [...cs, cabinet])
      setSelected({ type: 'cabinet', id: cabinet.id })
      dbResolveAndPersistCabinet(cabinet.id).then(resolved => { if (resolved) onResolved(cabinet.id, resolved) })
    }
  }

  async function handleSplitCabinet(cabId: string, count: number) {
    const cab = cabinets.find(c => c.id === cabId)
    if (!cab) return
    const wall = walls.find(w => w.id === cab.wall_id)
    if (!wall) return
    captureSnapshot()
    const newDx = cab.dx / count
    const wd = wallDir(wall)
    await handleUpdateCabinet(cab.id, { dx: newDx })
    const inserted: CabinetInstance[] = []
    for (let i = 1; i < count; i++) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, created_at, updated_at, ...rest } = cab
      const newCab = await dbInsertCabinet({
        ...rest,
        dx: newDx,
        pos_x: cab.pos_x + i * newDx * wd.x,
        pos_y: cab.pos_y + i * newDx * wd.y,
        label: nextLabel([...cabinets, ...inserted], cab.assembly_class),
      })
      if (newCab) inserted.push(newCab)
    }
    if (inserted.length) {
      setCabinets(cs => [...cs, ...inserted])
      for (const c of inserted) {
        dbResolveAndPersistCabinet(c.id).then(resolved => { if (resolved) onResolved(c.id, resolved) })
      }
    }
    setSplitCabId(null)
  }

  async function handleInsertCabinetAtElevT(wallId: string, wallT: number, cls: AssemblyClass) {
    const wall = walls.find(w => w.id === wallId)
    if (!wall) return
    const dims = DEFAULT_DIMS[cls] ?? DEFAULT_DIMS.base
    const occ = cabinets
      .filter(c => c.wall_id === wallId && cabBlocks(cls, c.assembly_class))
      .map(c => ({ t: cabT(c, wall), dx: c.dx }))
    const t = findFreeSlot(Math.max(0, Math.min(wall.length - dims.dx, wallT)), dims.dx, wall.length, occ)
    const wd = wallDir(wall)
    await placeCabinet(wall, wall.pos_x + t * wd.x, wall.pos_y + t * wd.y, cls)
  }

  return { handleInsertAdjacent, handleSplitCabinet, handleInsertCabinetAtElevT }
}
