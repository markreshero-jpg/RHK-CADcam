'use client'

import { useEffect } from 'react'

export type WallDetachChoice = 'stretch' | 'move_all' | 'detach' | 'cancel'

/**
 * Shown when a wall drag pulls walls off walls they're joined to. Each option
 * is a full-width row (title + what it does); Esc / backdrop = Cancel.
 */
export default function WallDetachModal({ movedCount, neighbourNames, canStretch, onChoose }: {
  movedCount: number
  neighbourNames: string[]
  /** False when stretching would shrink a connected wall to nothing. */
  canStretch: boolean
  onChoose: (c: WallDetachChoice) => void
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); onChoose('cancel') }
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [onChoose])

  const moved = movedCount === 1 ? 'This wall is' : `These ${movedCount} walls are`
  const names = neighbourNames.length <= 3
    ? neighbourNames.join(', ')
    : `${neighbourNames.slice(0, 3).join(', ')} +${neighbourNames.length - 3} more`
  const them = neighbourNames.length === 1 ? 'it' : 'them'
  const row = 'w-full text-left px-3 py-2 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onPointerDown={() => onChoose('cancel')}
      onContextMenu={e => e.preventDefault()}>
      <div className="bg-surface border border-edge-strong rounded-xl shadow-2xl w-96 max-w-full p-5 flex flex-col gap-3"
        onPointerDown={e => e.stopPropagation()}>
        <div>
          <p className="text-sm font-semibold text-ink">⚠ Moving off connected walls</p>
          <p className="text-xs text-ink-muted mt-1">
            {moved} joined to <span className="text-ink">{names}</span>. What should happen to {them}?
          </p>
        </div>
        <button autoFocus disabled={!canStretch} onClick={() => onChoose('stretch')}
          className={`${row} border-accent/60 bg-accent/10 hover:bg-accent/20`}>
          <span className="block text-xs font-semibold text-ink">Stretch connected walls to suit</span>
          <span className="block text-[11px] text-ink-muted">
            {canStretch
              ? 'Corners stay joined — connected walls lengthen, shorten or turn to meet the moved walls'
              : 'Not possible — a connected wall would shrink to nothing'}
          </span>
        </button>
        <button onClick={() => onChoose('move_all')}
          className={`${row} border-edge hover:bg-surface-3`}>
          <span className="block text-xs font-semibold text-ink">Move connected walls too</span>
          <span className="block text-[11px] text-ink-muted">Everything joined to them moves by the same amount (e.g. the whole room)</span>
        </button>
        <button onClick={() => onChoose('detach')}
          className={`${row} border-edge hover:bg-surface-3`}>
          <span className="block text-xs font-semibold text-ink">Detach</span>
          <span className="block text-[11px] text-ink-muted">Leave connected walls where they are — the corners come apart</span>
        </button>
        <div className="flex justify-end">
          <button onClick={() => onChoose('cancel')}
            className="px-4 py-1.5 text-xs rounded-lg bg-surface-3 text-ink-muted hover:text-ink transition-colors">
            Cancel (Esc)
          </button>
        </div>
      </div>
    </div>
  )
}
