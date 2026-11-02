'use client'

import PanelDeleteButton, { PanelCloseButton } from './PanelDeleteButton'
import { useState } from 'react'
import { Wall, WallType } from '@/src/lib/types'
import { wallEnd } from '@/src/lib/geometry'
import CalcInput from '@/src/components/CalcInput'
import { parseWallProfile, formatWallProfile } from '@/src/lib/wallProfile'

const r1 = (n: number) => Math.round(n * 10) / 10
/** Small caption over each X / Y box. */
export const xyLbl = 'text-[10px] text-gray-400 font-medium mb-0.5 block'

/** Editable wall end X / Y — the start stays put; length + angle follow the new end. */
export function WallEndFields({ wall, inp, lbl, onUpdate, label = 'End position (mm)', xyPrefix = 'End ' }: {
  wall: Wall; inp: string; lbl: string; label?: string; xyPrefix?: string
  onUpdate: (id: string, u: Partial<Wall>) => Promise<void> | void
}) {
  const e = wallEnd(wall)
  function setEnd(x: number, y: number) {
    const dx = x - wall.pos_x, dy = y - wall.pos_y
    const length = Math.hypot(dx, dy)
    if (length < 1) return
    void onUpdate(wall.id, { length: r1(length), angle: Math.atan2(dy, dx) * 180 / Math.PI })
  }
  return (
    <div>
      {label && <label className={lbl}>{label}</label>}
      <div className="grid grid-cols-2 gap-2">
        <div><span className={xyLbl}>{xyPrefix}X</span>
          <CalcInput value={r1(e.x)} decimals={1} onCommit={v => setEnd(v, e.y)} className={inp + ' text-right'} placeholder="X" /></div>
        <div><span className={xyLbl}>{xyPrefix}Y</span>
          <CalcInput value={r1(e.y)} decimals={1} onCommit={v => setEnd(e.x, v)} className={inp + ' text-right'} placeholder="Y" /></div>
      </div>
    </div>
  )
}

export default function WallPanel({ wall, roomHeight, onUpdate, onMoveBy, onDelete, onClose }: {
  wall: Wall
  roomHeight?: number
  onUpdate: (id: string, u: Partial<Wall>) => Promise<void>
  /** Move the wall and everything on it by (dx, dy), like a drag. */
  onMoveBy?: (dx: number, dy: number) => Promise<void> | void
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
  function moveCentre(x: number | null, y: number | null) {
    const cx = (wall.pos_x + e.x) / 2, cy = (wall.pos_y + e.y) / 2
    const dx = x == null ? 0 : x - cx, dy = y == null ? 0 : y - cy
    if (onMoveBy) void onMoveBy(dx, dy)
    else void onUpdate(wall.id, { pos_x: wall.pos_x + dx, pos_y: wall.pos_y + dy })
  }

  return (
    <div className="w-72 bg-gray-900 border-l border-gray-800 flex flex-col overflow-y-auto">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-gray-300">{wall.wall_type === 'island' ? 'Island' : wall.wall_type === 'nib' ? 'Nib wall' : 'Wall'}</p>
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
            <option value="nib">Nib (stub off a wall)</option>
          </select>
          {wall.wall_type === 'nib' && (
            <p className="text-[10px] text-gray-600 mt-0.5">Start on a wall&apos;s inside face; drawn centred on its line, shows on that wall&apos;s elevation.</p>
          )}
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
            <div><span className={xyLbl}>Start X</span>
              <CalcInput value={f('pos_x') as number} decimals={1}
                onCommit={v => onUpdate(wall.id, { pos_x: v })} className={inp + ' text-right'} placeholder="X" /></div>
            <div><span className={xyLbl}>Start Y</span>
              <CalcInput value={f('pos_y') as number} decimals={1}
                onCommit={v => onUpdate(wall.id, { pos_y: v })} className={inp + ' text-right'} placeholder="Y" /></div>
          </div>
        </div>
        <WallEndFields wall={wall} inp={inp} lbl={lbl} onUpdate={onUpdate} />
        <div>
          <label className={lbl}>Centre position (mm)</label>
          <div className="grid grid-cols-2 gap-2">
            <div><span className={xyLbl}>Centre X</span>
              <CalcInput value={r1((wall.pos_x + e.x) / 2)} decimals={1}
                onCommit={v => moveCentre(v, null)} className={inp + ' text-right'} placeholder="X" /></div>
            <div><span className={xyLbl}>Centre Y</span>
              <CalcInput value={r1((wall.pos_y + e.y) / 2)} decimals={1}
                onCommit={v => moveCentre(null, v)} className={inp + ' text-right'} placeholder="Y" /></div>
          </div>
          <p className="text-[10px] text-gray-600 mt-0.5">Moves the wall and everything on it, like a drag.</p>
        </div>
      </div>
      <PanelDeleteButton label={wall.wall_type === 'island' ? 'Delete island' : 'Delete wall'} onDelete={() => onDelete(wall.id)} />
      {saving && <div className="px-4 py-2 border-t border-gray-800 text-[10px] text-gray-500">Saving…</div>}
    </div>
  )
}
