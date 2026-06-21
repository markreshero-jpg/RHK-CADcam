'use client'

import { Room, Wall, CabinetInstance } from '@/src/lib/types'
import { cabT, cabVExtent } from '@/src/lib/geometry'
import CalcInput from '@/src/components/CalcInput'

// Right-hand panel shown when 2+ cabinets are selected. Reads size as a group:
// width is the total along-wall span; height/depth show the shared value (or
// "mixed") and editing them applies to every selected cabinet. Per-cabinet fields
// (label, neighbours, scribes, …) are intentionally omitted — they only make sense
// for a single cabinet. Clearances are shown around the whole group's bounding box.
export default function CabinetGroupPanel({ cabinets, wallCabinets, walls, room, onUpdateMany, onMoveAlongWall, onDeleteMany }: {
  cabinets: CabinetInstance[]
  wallCabinets: CabinetInstance[]   // every cabinet on the group's wall (incl. selected)
  walls: Wall[]
  room: Room | null
  onUpdateMany: (u: Partial<CabinetInstance>) => void
  onMoveAlongWall: (deltaT: number) => void   // slide every selected cabinet by deltaT mm along the wall
  onDeleteMany: () => void
}) {
  const n = cabinets.length
  const inp = 'w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500'
  const lbl = 'text-[10px] text-gray-500 uppercase tracking-wider mb-0.5 block'
  const ro  = 'w-full bg-gray-800/60 border border-gray-700 rounded px-2 py-1 text-xs text-right text-gray-400'

  const classes = [...new Set(cabinets.map(c => c.assembly_class))]
  const classLabel = classes.length === 1 ? classes[0].replace(/_/g, ' ') : 'Mixed'

  // Shared value across the selection, or null when they differ.
  const uniform = (key: 'dy' | 'dz'): number | null => {
    const vals = new Set(cabinets.map(c => c[key]))
    return vals.size === 1 ? cabinets[0][key] : null
  }
  const dy = uniform('dy')
  const dz = uniform('dz')

  // Single wall the whole selection sits on (else size/clearances aren't meaningful).
  const wallIds = [...new Set(cabinets.map(c => c.wall_id))]
  const wall = wallIds.length === 1 ? walls.find(w => w.id === wallIds[0]) ?? null : null

  // Group bounding box + four-sided clearance to the nearest blocking non-selected
  // cabinet (or the wall/floor/ceiling). Left/right consider cabinets that overlap the
  // group vertically; up/down consider cabinets that overlap it horizontally.
  const box = (wall && room) ? (() => {
    const sel = cabinets
    const tL = (c: CabinetInstance) => cabT(c, wall)
    const vEx = (c: CabinetInstance) => cabVExtent(c.assembly_class, c.dy, wall, room)
    const gLeft   = Math.min(...sel.map(tL))
    const gRight  = Math.max(...sel.map(c => tL(c) + c.dx))
    const gBottom = Math.min(...sel.map(c => vEx(c)[0]))
    const gTop    = Math.max(...sel.map(c => vEx(c)[1]))
    const ceiling = wall.height ?? room.room_dy ?? 2400

    const selIds = new Set(sel.map(c => c.id))
    const others = wallCabinets.filter(c => !selIds.has(c.id))
    const vOverlap = (c: CabinetInstance) => { const [b, t] = vEx(c); return b < gTop - 0.5 && gBottom < t - 0.5 }
    const hOverlap = (c: CabinetInstance) => tL(c) < gRight - 0.5 && gLeft < tL(c) + c.dx - 0.5

    const leftN  = others.filter(c => vOverlap(c) && tL(c) + c.dx <= gLeft + 0.5)
    const rightN = others.filter(c => vOverlap(c) && tL(c) >= gRight - 0.5)
    const downN  = others.filter(c => hOverlap(c) && vEx(c)[1] <= gBottom + 0.5)
    const upN    = others.filter(c => hOverlap(c) && vEx(c)[0] >= gTop - 0.5)

    // Bounds the group can slide between (edge of the nearest blocking neighbour, or wall ends).
    const leftEdge  = leftN.length  ? Math.max(...leftN.map(c => tL(c) + c.dx)) : 0
    const rightEdge = rightN.length ? Math.min(...rightN.map(tL))               : wall.length

    return {
      width: Math.round(gRight - gLeft),
      gLeft, leftEdge, rightEdge,
      left:  Math.round(gLeft - leftEdge),
      right: Math.round(rightEdge - gRight),
      down:  Math.round(gBottom - (downN.length ? Math.max(...downN.map(c => vEx(c)[1])) : 0)),
      up:    Math.round((upN.length   ? Math.min(...upN.map(c => vEx(c)[0]))   : ceiling)  - gTop),
    }
  })() : null

  // Slide the whole group so its left/right clearance becomes `v`, clamped to the gap.
  const slideTo = (side: 'left' | 'right', v: number) => {
    if (!box) return
    const desiredLeft = side === 'left' ? box.leftEdge + v : (box.rightEdge - v) - box.width
    const clamped = Math.max(box.leftEdge, Math.min(box.rightEdge - box.width, desiredLeft))
    onMoveAlongWall(clamped - box.gLeft)
  }

  const editDim = (label: string, value: number | null, key: 'dy' | 'dz') => (
    <div>
      <p className="text-[10px] text-gray-600 text-center mb-0.5 uppercase">{label}</p>
      {value != null
        ? <CalcInput value={value} onCommit={v => onUpdateMany({ [key]: v })} className={inp + ' text-right'} />
        : <div className={inp + ' text-right text-gray-500 italic'} title="Cabinets differ — type a value to make them equal">mixed</div>}
    </div>
  )

  const clrRO = (label: string, v: number) => (
    <div>
      <p className="text-[9px] text-gray-500 mb-0.5">{label}</p>
      <div className={`${ro} ${v < 0 ? 'text-red-400' : ''}`}>{v}</div>
    </div>
  )
  const clrMove = (label: string, v: number, side: 'left' | 'right') => (
    <div>
      <p className="text-[9px] text-gray-500 mb-0.5">{label}</p>
      <CalcInput value={v} decimals={0} onCommit={n => slideTo(side, n)}
        className={`${inp} text-right ${v < 0 ? 'text-red-400' : ''}`} />
    </div>
  )

  return (
    <div className="w-72 bg-gray-900 border-l border-gray-800 flex flex-col overflow-y-auto">
      <div className="px-4 py-3 border-b border-gray-800">
        <p className="text-xs font-mono font-medium text-gray-300">{n} cabinets selected</p>
        <p className="text-[10px] text-gray-500 capitalize">{classLabel}</p>
      </div>

      <div className="p-4 space-y-3">
        <div>
          <p className={lbl}>Group size (mm)</p>
          <div className="grid grid-cols-3 gap-1.5">
            <div>
              <p className="text-[10px] text-gray-600 text-center mb-0.5 uppercase">W&nbsp;span</p>
              <div className={inp + ' text-right text-gray-400'} title="Total along-wall span of the selection">
                {box ? box.width : '—'}
              </div>
            </div>
            {editDim('H', dy, 'dy')}
            {editDim('D', dz, 'dz')}
          </div>
          <p className="text-[10px] text-gray-600 mt-1.5 leading-snug">
            Width is the total span (read-only). Height &amp; depth apply to all selected — &ldquo;mixed&rdquo; means they differ; type a value to make them equal.
          </p>
        </div>

        {box && (
          <div>
            <p className={lbl}>Clearance (mm)</p>
            <div className="grid grid-cols-2 gap-1">
              {clrMove('Left', box.left, 'left')}
              {clrMove('Right', box.right, 'right')}
              {clrRO('Up', box.up)}
              {clrRO('Down', box.down)}
            </div>
            <p className="text-[10px] text-gray-600 mt-1.5 leading-snug">
              Edit Left / Right to slide the group along the wall. Up / Down are read-only — vertical position is set by cabinet type (base on the floor, wall units from the soffit).
            </p>
          </div>
        )}

        <div className="border-t border-gray-800 pt-3">
          <button
            onClick={onDeleteMany}
            className="w-full text-xs text-red-400 hover:text-red-300 border border-red-900/60 hover:border-red-700 rounded px-2 py-1.5 transition-colors">
            Delete {n} cabinets
          </button>
        </div>

        <p className="text-[10px] text-gray-600 leading-snug">
          Select a single cabinet to edit its label, position, neighbours, scribes and other per-cabinet properties.
        </p>
      </div>
    </div>
  )
}
