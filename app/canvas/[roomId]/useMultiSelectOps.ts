import type { CabinetInstance, Wall } from '@/src/lib/types'
import { wallDir, cabT } from '@/src/lib/geometry'
import type { ContextMenuState } from './canvasTypes'

interface MultiSelectOpsParams {
  multiSelect:         string[]
  cabinets:            CabinetInstance[]
  walls:               Wall[]
  handleUpdateCabinet: (id: string, u: Partial<CabinetInstance>) => Promise<void>
  setContextMenu:      React.Dispatch<React.SetStateAction<ContextMenuState | null>>
}

export function useMultiSelectOps(p: MultiSelectOpsParams) {
  const { multiSelect, cabinets, walls, handleUpdateCabinet, setContextMenu } = p

  function wallForSelection(): { wall: Wall; sel: CabinetInstance[] } | null {
    if (multiSelect.length < 2) return null
    const sel = cabinets.filter(c => multiSelect.includes(c.id))
    const wallIds = [...new Set(sel.map(c => c.wall_id))]
    if (wallIds.length !== 1) return null
    const wall = walls.find(w => w.id === wallIds[0])
    if (!wall) return null
    return { wall, sel }
  }

  async function handleEqualizeWidths() {
    const hit = wallForSelection()
    if (!hit) return
    const { wall, sel } = hit
    const sorted = [...sel].sort((a, b) => cabT(a, wall) - cabT(b, wall))
    const newDx = Math.round(sorted.reduce((sum, c) => sum + c.dx, 0) / sorted.length)
    const wd = wallDir(wall)
    let t = cabT(sorted[0], wall)
    await Promise.all(sorted.map(cab => {
      const pos_x = wall.pos_x + t * wd.x
      const pos_y = wall.pos_y + t * wd.y
      t += newDx
      return handleUpdateCabinet(cab.id, { dx: newDx, pos_x, pos_y })
    }))
    setContextMenu(null)
  }

  async function handleAlignLeft() {
    const hit = wallForSelection()
    if (!hit) return
    const { wall, sel } = hit
    const wd = wallDir(wall)
    const leftT = Math.min(...sel.map(c => cabT(c, wall)))
    await Promise.all(sel.map(cab => {
      if (Math.abs(cabT(cab, wall) - leftT) < 0.5) return Promise.resolve()
      return handleUpdateCabinet(cab.id, {
        pos_x: wall.pos_x + leftT * wd.x,
        pos_y: wall.pos_y + leftT * wd.y,
      })
    }))
    setContextMenu(null)
  }

  async function handleAlignRight() {
    const hit = wallForSelection()
    if (!hit) return
    const { wall, sel } = hit
    const wd = wallDir(wall)
    const rightT = Math.max(...sel.map(c => cabT(c, wall) + c.dx))
    await Promise.all(sel.map(cab => {
      const newT = rightT - cab.dx
      return handleUpdateCabinet(cab.id, {
        pos_x: wall.pos_x + newT * wd.x,
        pos_y: wall.pos_y + newT * wd.y,
      })
    }))
    setContextMenu(null)
  }

  return { handleEqualizeWidths, handleAlignLeft, handleAlignRight }
}
