'use client'

import { Room } from '@/src/lib/types'

type Counts = { cabinets: number; walls: number; benchtops: number }

export default function DeleteRoomModal({ room, counts, blocked, busy, error, onCancel, onConfirm }: {
  room: Room
  counts: Counts | null   // null = still loading
  blocked: boolean        // single-room guard: this is the only room in the project
  busy: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onPointerDown={onCancel}
    >
      <div
        className="bg-surface border border-edge rounded-xl shadow-2xl w-[440px] max-w-full p-5"
        onPointerDown={e => e.stopPropagation()}
      >
        {blocked ? (
          <>
            <h2 className="text-base font-bold text-ink mb-2">Cannot Delete Room</h2>
            <p className="text-sm text-ink-muted mb-5">
              Cannot delete the only room in a project. Add another room first.
            </p>
            <div className="flex justify-end">
              <button
                onClick={onCancel}
                className="text-xs font-medium text-ink-muted hover:text-ink px-3 py-2 rounded-lg hover:bg-surface-2 transition-colors"
              >
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-base font-bold text-ink mb-1">Delete Room?</h2>
            <p className="text-lg font-semibold text-ink mb-3">{room.name}</p>

            <p className="text-sm text-ink-muted mb-3">
              This will permanently delete <span className="font-medium text-ink">{room.name}</span> and
              all cabinets, walls, and benchtops within it. This cannot be undone.
            </p>

            <div className="text-xs text-ink-subtle mb-5">
              {counts === null ? (
                'Counting contents…'
              ) : (
                <>
                  {counts.cabinets} {counts.cabinets === 1 ? 'cabinet' : 'cabinets'},{' '}
                  {counts.walls} {counts.walls === 1 ? 'wall' : 'walls'},{' '}
                  {counts.benchtops} {counts.benchtops === 1 ? 'benchtop' : 'benchtops'}
                </>
              )}
            </div>

            {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

            <div className="flex justify-end gap-2">
              <button
                onClick={onCancel}
                disabled={busy}
                className="text-xs font-medium text-ink-muted hover:text-ink disabled:opacity-40 px-3 py-2 rounded-lg hover:bg-surface-2 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                disabled={busy}
                className="text-xs font-semibold text-white bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-2 rounded-lg transition-colors"
              >
                {busy ? 'Deleting…' : 'Delete Room'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
