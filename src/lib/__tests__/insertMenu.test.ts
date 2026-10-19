import { describe, it, expect, vi } from 'vitest'
import { buildContextMenuGroups } from '@/app/canvas/[roomId]/canvasContextItems'
import type { CabinetInstance, ContextMenuSubItem } from '@/app/canvas/[roomId]/canvasTypes'

const cab = { id: 'c1', assembly_class: 'wall_corner', label: 'W1' } as unknown as CabinetInstance
const noop = () => {}
const base = {
  cabId: 'c1', canEqualize: false, clipboard: null, cabinets: [cab],
  onDeleteWall: noop, onDeleteCabinet: noop, onCopy: noop, onPaste: noop, onEdit: noop, onEqualizeWidths: noop,
  onInsertAdjacent: noop,
}
const insertMenu = (groups: ReturnType<typeof buildContextMenuGroups>) =>
  groups.flat().find(i => i?.label === 'Insert') as ContextMenuSubItem

describe('right-click Insert list', () => {
  it('falls back to generic panel / filler when nothing is ticked', () => {
    const ins = insertMenu(buildContextMenuGroups({ ...base, onEditInsertList: noop }))
    expect(ins.children!.map(c => c.label)).toEqual(['Panel Left', 'Panel Right', 'Filler Left', 'Filler Right', 'Edit insert list…'])
  })

  it('lists ticked items of the cabinet type first, the rest under Other, each with sides', () => {
    const onInsertDefinition = vi.fn()
    const ins = insertMenu(buildContextMenuGroups({
      ...base, onInsertDefinition, onEditInsertList: noop,
      insertFavourites: [
        { id: 'd1', name: 'BEPK', assembly_class: 'base' },
        { id: 'd2', name: 'WEP',  assembly_class: 'wall' },
        { id: 'd3', name: 'WF',   assembly_class: 'wall' },
      ],
    }))
    expect(ins.children!.map(c => c.label)).toEqual(['WEP', 'WF', 'Other', 'Edit insert list…'])
    expect(ins.children![2].children!.map(c => c.label)).toEqual(['BEPK'])
    const wep = ins.children![0]
    expect(wep.children!.map(c => c.label)).toEqual(['Left side', 'Right side'])
    wep.children![0].onClick!()
    expect(onInsertDefinition).toHaveBeenCalledWith('c1', 'd2', 'left')
  })
})
