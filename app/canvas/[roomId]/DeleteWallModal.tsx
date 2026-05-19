'use client'

import { useEffect } from 'react'

export default function DeleteWallModal({ onConfirm, onCancel }: {
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); onConfirm() }
      if (e.key === 'Escape') { e.preventDefault(); onCancel() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onConfirm, onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onPointerDown={onCancel}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-80 p-6 flex flex-col gap-4"
        onPointerDown={e => e.stopPropagation()}>
        <div>
          <p className="text-sm font-semibold text-white">Delete Wall</p>
          <p className="text-xs text-gray-400 mt-1">Cabinets on this wall will also be removed. This cannot be undone.</p>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel}
            className="px-4 py-1.5 text-xs rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm}
            className="px-4 py-1.5 text-xs rounded-lg bg-red-600 text-white hover:bg-red-500 transition-colors">
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
