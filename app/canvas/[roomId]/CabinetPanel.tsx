'use client'

import { useState } from 'react'
import { Room, Wall, CabinetInstance, NeighbourType, TopType, ToeType } from '@/src/lib/types'
import { cabT, wallDir, findFreeSlot } from '@/src/lib/geometry'
import CalcInput from '@/src/components/CalcInput'

export default function CabinetPanel({ cabinet, wall, wallCabinets, room, onUpdate, onDelete, hideWallPosition }: {
  cabinet: CabinetInstance
  wall: Wall | null
  wallCabinets: CabinetInstance[]
  room: Room | null
  onUpdate: (id: string, u: Partial<CabinetInstance>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  hideWallPosition?: boolean
}) {
  const [local, setLocal] = useState<Partial<CabinetInstance>>({})
  const [saving, setSaving] = useState(false)
  function f<K extends keyof CabinetInstance>(k: K) { return (k in local ? local[k] : cabinet[k]) as CabinetInstance[K] }
  function set<K extends keyof CabinetInstance>(k: K, v: CabinetInstance[K]) { setLocal(l => ({ ...l, [k]: v })) }
  async function save() {
    if (!Object.keys(local).length) return
    setSaving(true); await onUpdate(cabinet.id, local); setLocal({}); setSaving(false)
  }
  const inp = 'w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500'
  const lbl = 'text-[10px] text-gray-500 uppercase tracking-wider mb-0.5 block'

  const meas = wall ? (() => {
    const t = cabT(cabinet, wall)
    const others = wallCabinets
      .filter(c => c.id !== cabinet.id)
      .map(c => ({ t: cabT(c, wall), dx: c.dx }))
    const leftN  = others.filter(o => o.t + o.dx <= t + 1).sort((a, b) => b.t - a.t)[0]
    const rightN = others.filter(o => o.t >= t + cabinet.dx - 1).sort((a, b) => a.t - b.t)[0]
    return {
      posLeft:    Math.round(t),
      posRight:   Math.round(wall.length - (t + cabinet.dx)),
      clearLeft:  Math.round(leftN  ? t - (leftN.t + leftN.dx)  : t),
      clearRight: Math.round(rightN ? rightN.t - (t + cabinet.dx) : wall.length - (t + cabinet.dx)),
      leftN, rightN,
    }
  })() : null

  const isWallClass = cabinet.assembly_class === 'wall' || cabinet.assembly_class === 'wall_corner'
  const elevFromFloor = isWallClass && cabinet.pos_z === 0
    ? Math.round((room?.wall_cabinet_top ?? 2100) - cabinet.dy)
    : cabinet.pos_z

  return (
    <div className="w-72 bg-gray-900 border-l border-gray-800 flex flex-col overflow-y-auto">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div>
          <p className="text-xs font-mono font-medium text-gray-300">{cabinet.label ?? '—'}</p>
          <p className="text-[10px] text-gray-500 capitalize">{cabinet.assembly_class.replace('_', ' ')}</p>
        </div>
        <button onClick={() => onDelete(cabinet.id)} className="text-gray-600 hover:text-red-400 text-xs">✕</button>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <label className={lbl}>Label</label>
          <input value={(f('label') as string) ?? ''} onChange={e => set('label', e.target.value || null)}
            onBlur={save} className={inp} />
        </div>

        <div>
          <label className={lbl}>Elevation from floor (mm)</label>
          <CalcInput
            value={elevFromFloor}
            decimals={0}
            onCommit={v => onUpdate(cabinet.id, { pos_z: v })}
            className={inp + ' text-right'} />
        </div>

        {meas && wall && !hideWallPosition && (
          <div>
            <p className={lbl}>Wall position</p>
            <div className="grid grid-cols-2 gap-1">
              <div>
                <p className="text-[9px] text-gray-500 mb-0.5">From left end</p>
                <CalcInput
                  value={meas.posLeft}
                  decimals={0}
                  onCommit={v => {
                    const d = wallDir(wall)
                    const occ = wallCabinets.filter(c => c.id !== cabinet.id).map(c => ({ t: cabT(c, wall), dx: c.dx }))
                    const t = findFreeSlot(v, cabinet.dx, wall.length, occ)
                    onUpdate(cabinet.id, { pos_x: wall.pos_x + t * d.x, pos_y: wall.pos_y + t * d.y })
                  }}
                  className={inp + ' text-right'} />
              </div>
              <div>
                <p className="text-[9px] text-gray-500 mb-0.5">From right end</p>
                <CalcInput
                  value={meas.posRight}
                  decimals={0}
                  onCommit={v => {
                    const d = wallDir(wall)
                    const newT = wall.length - v - cabinet.dx
                    const occ = wallCabinets.filter(c => c.id !== cabinet.id).map(c => ({ t: cabT(c, wall), dx: c.dx }))
                    const t = findFreeSlot(newT, cabinet.dx, wall.length, occ)
                    onUpdate(cabinet.id, { pos_x: wall.pos_x + t * d.x, pos_y: wall.pos_y + t * d.y })
                  }}
                  className={inp + ' text-right'} />
              </div>
              <div>
                <p className="text-[9px] text-gray-500 mb-0.5">Clear left</p>
                <CalcInput
                  value={meas.clearLeft}
                  decimals={0}
                  onCommit={v => {
                    const d = wallDir(wall)
                    const lN = meas.leftN
                    const desiredT = lN ? lN.t + lN.dx + v : v
                    const occ = wallCabinets.filter(c => c.id !== cabinet.id).map(c => ({ t: cabT(c, wall), dx: c.dx }))
                    const t = findFreeSlot(desiredT, cabinet.dx, wall.length, occ)
                    onUpdate(cabinet.id, { pos_x: wall.pos_x + t * d.x, pos_y: wall.pos_y + t * d.y })
                  }}
                  className={`${inp} text-right ${meas.clearLeft < 0 ? 'text-red-400' : ''}`} />
              </div>
              <div>
                <p className="text-[9px] text-gray-500 mb-0.5">Clear right</p>
                <CalcInput
                  value={meas.clearRight}
                  decimals={0}
                  onCommit={v => {
                    const d = wallDir(wall)
                    const rN = meas.rightN
                    const desiredT = rN ? rN.t - v - cabinet.dx : wall.length - v - cabinet.dx
                    const occ = wallCabinets.filter(c => c.id !== cabinet.id).map(c => ({ t: cabT(c, wall), dx: c.dx }))
                    const t = findFreeSlot(desiredT, cabinet.dx, wall.length, occ)
                    onUpdate(cabinet.id, { pos_x: wall.pos_x + t * d.x, pos_y: wall.pos_y + t * d.y })
                  }}
                  className={`${inp} text-right ${meas.clearRight < 0 ? 'text-red-400' : ''}`} />
              </div>
            </div>
          </div>
        )}

        <div>
          <p className={lbl}>Dimensions (mm)</p>
          <div className="grid grid-cols-3 gap-1.5">
            {(['dx', 'dy', 'dz'] as const).map(dim => (
              <div key={dim}>
                <p className="text-[10px] text-gray-600 text-center mb-0.5 uppercase">{dim}</p>
                <CalcInput value={f(dim) as number}
                  onCommit={v => onUpdate(cabinet.id, { [dim]: v })}
                  className={inp + ' text-right'} />
              </div>
            ))}
          </div>
        </div>
        <div>
          <label className={lbl}>Top Type</label>
          <select value={(f('top_type') as string) ?? 'front_rail'}
            onChange={async e => onUpdate(cabinet.id, { top_type: e.target.value as TopType })} className={inp}>
            <option value="front_rail">Front Rail</option>
            <option value="full_top">Full Top</option>
            <option value="double_rail">Double Rail</option>
            <option value="none">None</option>
          </select>
        </div>
        {(cabinet.assembly_class === 'base' || cabinet.assembly_class === 'tall' ||
          cabinet.assembly_class === 'base_corner' || cabinet.assembly_class === 'tall_corner') && (
          <div>
            <label className={lbl}>Toe Kick</label>
            <select value={(f('toe_type') as string) ?? 'ladder'}
              onChange={async e => onUpdate(cabinet.id, { toe_type: e.target.value as ToeType })} className={inp}>
              <option value="ladder">Ladder Frame</option>
              <option value="leg">Leg</option>
              <option value="none">None</option>
            </select>
          </div>
        )}
        <div>
          <p className={lbl}>Neighbours</p>
          <div className="grid grid-cols-2 gap-1.5">
            {(['left_neighbour_type', 'right_neighbour_type'] as const).map(side => (
              <div key={side}>
                <p className="text-[10px] text-gray-600 mb-0.5 capitalize">{side.split('_')[0]}</p>
                <select value={(f(side) as string) ?? 'wall'}
                  onChange={async e => onUpdate(cabinet.id, { [side]: e.target.value as NeighbourType })} className={inp}>
                  <option value="wall">Wall</option>
                  <option value="cabinet">Cabinet</option>
                  <option value="end_panel">End Panel</option>
                  <option value="freestanding">Freestanding</option>
                </select>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className={lbl}>Scribes (mm)</p>
          <div className="grid grid-cols-3 gap-1">
            {(['SCRL', 'SCRR', 'SCRT', 'SCRBT', 'SCRBK'] as const).map((key, i) => {
              const label = ['Left', 'Right', 'Top', 'Bottom', 'Back'][i]
              const cur = typeof (cabinet.rule_overrides ?? {})[key] === 'number'
                ? cabinet.rule_overrides[key] as number : 0
              return (
                <div key={key}>
                  <p className="text-[10px] text-gray-600 mb-0.5">{label}</p>
                  <CalcInput
                    value={cur}
                    decimals={0}
                    onCommit={v => {
                      const next = { ...(cabinet.rule_overrides ?? {}) }
                      if (v === 0) delete next[key]; else next[key] = v
                      void onUpdate(cabinet.id, { rule_overrides: next })
                    }}
                    className={inp + ' text-right'}
                  />
                </div>
              )
            })}
          </div>
        </div>

        <div>
          <p className={lbl}>Modules</p>
          <div className="space-y-1">
            {([['has_carcass', 'Carcass'], ['has_internal', 'Internal'], ['has_face', 'Face / Doors'], ['has_toekick', 'Toe Kick']] as [keyof CabinetInstance, string][]).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={f(k) as boolean}
                  onChange={async e => onUpdate(cabinet.id, { [k]: e.target.checked })} className="accent-blue-500" />
                <span className="text-xs text-gray-400">{label}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className={lbl}>Notes</label>
          <textarea value={(f('notes') as string) ?? ''} onChange={e => set('notes', e.target.value || null)}
            onBlur={save} rows={2} className={inp + ' resize-none'} />
        </div>
      </div>
      {saving && <div className="px-4 py-2 border-t border-gray-800 text-[10px] text-gray-500">Saving…</div>}
    </div>
  )
}
