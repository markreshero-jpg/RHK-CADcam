'use client'

import type { ReactNode } from 'react'
import CalcInput from '@/src/components/CalcInput'
import { WALL_ANGLE_STEPS, type WallDrawPrefs } from '@/src/lib/userPrefs'

interface Props {
  mode: 'draw_wall' | 'draw_island'
  /** A start point is down (a wall is following the mouse). */
  drawing: boolean
  /** Walls placed so far in the current chain. */
  chainCount: number
  settings: WallDrawPrefs
  onSettings: (patch: Partial<WallDrawPrefs>) => void
  height: number | null
  setHeight: (v: number | null) => void
  soffit: number | null
  setSoffit: (v: number | null) => void
  onFinishChain: () => void
  onCancel: () => void
  /** Live length / angle entry (DrawingPanel) while a wall is being drawn. */
  children?: ReactNode
}

export default function WallDrawPanel({
  mode, drawing, chainCount, settings, onSettings, height, setHeight, soffit, setSoffit, onFinishChain, onCancel, children,
}: Props) {
  const isIsland = mode === 'draw_island'
  const chain = !isIsland && settings.chain
  const inputCls = 'w-full bg-gray-800 border border-gray-700 focus:border-blue-500 rounded px-2 py-1.5 text-sm text-white outline-none'
  const labelCls = 'text-xs text-gray-500 block mb-1'

  return (
    <div className="w-52 bg-gray-900 border-l border-gray-800 flex flex-col shrink-0 overflow-y-auto">
      <div className="px-4 py-3 border-b border-gray-800">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {isIsland ? 'Island' : drawing ? 'Drawing Wall' : 'Standard Wall'}
        </p>
        {chain && drawing && chainCount > 0 && (
          <p className="text-[11px] text-gray-500 mt-0.5">Chain · {chainCount} wall{chainCount === 1 ? '' : 's'} placed</p>
        )}
      </div>

      {children && <div className="px-4 pt-4">{children}</div>}

      <div className="px-4 py-4 flex flex-col gap-4">
        {!isIsland && (
          <label className="flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.chain}
              onChange={e => onSettings({ chain: e.target.checked })}
              className="mt-0.5 accent-blue-500"
            />
            <span className="text-xs text-gray-300 leading-snug">
              Chained line
              <span className="block text-gray-600">Each click starts the next wall from the last one&apos;s end</span>
            </span>
          </label>
        )}

        {!isIsland && (
          <div>
            <label className={labelCls}>Thickness (mm)</label>
            <CalcInput
              value={settings.thickness}
              decimals={1}
              min={10}
              onCommit={v => onSettings({ thickness: v })}
              className={inputCls}
            />
          </div>
        )}

        <div>
          <label className={labelCls}>
            Height (mm) <span className="text-gray-600">(optional)</span>
          </label>
          <CalcInput
            value={height}
            decimals={1}
            placeholder="2400"
            onCommit={setHeight}
            onClear={() => setHeight(null)}
            className={inputCls}
          />
        </div>

        {!isIsland && (
          <div>
            <label className={labelCls} title="Overrides the room soffit height for wall cabinets on these walls">
              Soffit height (mm) <span className="text-gray-600">(optional)</span>
            </label>
            <CalcInput
              value={soffit}
              decimals={1}
              placeholder="Room default"
              onCommit={setSoffit}
              onClear={() => setSoffit(null)}
              className={inputCls}
            />
          </div>
        )}

        <div>
          <label className={labelCls}>Angle snap</label>
          <select
            value={settings.angleStep}
            onChange={e => onSettings({ angleStep: Number(e.target.value) })}
            className={inputCls}
          >
            {WALL_ANGLE_STEPS.map(s => <option key={s} value={s}>{s === 0 ? 'Off (free)' : `${s}°`}</option>)}
          </select>
        </div>

        <p className="text-xs text-gray-600 leading-relaxed">
          {!drawing
            ? 'Click on canvas to start drawing'
            : chain
              ? 'Click the first point to close the room · double-click, right-click or Esc to finish'
              : 'Click to place the wall'}
        </p>

        {chain && drawing && (
          <button
            onClick={onFinishChain}
            className="w-full bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-medium py-1.5 rounded transition-colors"
          >
            Finish chain (Esc)
          </button>
        )}

        <button
          onClick={onCancel}
          className="w-full bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs font-medium py-1.5 rounded transition-colors"
        >
          {chain && drawing ? 'Exit wall tool' : 'Cancel (Esc)'}
        </button>
      </div>
    </div>
  )
}
