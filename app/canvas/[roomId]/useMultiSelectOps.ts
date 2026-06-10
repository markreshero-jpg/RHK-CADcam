import type { CabinetInstance, Wall, Room } from '@/src/lib/types'
import { wallDir, cabT, cabsBlock } from '@/src/lib/geometry'
import type { ContextMenuState } from './canvasTypes'

interface MultiSelectOpsParams {
  multiSelect:         string[]
  cabinets:            CabinetInstance[]
  walls:               Wall[]
  room:                Room
  handleUpdateCabinet: (id: string, u: Partial<CabinetInstance>) => Promise<void>
  setContextMenu:      React.Dispatch<React.SetStateAction<ContextMenuState | null>>
}

export function useMultiSelectOps(p: MultiSelectOpsParams) {
  const { multiSelect, cabinets, walls, room, handleUpdateCabinet, setContextMenu } = p

  function wallForSelection(): { wall: Wall; sel: CabinetInstance[] } | null {
    if (multiSelect.length < 2) return null
    const sel = cabinets.filter(c => multiSelect.includes(c.id))
    const wallIds = [...new Set(sel.map(c => c.wall_id))]
    if (wallIds.length !== 1) return null
    const wall = walls.find(w => w.id === wallIds[0])
    if (!wall) return null
    return { wall, sel }
  }

  // Equalise the selected cabinets to `targetDx` (mm; omitted = average) and re-pack
  // them tight within their height band. Base/tall units (floor) and wall units (upper)
  // are packed as separate runs, since they sit at different heights and can share the
  // same along-wall position. Each run is anchored at its leftmost cabinet and kept
  // within the available space (never crossing a blocking non-selected cabinet or the
  // wall end), shrinking to the largest equal width that fits if necessary.
  async function handleEqualizeWidths(targetDx?: number) {
    const hit = wallForSelection()
    if (!hit) return
    const { wall, sel } = hit
    const wd = wallDir(wall)
    const requested = targetDx != null && targetDx > 0
      ? Math.round(targetDx)
      : Math.round(sel.reduce((sum, c) => sum + c.dx, 0) / sel.length)

    const isUpper = (c: CabinetInstance) => c.assembly_class === 'wall' || c.assembly_class === 'wall_corner'
    const bands = [sel.filter(c => !isUpper(c)), sel.filter(isUpper)].filter(b => b.length > 0)
    const allSelIds = new Set(sel.map(c => c.id))

    const updates: { id: string; u: Partial<CabinetInstance> }[] = []
    let clampedTo = Infinity
    for (const band of bands) {
      const sorted = [...band].sort((a, b) => cabT(a, wall) - cabT(b, wall))
      const n  = sorted.length
      const t0 = cabT(sorted[0], wall)
      // Right boundary = nearest non-selected cabinet that blocks this run vertically.
      const rightBoundary = cabinets
        .filter(c => c.wall_id === wall.id && !allSelIds.has(c.id) && sorted.some(s => cabsBlock(s, c, wall, room)))
        .map(c => cabT(c, wall))
        .filter(ct => ct >= t0 - 0.5)
        .reduce((min, ct) => Math.min(min, ct), wall.length)
      const available = Math.max(0, rightBoundary - t0)
      const newDx = Math.max(1, Math.min(requested, Math.floor(available / n)))
      if (newDx < requested) clampedTo = Math.min(clampedTo, newDx)
      let t = t0
      for (const cab of sorted) {
        updates.push({ id: cab.id, u: { dx: newDx, pos_x: wall.pos_x + t * wd.x, pos_y: wall.pos_y + t * wd.y } })
        t += newDx
      }
    }

    await Promise.all(updates.map(({ id, u }) => handleUpdateCabinet(id, u)))
    setContextMenu(null)

    if (clampedTo < requested && typeof window !== 'undefined') {
      window.alert(`Equalised to ${clampedTo}mm — the most that fits without overlapping (you asked for ${requested}mm).`)
    }
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
