'use client'

// Bulkhead section of the cabinet panel (z_bulkhead B3): front line, auto
// height, left / right / bottom returns (depth + joint), the fixing cleat and
// the shadowline split rail (B7). A curved bulkhead (BHCRVFIXP, z_curved_end
// C7) shows only the height + split; its shape lives in the curved end section.
// Writes `bulkhead` (and `dy` when auto height is switched back on).

import { useEffect, useState } from 'react'
import { CabinetInstance, Room, Wall } from '@/src/lib/types'
import { supabase } from '@/src/lib/supabase'
import CalcInput from '@/src/components/CalcInput'
import { normaliseBulkhead, bulkheadAutoHeight, SPLIT_MATERIAL_NAME, type BulkheadSettings, type BulkheadReturn, type BulkheadSplit } from '@/src/lib/bulkhead'

const RETURNS = [['left', 'Left return'], ['right', 'Right return'], ['bottom', 'Bottom return']] as const

export default function BulkheadSection({ cabinet, wall, room, onUpdate, inp, lbl }: {
  cabinet: CabinetInstance
  wall: Wall | null
  room: Room | null
  onUpdate: (id: string, u: Partial<CabinetInstance>) => Promise<void>
  inp: string
  lbl: string
}) {
  // Boards for the split rail (library data).
  const [boards, setBoards] = useState<{ id: string; name: string; dz: number }[]>([])
  useEffect(() => {
    void supabase.from('materials').select('id, name, dz').eq('active', true).order('name')
      .then(({ data }) => setBoards((data ?? []) as { id: string; name: string; dz: number }[]))
  }, [])
  const b = normaliseBulkhead(cabinet.bulkhead)
  if (!b) return null
  const curved = !!cabinet.curved_end
  const put = (next: Partial<BulkheadSettings>, extra: Partial<CabinetInstance> = {}) =>
    void onUpdate(cabinet.id, { bulkhead: { ...b, ...next }, ...extra })
  const putRet = (k: typeof RETURNS[number][0], r: Partial<BulkheadReturn>) => put({ [k]: { ...b[k], ...r } })
  const autoH = room ? bulkheadAutoHeight(wall, room) : null
  const putSplit = (sp: Partial<BulkheadSplit>) => put({ split: { ...b.split, ...sp } })
  // Ticking the split on picks the default rail board when none is set.
  const splitOn = (on: boolean) => putSplit({ on, ...(on && !b.split.material_id
    ? { material_id: boards.find(m => m.name === SPLIT_MATERIAL_NAME)?.id ?? null } : {}) })
  const splitBoard = boards.find(m => m.id === b.split.material_id)

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
          <CalcInput value={b[k].depth} decimals={1} disabled={!b[k].on}
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
      {!curved && <div>
        <label className={lbl}>Front</label>
        <select value={b.front} onChange={e => put({ front: e.target.value as BulkheadSettings['front'] })} className={inp}>
          <option value="doors">Flush with overhead doors</option>
          <option value="carcase">Flush with carcase</option>
        </select>
      </div>}
      <label className="flex items-center gap-2 text-xs text-gray-300"
        title="Height fills from the wall-cabinet top to the ceiling, and follows soffit / ceiling changes. Typing a height switches this off.">
        <input type="checkbox" checked={b.auto_h}
          onChange={e => put({ auto_h: e.target.checked },
            e.target.checked && autoH != null && autoH > 0 ? { dy: autoH } : {})} />
        Height to ceiling{autoH != null && autoH > 0 ? ` (${autoH})` : ''}
      </label>
      {!curved && <>
        {RETURNS.map(([k, name]) => (
          <div key={k} className="grid grid-cols-[1fr_4.5rem_4.5rem] gap-1 items-center">
            <label className="flex items-center gap-2 text-xs text-gray-300">
              <input type="checkbox" checked={b[k].on} onChange={e => putRet(k, { on: e.target.checked })} />
              {name}
            </label>
            <CalcInput value={b[k].depth} decimals={1} disabled={!b[k].on}
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
      </>}

      <label className="flex items-center gap-2 text-xs text-gray-300"
        title="A flat rail of its own board under the bulkhead, set back from the face, so a shadow gap shows between the cupboards and the bulkhead. The bulkhead builds above it.">
        <input type="checkbox" checked={b.split.on} onChange={e => splitOn(e.target.checked)} />
        Shadowline split{b.split.on && splitBoard ? ` (${splitBoard.dz} gap)` : ''}
      </label>
      {b.split.on && <>
        <div className="grid grid-cols-[1fr_4.5rem] gap-1 items-center">
          <label className="text-xs text-gray-300">Rail width</label>
          <CalcInput value={b.split.width} decimals={1}
            onCommit={v => { if (v > 0) putSplit({ width: v }) }}
            className={inp + ' text-right'} />
          <label className="text-xs text-gray-300">Setback</label>
          <CalcInput value={b.split.setback} decimals={1}
            onCommit={v => { if (v >= 0) putSplit({ setback: v }) }}
            className={inp + ' text-right'} />
        </div>
        <select value={b.split.material_id ?? ''} onChange={e => putSplit({ material_id: e.target.value || null })} className={inp}>
          <option value="">— rail board —</option>
          {boards.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        {!b.split.material_id && <p className="text-[10px] text-amber-500">Pick a rail board — no rail is built without one.</p>}
        <p className="text-[10px] text-gray-600">
          Gap = the rail board&apos;s thickness; setback = how far the rail sits behind the face.
          {curved ? ' Follows the front, the curve and the side to the wall.' : ' Runs the full width.'}
        </p>
      </>}
    </div>
  )
}
