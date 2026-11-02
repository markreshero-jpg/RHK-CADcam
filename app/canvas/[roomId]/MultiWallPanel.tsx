'use client'

import { Wall } from '@/src/lib/types'
import CalcInput from '@/src/components/CalcInput'
import { wallEnd } from '@/src/lib/geometry'

/** Shared edits for a box / Shift+click selection of several walls. */
export default function MultiWallPanel({ walls, roomHeight, onUpdateMany, onDeleteMany, onClear }: {
  walls: Wall[]
  roomHeight?: number
  onUpdateMany: (u: Partial<Wall>) => void
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
        <div>
          <label className={lbl}>Positions (mm) — X, Y</label>
          {(() => {
            const r = (n: number) => Math.round(n)
            const pts = walls.flatMap(w => [{ x: w.pos_x, y: w.pos_y }, wallEnd(w)])
            const minX = Math.min(...pts.map(p => p.x)), maxX = Math.max(...pts.map(p => p.x))
            const minY = Math.min(...pts.map(p => p.y)), maxY = Math.max(...pts.map(p => p.y))
            return (
              <div className="space-y-1.5 text-[10px] text-gray-400 tabular-nums">
                {walls.map(w => {
                  const e = wallEnd(w)
                  return (
                    <div key={w.id} className="bg-gray-800/50 rounded px-2 py-1">
                      <p className="text-gray-300 text-xs">{w.name}</p>
                      <p>Start {r(w.pos_x)}, {r(w.pos_y)}</p>
                      <p>End {r(e.x)}, {r(e.y)}</p>
                      <p>Centre {r((w.pos_x + e.x) / 2)}, {r((w.pos_y + e.y) / 2)}</p>
                    </div>
                  )
                })}
                <div className="bg-gray-800/50 rounded px-2 py-1">
                  <p className="text-gray-300 text-xs">Selection (wall lines)</p>
                  <p>Centre {r((minX + maxX) / 2)}, {r((minY + maxY) / 2)}</p>
                  <p>Extents X {r(minX)} → {r(maxX)} · Y {r(minY)} → {r(maxY)}</p>
                </div>
              </div>
            )
          })()}
        </div>
        <button onClick={onDeleteMany}
          className="w-full bg-red-900/40 hover:bg-red-900/70 text-red-300 text-xs font-medium py-1.5 rounded transition-colors">
          Delete {walls.length} walls (Del)
        </button>
      </div>
    </div>
  )
}
