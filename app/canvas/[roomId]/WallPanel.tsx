'use client'

import PanelDeleteButton, { PanelCloseButton } from './PanelDeleteButton'
import { useState } from 'react'
import { Wall, WallType } from '@/src/lib/types'
import { wallEnd } from '@/src/lib/geometry'
import CalcInput from '@/src/components/CalcInput'
import { parseWallProfile, formatWallProfile } from '@/src/lib/wallProfile'

export default function WallPanel({ wall, roomHeight, onUpdate, onDelete, onClose }: {
  wall: Wall
  roomHeight?: number
  onUpdate: (id: string, u: Partial<Wall>) => Promise<void>
  onDelete: (id: string) => void
  onClose?: () => void
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
        {onClose && <PanelCloseButton onClose={onClose} />}
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
            <CalcInput value={f('length') as number} decimals={1}
              onCommit={v => onUpdate(wall.id, { length: v })} className={inp + ' text-right'} />
          </div>
          <div>
            <label className={lbl}>Angle (°)</label>
            <CalcInput value={Math.round(f('angle') as number)} decimals={0}
              onCommit={v => onUpdate(wall.id, { angle: v })} className={inp + ' text-right'} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lbl}>Thickness (mm)</label>
            <CalcInput value={f('thickness') as number} decimals={1}
              onCommit={v => onUpdate(wall.id, { thickness: v })} className={inp + ' text-right'} />
          </div>
          <div>
            <label className={lbl}>Height (mm)</label>
            <CalcInput value={(f('height') ?? null) as number | null} decimals={1}
              placeholder={roomHeight != null ? String(roomHeight) : 'Room default'}
              onCommit={v => onUpdate(wall.id, { height: v })}
              onClear={() => onUpdate(wall.id, { height: null as unknown as number })}
              className={inp + ' text-right'} />
          </div>
        </div>
        <div>
          <label className={lbl}>Soffit Depth from top (mm)</label>
          <CalcInput value={(f('soffit_height') ?? null) as number | null} decimals={1}
            placeholder="Room default"
            onCommit={v => onUpdate(wall.id, { soffit_height: v })}
            onClear={() => onUpdate(wall.id, { soffit_height: null as unknown as number })}
            className={inp + ' text-right'} />
        </div>
        {wall.wall_type !== 'island' && (
          <div>
            <label className={lbl}>Raked top (along:height, …)</label>
            <input key={formatWallProfile(wall.top_profile)} defaultValue={formatWallProfile(wall.top_profile)}
              placeholder="Flat — e.g. 0:2614, 5225:3900"
              onBlur={e => {
                const pts = e.target.value.trim() ? parseWallProfile(e.target.value) : null
                if (e.target.value.trim() && !pts) { e.target.value = formatWallProfile(wall.top_profile); return }
                if (formatWallProfile(pts) === formatWallProfile(wall.top_profile)) return
                // wall.height follows the highest point so the elevation frame fits the rake.
                onUpdate(wall.id, pts ? { top_profile: pts, height: Math.max(...pts.map(p => p.h)) } : { top_profile: null })
              }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              className={inp} />
            <p className="text-[10px] text-gray-600 mt-0.5">Distance from the wall start : height. Flat past the first and last point. Blank = flat.</p>
          </div>
        )}
        <div>
          <label className={lbl}>Start position (mm)</label>
          <div className="grid grid-cols-2 gap-2">
            <CalcInput value={f('pos_x') as number} decimals={1}
              onCommit={v => onUpdate(wall.id, { pos_x: v })} className={inp + ' text-right'} placeholder="X" />
            <CalcInput value={f('pos_y') as number} decimals={1}
              onCommit={v => onUpdate(wall.id, { pos_y: v })} className={inp + ' text-right'} placeholder="Y" />
          </div>
        </div>
      </div>
      <PanelDeleteButton label={wall.wall_type === 'island' ? 'Delete island' : 'Delete wall'} onDelete={() => onDelete(wall.id)} />
      {saving && <div className="px-4 py-2 border-t border-gray-800 text-[10px] text-gray-500">Saving…</div>}
    </div>
  )
}
