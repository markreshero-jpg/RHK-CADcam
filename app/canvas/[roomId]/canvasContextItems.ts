import type { AssemblyClass } from '@/src/lib/types'
import type { CabinetInstance, ContextMenuItem } from './canvasTypes'

export function buildContextMenuGroups({
  cabId, wallId, elevWallId, elevWallT, canEqualize, clipboard, cabinets,
  onDeleteWall, onDeleteCabinet, onCopy, onPaste, onEdit, onEqualizeWidths, onInsertCabinet, onInsertAdjacent, onSplit,
  onAlignLeft, onAlignRight,
}: {
  cabId?: string
  wallId?: string
  elevWallId?: string
  elevWallT?: number
  canEqualize: boolean
  clipboard: CabinetInstance | null
  cabinets: CabinetInstance[]
  onDeleteWall: (id: string) => void
  onDeleteCabinet: (id: string) => void
  onCopy: (cab: CabinetInstance) => void
  onPaste: () => void
  onEdit: (id: string) => void
  onEqualizeWidths: () => void
  onInsertCabinet?: (wallId: string, wallT: number, cls: AssemblyClass) => void
  onInsertAdjacent?: (cabId: string, type: 'panel' | 'filler', side: 'left' | 'right') => void
  onSplit?: (cabId: string) => void
  onAlignLeft?: () => void
  onAlignRight?: () => void
}): ContextMenuItem[][] {
  if (wallId) {
    return [[{ label: 'Delete Wall', onClick: () => onDeleteWall(wallId), color: 'red' }]]
  }

  if (elevWallId !== undefined && elevWallT !== undefined && onInsertCabinet) {
    const ins = (cls: AssemblyClass) => () => onInsertCabinet(elevWallId, elevWallT, cls)
    return [
      [
        { label: 'Insert Base Cabinet', onClick: ins('base') },
        { label: 'Insert Wall Unit',    onClick: ins('wall') },
        { label: 'Insert Tall Cabinet', onClick: ins('tall') },
      ],
      [
        { label: 'Insert Base Corner', onClick: ins('base_corner') },
        { label: 'Insert Wall Corner', onClick: ins('wall_corner') },
        { label: 'Insert Tall Corner', onClick: ins('tall_corner') },
      ],
    ]
  }

  if (!cabId) return []

  const cab = cabinets.find(c => c.id === cabId)
  const groups: ContextMenuItem[][] = []

  if (canEqualize) {
    groups.push([{ label: 'Equalise Widths', onClick: onEqualizeWidths, color: 'amber' }])
    if (onAlignLeft && onAlignRight) {
      groups.push([
        { label: 'Align Left',  onClick: onAlignLeft,  color: 'amber' },
        { label: 'Align Right', onClick: onAlignRight, color: 'amber' },
      ])
    }
  }

  groups.push([{ label: 'Edit…', onClick: () => onEdit(cabId), color: 'blue' }])

  if (onSplit) groups.push([{ label: 'Split…', onClick: () => onSplit(cabId) }])

  if (onInsertAdjacent) {
    groups.push([{
      label: 'Insert',
      children: [
        { label: 'Panel Left',   onClick: () => onInsertAdjacent(cabId, 'panel',  'left') },
        { label: 'Panel Right',  onClick: () => onInsertAdjacent(cabId, 'panel',  'right') },
        { label: 'Filler Left',  onClick: () => onInsertAdjacent(cabId, 'filler', 'left') },
        { label: 'Filler Right', onClick: () => onInsertAdjacent(cabId, 'filler', 'right') },
      ],
    }])
  }

  groups.push([
    { label: 'Copy', onClick: () => { if (cab) onCopy(cab) } },
    {
      label: clipboard ? `Paste (${clipboard.label ?? clipboard.assembly_class})` : 'Paste',
      onClick: onPaste,
      disabled: !clipboard,
    },
  ])

  groups.push([{ label: 'Delete', onClick: () => onDeleteCabinet(cabId), color: 'red' }])

  return groups
}
