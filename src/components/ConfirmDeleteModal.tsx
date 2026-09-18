'use client'

import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'

type ConfirmOpts = {
  title: string
  message: string
  confirmLabel?: string
  /** 'danger' = red confirm button (deletes); 'neutral' = accent button (yes/no questions). */
  tone?: 'danger' | 'neutral'
}

// The app's one confirmation look. Use <ConfirmDeleteModal> when the caller already
// tracks "pending" state, or `await confirmDelete({...})` / `await confirmAction({...})`
// as a drop-in for window.confirm().
export default function ConfirmDeleteModal({ title, message, confirmLabel, tone = 'danger', onConfirm, onCancel }: ConfirmOpts & {
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); onConfirm() }
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); onCancel() }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [onConfirm, onCancel])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onPointerDown={onCancel}
      onContextMenu={e => e.preventDefault()}>
      <div className="bg-surface border border-edge-strong rounded-xl shadow-2xl w-80 max-w-full p-6 flex flex-col gap-4"
        onPointerDown={e => e.stopPropagation()}>
        <div>
          <p className="text-sm font-semibold text-ink">{title}</p>
          <p className="text-xs text-ink-muted mt-1 whitespace-pre-line">{message}</p>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel}
            className="px-4 py-1.5 text-xs rounded-lg bg-surface-3 text-ink-muted hover:text-ink transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm}
            className={`px-4 py-1.5 text-xs rounded-lg text-white transition-colors ${
              tone === 'danger' ? 'bg-red-600 hover:bg-red-500' : 'bg-accent hover:bg-accent-hover'}`}>
            {confirmLabel ?? (tone === 'danger' ? 'Delete' : 'OK')}
          </button>
        </div>
      </div>
    </div>
  )
}

function openConfirm(opts: ConfirmOpts): Promise<boolean> {
  return new Promise(resolve => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const done = (ok: boolean) => {
      root.unmount()
      host.remove()
      resolve(ok)
    }
    root.render(<ConfirmDeleteModal {...opts} onConfirm={() => done(true)} onCancel={() => done(false)} />)
  })
}

/** Promise-based replacement for window.confirm() on deletes (red button). */
export const confirmDelete = (opts: Omit<ConfirmOpts, 'tone'>) => openConfirm({ ...opts, tone: 'danger' })

/** Promise-based replacement for window.confirm() on non-destructive questions. */
export const confirmAction = (opts: Omit<ConfirmOpts, 'tone'>) => openConfirm({ ...opts, tone: 'neutral' })
