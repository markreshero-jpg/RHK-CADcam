import type { AssemblyClass } from '@/src/lib/types'
import type { CabinetInstance, ContextMenuItem } from './canvasTypes'

export function buildContextMenuGroups({
  cabId, wallId, elevWallId, elevWallT, benchtopId, vertexContext, canEqualize, clipboard, cabinets, multiSelect,
  onDeleteWall, onDeleteCabinet, onDeleteMultiple, onDeleteBenchtop, onDeleteBenchtopVertex, onRoundCorner, onChamfer,
  onCopy, onPaste, onEdit, onEqualizeWidths, onInsertCabinet, onInsertAdjacent, onSplit,
  onAlignLeft, onAlignRight, onSaveToLibrary, onJoinKicks, onDetachKick, onSeparateKicks, onKickSettings,
}: {
  cabId?: string
  wallId?: string
  elevWallId?: string
  elevWallT?: number
  benchtopId?: string
  vertexContext?: { btId: string; vi: number }
  canEqualize: boolean
  clipboard: CabinetInstance | null
  cabinets: CabinetInstance[]
  multiSelect?: string[]
  onDeleteWall: (id: string) => void
  onDeleteCabinet: (id: string) => void
  onDeleteMultiple?: (ids: string[]) => void
  onDeleteBenchtop?: (id: string) => void
  onDeleteBenchtopVertex?: (btId: string, vi: number) => void
  onRoundCorner?: (btId: string, vi: number) => void
  onChamfer?: (btId: string, vi: number) => void
  onCopy: (cab: CabinetInstance) => void
  onPaste: () => void
  onEdit: (id: string) => void
  onEqualizeWidths: (targetDx?: number) => void
  onInsertCabinet?: (wallId: string, wallT: number, cls: AssemblyClass) => void
  onInsertAdjacent?: (cabId: string, type: 'panel' | 'filler', side: 'left' | 'right') => void
  onSplit?: (cabId: string) => void
  onAlignLeft?: () => void
  onAlignRight?: () => void
  onSaveToLibrary?: (cabId: string) => void
  onJoinKicks?: (cabId: string) => void
  onDetachKick?: (cabId: string) => void
  onSeparateKicks?: (cabId: string) => void
  onKickSettings?: (cabId: string) => void
}): ContextMenuItem[][] {
  if (vertexContext && onDeleteBenchtopVertex) {
    const { btId, vi } = vertexContext
    return [[
      { label: 'Remove Vertex', onClick: () => onDeleteBenchtopVertex(btId, vi), color: 'red' },
      ...(onRoundCorner ? [{ label: 'Round Corner', onClick: () => onRoundCorner(btId, vi), color: 'blue' as const }] : []),
      ...(onChamfer ? [{ label: 'Chamfer', onClick: () => onChamfer(btId, vi), color: 'blue' as const }] : []),
    ]]
  }

  if (benchtopId && onDeleteBenchtop) {
    return [[{ label: 'Delete Benchtop', onClick: () => onDeleteBenchtop(benchtopId), color: 'red' }]]
  }

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

  // Kick assembly: a standalone toe-kick-only object — only split settings,
  // Separate + Delete (it has no carcass/face/internal, so Edit/Split don't apply).
  if (cab?.is_kick_assembly) {
    const g: ContextMenuItem[][] = []
    g.push([{ label: 'Edit…', onClick: () => onEdit(cabId), color: 'blue' }])
    if (onKickSettings) g.push([{ label: 'Kick split…', onClick: () => onKickSettings(cabId) }])
    if (onSeparateKicks) g.push([{ label: 'Separate kicks', onClick: () => onSeparateKicks(cabId) }])
    g.push([{ label: 'Delete', onClick: () => onDeleteCabinet(cabId), color: 'red' }])
    return g
  }

  const groups: ContextMenuItem[][] = []

  if (canEqualize) {
    const selWidths = (multiSelect ?? [])
      .map(id => cabinets.find(c => c.id === id))
      .filter((c): c is CabinetInstance => !!c)
      .map(c => c.dx)
    const smallest = Math.min(...selWidths)
    const largest  = Math.max(...selWidths)
    const average  = Math.round(selWidths.reduce((s, w) => s + w, 0) / selWidths.length)
    groups.push([{
      label: 'Equalise Widths',
      color: 'amber',
      children: [
        { label: `Smallest — ${smallest}mm`, onClick: () => onEqualizeWidths(smallest) },
        { label: `Largest — ${largest}mm`,   onClick: () => onEqualizeWidths(largest) },
        { label: `Average — ${average}mm`,   onClick: () => onEqualizeWidths(average) },
        { label: 'Other…', onClick: () => {
          const v = typeof window !== 'undefined' ? window.prompt('Equalise all selected widths to (mm):', String(average)) : null
          const n = v ? parseFloat(v) : NaN
          if (n > 0) onEqualizeWidths(n)
        } },
      ],
    }])
    if (onAlignLeft && onAlignRight) {
      groups.push([
        { label: 'Align Left',  onClick: onAlignLeft,  color: 'amber' },
        { label: 'Align Right', onClick: onAlignRight, color: 'amber' },
      ])
    }
  }

  groups.push([{ label: 'Edit…', onClick: () => onEdit(cabId), color: 'blue' }])

  if (onSaveToLibrary) groups.push([{ label: 'Save to library…', onClick: () => onSaveToLibrary(cabId) }])

  if (onSplit) groups.push([{ label: 'Split…', onClick: () => onSplit(cabId) }])

  // Detach toe kick(s) into a standalone kick assembly. A cabinet already in a run
  // (its kick is detached) only offers Separate; an un-detached floor unit with a
  // ladder kick offers single Detach + Join-the-whole-run. (Run detection + depth
  // warning happen in the handlers.)
  if (cab && !cab.is_kick_assembly) {
    if (cab.kick_run_id) {
      if (onSeparateKicks) groups.push([{ label: 'Separate kicks', onClick: () => onSeparateKicks(cabId) }])
    } else {
      const kickEligible = (cab.assembly_class === 'base' || cab.assembly_class === 'tall')
        && cab.has_toekick && cab.toe_type !== 'leg' && cab.toe_type !== 'none'
      if (kickEligible) {
        const items: ContextMenuItem[] = []
        if (onDetachKick) items.push({ label: 'Detach kick', onClick: () => onDetachKick(cabId) })
        if (onJoinKicks)  items.push({ label: 'Join kicks in run', onClick: () => onJoinKicks(cabId) })
        if (items.length) groups.push(items)
      }
    }
  }

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

  const isMultiSel = multiSelect && multiSelect.length > 1 && cabId && multiSelect.includes(cabId)
  if (isMultiSel && onDeleteMultiple) {
    groups.push([{ label: `Delete ${multiSelect!.length} Cabinets`, onClick: () => onDeleteMultiple(multiSelect!), color: 'red' }])
  } else {
    groups.push([{ label: 'Delete', onClick: () => onDeleteCabinet(cabId), color: 'red' }])
  }

  return groups
}
