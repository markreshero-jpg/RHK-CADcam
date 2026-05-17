'use client'

export default function SplitCabinetModal({ width, onSplit, onCancel }: {
  width: number
  onSplit: (count: number) => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onPointerDown={onCancel}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-72 p-6 flex flex-col gap-4"
        onPointerDown={e => e.stopPropagation()}>
        <div>
          <p className="text-sm font-semibold text-white">Split Cabinet</p>
          <p className="text-xs text-gray-400 mt-1">{width}mm total — split into equal-width cabinets</p>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {([2, 3, 4, 5] as const).map(n => (
            <button
              key={n}
              onClick={() => onSplit(n)}
              className="flex flex-col items-center gap-1 px-2 py-3 rounded-lg bg-gray-700 hover:bg-blue-600 text-white transition-colors"
            >
              <span className="text-base font-bold">{n}</span>
              <span className="text-xs text-gray-300">{Math.round(width / n)}mm</span>
            </button>
          ))}
        </div>
        <div className="flex justify-end">
          <button onClick={onCancel}
            className="px-4 py-1.5 text-xs rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
