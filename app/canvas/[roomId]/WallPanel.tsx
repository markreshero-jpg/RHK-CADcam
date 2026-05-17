'use client'

import { useState } from 'react'
import { Wall, WallType } from '@/src/lib/types'
import { wallEnd } from '@/src/lib/geometry'

export default function WallPanel({ wall, roomHeight, onUpdate, onDelete }: {
  wall: Wall
  roomHeight?: number
  onUpdate: (id: string, u: Partial<Wall>) => Promise<void>
  onDelete: (id: string) => void
}) {
  const [local, setLocal] = useState<Partial<Wall>>({})
  const [saving, setSaving] = useState(false)
  function f<K extends keyof Wall>(k: K) { return (k in local ? local[k] : wall[k]) as Wall[K] }
  function set<K extends keyof Wall>(k: K, v: Wall[K]) { setLocal(l => ({ ...l, [k]: v })) }
  async function save() {
    if (!Object.keys(local).length) return
    setSaving(true); await onUpdate(wall.id, local); setLocal({}); setSaving(false)
  }
  const inp = 'w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500'
  const lbl = 'text-[10px] text-gray-500 uppercase tracking-wider mb-0.5 block'

  const e = wallEnd(wall)
  const displayLen = Math.round(Math.sqrt((e.x - wall.pos_x) ** 2 + (e.y - wall.pos_y) ** 2))

  return (
    <div className="w-72 bg-gray-900 border-l border-gray-800 flex flex-col overflow-y-auto">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-gray-300">{wall.wall_type === 'island' ? 'Island' : 'Wall'}</p>
          <p className="text-[10px] text-gray-500">{displayLen}mm</p>
        </div>
        <button onClick={() => onDelete(wall.id)} className="text-gray-600 hover:text-red-400 text-xs" title="Delete">✕</button>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <label className={lbl}>Type</label>
          <select value={f('wall_type') as string}
            onChange={async e => onUpdate(wall.id, { wall_type: e.target.value as WallType, thickness: e.target.value === 'island' ? 0 : (wall.thickness || 90) })}
            className={inp}>
            <option value="standard">Standard</option>
            <option value="island">Island</option>
          </select>
        </div>
        <div>
          <label className={lbl}>Name</label>
          <input value={f('name') as string} onChange={e => set('name', e.target.value)} onBlur={save} className={inp} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lbl}>Length (mm)</label>
            <input type="number" value={f('length') as number}
              onChange={e => set('length', parseFloat(e.target.value) || 0)}
              onFocus={e => e.target.select()} onBlur={save} className={inp + ' text-right'} />
          </div>
          <div>
            <label className={lbl}>Angle (°)</label>
            <input type="number" value={Math.round(f('angle') as number)}
              onChange={e => set('angle', parseFloat(e.target.value) || 0)}
              onFocus={e => e.target.select()} onBlur={save} className={inp + ' text-right'} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lbl}>Thickness (mm)</label>
            <input type="number" value={f('thickness') as number}
              onChange={e => set('thickness', parseFloat(e.target.value) || 90)}
              onFocus={e => e.target.select()} onBlur={save} className={inp + ' text-right'} />
          </div>
          <div>
            <label className={lbl}>Height (mm)</label>
            <input type="number" value={(f('height') ?? '') as number}
              placeholder={roomHeight != null ? String(roomHeight) : 'Room default'}
              onChange={e => set('height', parseFloat(e.target.value) || null as unknown as number)}
              onFocus={e => e.target.select()} onBlur={save} className={inp + ' text-right'} />
          </div>
        </div>
        <div>
          <label className={lbl}>Soffit Height (mm)</label>
          <input type="number" value={(f('soffit_height') ?? '') as number}
            placeholder="Room default"
            onChange={e => set('soffit_height', parseFloat(e.target.value) || null as unknown as number)}
            onFocus={e => e.target.select()} onBlur={save} className={inp + ' text-right'} />
        </div>
        <div>
          <label className={lbl}>Start position (mm)</label>
          <div className="grid grid-cols-2 gap-2">
            <input type="number" value={Math.round(f('pos_x') as number)}
              onChange={e => set('pos_x', parseFloat(e.target.value) || 0)}
              onFocus={e => e.target.select()} onBlur={save} className={inp + ' text-right'} placeholder="X" />
            <input type="number" value={Math.round(f('pos_y') as number)}
              onChange={e => set('pos_y', parseFloat(e.target.value) || 0)}
              onFocus={e => e.target.select()} onBlur={save} className={inp + ' text-right'} placeholder="Y" />
          </div>
        </div>
      </div>
      {saving && <div className="px-4 py-2 border-t border-gray-800 text-[10px] text-gray-500">Saving…</div>}
    </div>
  )
}
