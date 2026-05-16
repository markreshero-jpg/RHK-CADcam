'use client'

interface Props {
  mode: 'draw_wall' | 'draw_island'
  thickness: number
  setThickness: (v: number) => void
  height: number | null
  setHeight: (v: number | null) => void
  onCancel: () => void
}

export default function WallDrawPanel({ mode, thickness, setThickness, height, setHeight, onCancel }: Props) {
  const isIsland = mode === 'draw_island'
  const inputCls = 'w-full bg-gray-800 border border-gray-700 focus:border-blue-500 rounded px-2 py-1.5 text-sm text-white outline-none'

  return (
    <div className="w-52 bg-gray-900 border-l border-gray-800 flex flex-col shrink-0">
      <div className="px-4 py-3 border-b border-gray-800">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {isIsland ? 'Island' : 'Standard Wall'}
        </p>
      </div>

      <div className="px-4 py-4 flex flex-col gap-4">
        {!isIsland && (
          <div>
            <label className="text-xs text-gray-500 block mb-1">Thickness (mm)</label>
            <input
              type="number"
              min={10}
              step={1}
              value={thickness}
              onChange={e => setThickness(parseInt(e.target.value) || 90)}
              onFocus={e => e.currentTarget.select()}
              className={inputCls}
            />
          </div>
        )}

        <div>
          <label className="text-xs text-gray-500 block mb-1">
            Height (mm) <span className="text-gray-600">(optional)</span>
          </label>
          <input
            type="number"
            min={100}
            step={10}
            value={height ?? ''}
            placeholder="2400"
            onChange={e => setHeight(e.target.value ? parseInt(e.target.value) : null)}
            onFocus={e => e.currentTarget.select()}
            className={inputCls}
          />
        </div>

        <p className="text-xs text-gray-600 leading-relaxed">
          Click on canvas to start drawing
        </p>

        <button
          onClick={onCancel}
          className="w-full bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs font-medium py-1.5 rounded transition-colors"
        >
          Cancel (Esc)
        </button>
      </div>
    </div>
  )
}
