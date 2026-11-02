'use client'

import { Wall } from '@/src/lib/types'
import CalcInput from '@/src/components/CalcInput'
import { wallEnd } from '@/src/lib/geometry'
import { WallEndFields } from './WallPanel'

const r1 = (n: number) => Math.round(n * 10) / 10

/** Shared edits for a box / Shift+click selection of several walls. */
export default function MultiWallPanel({ walls, roomHeight, onUpdateMany, onUpdateWall, onMoveBy, onDeleteMany, onClear }: {
  walls: Wall[]
  roomHeight?: number
  onUpdateMany: (u: Partial<Wall>) => void
  /** Edit one wall of the set (start / end / centre) — joined walls follow, like the single-wall panel. */
  onUpdateWall: (id: string, u: Partial<Wall>) => Promise<void> | void
  /** Move the whole set + everything on it by (dx, dy), like a drag. */
  onMoveBy: (dx: number, dy: number) => Promise<void> | void
  onDeleteMany: () => void
  onClear: () => void
}) {
  const inp = 'w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500'
  const lbl = 'text-[10px] text-gray-500 uppercase tracking-wider mb-0.5 block'
  // A field shows its value only when every selected wall agrees.
  function common<K extends keyof Wall>(k: K): Wall[K] | null {
    const v = walls[0]?.[k]
    return walls.every(w => w[k] === v) ? (v ?? null) : null
  }
  const mixed = (k: keyof Wall) => !walls.every(w => w[k] === walls[0]?.[k])
  const standard = walls.filter(w => w.wall_type !== 'island')
  const total = Math.round(walls.reduce((s, w) => s + w.length, 0))

  // Selection extents over the wall lines (start + end points).
  const pts = walls.flatMap(w => [{ x: w.pos_x, y: w.pos_y }, wallEnd(w)])
  const minX = Math.min(...pts.map(p => p.x)), maxX = Math.max(...pts.map(p => p.x))
  const minY = Math.min(...pts.map(p => p.y)), maxY = Math.max(...pts.map(p => p.y))
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2

  const pair = (x: number, y: number, set: (x: number | null, y: number | null) => void) => (
    <div className="grid grid-cols-2 gap-2">
      <CalcInput value={r1(x)} decimals={1} onCommit={v => set(v, null)} className={inp + ' text-right'} placeholder="X" />
      <CalcInput value={r1(y)} decimals={1} onCommit={v => set(null, v)} className={inp + ' text-right'} placeholder="Y" />
    </div>
  )
  // Move the whole set so the reference point (fx, fy) lands on the typed value.
  const moveSetTo = (x: number | null, y: number | null, fx: number, fy: number) =>
    void onMoveBy(x == null ? 0 : x - fx, y == null ? 0 : y - fy)

  return (
    <div className="w-72 bg-gray-900 border-l border-gray-800 flex flex-col overflow-y-auto">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-gray-300">{walls.length} walls selected</p>
          <p className="text-[10px] text-gray-500">{total}mm total · Shift+click to add/remove</p>
        </div>
        <button onClick={onClear} className="text-gray-600 hover:text-gray-300 text-xs" title="Clear selection">✕</button>
      </div>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lbl}>Thickness (mm)</label>
            <CalcInput value={common('thickness') as number | null} decimals={1}
              placeholder={mixed('thickness') ? 'Mixed' : undefined}
              disabled={standard.length === 0}
              onCommit={v => onUpdateMany({ thickness: v })} className={inp + ' text-right'} />
          </div>
          <div>
            <label className={lbl}>Height (mm)</label>
            <CalcInput value={common('height') as number | null} decimals={1}
              placeholder={mixed('height') ? 'Mixed' : roomHeight != null ? String(roomHeight) : 'Room default'}
              onCommit={v => onUpdateMany({ height: v })}
              onClear={() => onUpdateMany({ height: null as unknown as number })}
              className={inp + ' text-right'} />
          </div>
        </div>
        <div>
          <label className={lbl}>Soffit Depth from top (mm)</label>
          <CalcInput value={common('soffit_height') as number | null} decimals={1}
            placeholder={mixed('soffit_height') ? 'Mixed' : 'Room default'}
            onCommit={v => onUpdateMany({ soffit_height: v })}
            onClear={() => onUpdateMany({ soffit_height: null as unknown as number })}
            className={inp + ' text-right'} />
        </div>

        <div className="border border-gray-800 rounded p-2 space-y-2">
          <p className="text-xs text-gray-300">Selection position</p>
          <p className="text-[10px] text-gray-600 -mt-1">Moves all {walls.length} walls and everything on them, like a drag.</p>
          <div>
            <label className={lbl}>Centre (mm)</label>
            {pair(cx, cy, (x, y) => moveSetTo(x, y, cx, cy))}
          </div>
          <div>
            <label className={lbl}>Min corner — X / Y (mm)</label>
            {pair(minX, minY, (x, y) => moveSetTo(x, y, minX, minY))}
          </div>
          <p className="text-[10px] text-gray-600">Extents X {Math.round(minX)} → {Math.round(maxX)} · Y {Math.round(minY)} → {Math.round(maxY)}</p>
        </div>

        {walls.map(w => {
          const e = wallEnd(w)
          const wcx = (w.pos_x + e.x) / 2, wcy = (w.pos_y + e.y) / 2
          return (
            <div key={w.id} className="border border-gray-800 rounded p-2 space-y-2">
              <p className="text-xs text-gray-300">{w.name} · {Math.round(w.length)}mm</p>
              <div>
                <label className={lbl}>Start (mm)</label>
                {pair(w.pos_x, w.pos_y, (x, y) => void onUpdateWall(w.id, x != null ? { pos_x: x } : { pos_y: y! }))}
              </div>
              <WallEndFields wall={w} inp={inp} lbl={lbl} label="End (mm)" onUpdate={onUpdateWall} />
              <div>
                <label className={lbl}>Centre (mm)</label>
                {pair(wcx, wcy, (x, y) => void onUpdateWall(w.id, {
                  pos_x: w.pos_x + (x == null ? 0 : x - wcx),
                  pos_y: w.pos_y + (y == null ? 0 : y - wcy),
                }))}
              </div>
            </div>
          )
        })}

        <button onClick={onDeleteMany}
          className="w-full bg-red-900/40 hover:bg-red-900/70 text-red-300 text-xs font-medium py-1.5 rounded transition-colors">
          Delete {walls.length} walls (Del)
        </button>
      </div>
    </div>
  )
}
