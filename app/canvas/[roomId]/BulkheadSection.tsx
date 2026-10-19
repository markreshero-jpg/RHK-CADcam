'use client'

// Bulkhead section of the cabinet panel (z_bulkhead B3): front line, auto
// height, left / right / bottom returns (depth + joint) and the fixing cleat.
// Writes `bulkhead` (and `dy` when auto height is switched back on).

import { CabinetInstance, Room, Wall } from '@/src/lib/types'
import CalcInput from '@/src/components/CalcInput'
import { normaliseBulkhead, bulkheadAutoHeight, type BulkheadSettings, type BulkheadReturn } from '@/src/lib/bulkhead'

const RETURNS = [['left', 'Left return'], ['right', 'Right return'], ['bottom', 'Bottom return']] as const

export default function BulkheadSection({ cabinet, wall, room, onUpdate, inp, lbl }: {
  cabinet: CabinetInstance
  wall: Wall | null
  room: Room | null
  onUpdate: (id: string, u: Partial<CabinetInstance>) => Promise<void>
  inp: string
  lbl: string
}) {
  const b = normaliseBulkhead(cabinet.bulkhead)
  if (!b) return null
  const put = (next: Partial<BulkheadSettings>, extra: Partial<CabinetInstance> = {}) =>
    void onUpdate(cabinet.id, { bulkhead: { ...b, ...next }, ...extra })
  const putRet = (k: typeof RETURNS[number][0], r: Partial<BulkheadReturn>) => put({ [k]: { ...b[k], ...r } })
  const autoH = room ? bulkheadAutoHeight(wall, room) : null

  // Shadowline: strip width + left / right returns (depth + joint).
  if (b.kind === 'shadowline') return (
    <div className="space-y-2 border-t border-gray-800 pt-3">
      <p className={lbl}>Shadowline</p>
      <div className="grid grid-cols-[1fr_4.5rem] gap-1 items-center">
        <label className="text-xs text-gray-300">Strip width</label>
        <CalcInput value={b.width} decimals={1}
          onCommit={v => { if (v > 0) put({ width: v }) }}
          className={inp + ' text-right'} />
      </div>
      {RETURNS.filter(([k]) => k !== 'bottom').map(([k, name]) => (
        <div key={k} className="grid grid-cols-[1fr_4.5rem_4.5rem] gap-1 items-center">
          <label className="flex items-center gap-2 text-xs text-gray-300">
            <input type="checkbox" checked={b[k].on} onChange={e => putRet(k, { on: e.target.checked })} />
            {name}
          </label>
          <CalcInput value={b[k].depth} decimals={0} disabled={!b[k].on}
            onCommit={v => { if (v > 0) putRet(k, { depth: v }) }}
            className={inp + ' text-right disabled:opacity-40'} />
          <select value={b[k].joint} disabled={!b[k].on}
            onChange={e => putRet(k, { joint: e.target.value as BulkheadReturn['joint'] })}
            className={inp + ' disabled:opacity-40'}>
            <option value="mitre">Mitre</option>
            <option value="butt">Butt</option>
          </select>
        </div>
      ))}
      <p className="text-[10px] text-gray-600">Sits on the overhead tops, flush with their front. Depth = how far a return runs back from the front (stops at the wall). Set the soffit to the board thickness to meet the ceiling.</p>
    </div>
  )

  return (
    <div className="space-y-2 border-t border-gray-800 pt-3">
      <p className={lbl}>Bulkhead</p>
      <div>
        <label className={lbl}>Front</label>
        <select value={b.front} onChange={e => put({ front: e.target.value as BulkheadSettings['front'] })} className={inp}>
          <option value="doors">Flush with overhead doors</option>
          <option value="carcase">Flush with carcase</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-xs text-gray-300"
        title="Height fills from the wall-cabinet top to the ceiling, and follows soffit / ceiling changes. Typing a height switches this off.">
        <input type="checkbox" checked={b.auto_h}
          onChange={e => put({ auto_h: e.target.checked },
            e.target.checked && autoH != null && autoH > 0 ? { dy: autoH } : {})} />
        Height to ceiling{autoH != null && autoH > 0 ? ` (${autoH})` : ''}
      </label>
      {RETURNS.map(([k, name]) => (
        <div key={k} className="grid grid-cols-[1fr_4.5rem_4.5rem] gap-1 items-center">
          <label className="flex items-center gap-2 text-xs text-gray-300">
            <input type="checkbox" checked={b[k].on} onChange={e => putRet(k, { on: e.target.checked })} />
            {name}
          </label>
          <CalcInput value={b[k].depth} decimals={0} disabled={!b[k].on}
            onCommit={v => { if (v > 0) putRet(k, { depth: v }) }}
            className={inp + ' text-right disabled:opacity-40'} />
          <select value={b[k].joint} disabled={!b[k].on}
            onChange={e => putRet(k, { joint: e.target.value as BulkheadReturn['joint'] })}
            className={inp + ' disabled:opacity-40'}>
            <option value="mitre">Mitre</option>
            <option value="butt">Butt</option>
          </select>
        </div>
      ))}
      <p className="text-[10px] text-gray-600">Depth = how far the return runs back from the front (stops at the wall).</p>
      <label className="flex items-center gap-2 text-xs text-gray-300"
        title="L cleat (two 100 mm legs, carcass board) behind the fascia's bottom edge. None when the bulkhead is too low for it.">
        <input type="checkbox" checked={b.cleat} onChange={e => put({ cleat: e.target.checked })} />
        Fixing cleat
      </label>
    </div>
  )
}
