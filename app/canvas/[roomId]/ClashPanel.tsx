'use client'
// Clashes to check (z_offline/OFFLINE-SPEC.md, step 1b). Opened from the ⚠ button next to
// the save light. Each row: what happened, Show (select it), and the fix-up choices.

import type { RoomAnnotation } from '@/src/lib/types'
import { useClashes, type AnnotationClash } from '@/src/lib/offline/clashes'
import { outbox } from '@/src/lib/offline/outbox'

const KIND_NAME: Record<string, string> = {
  text: 'Text', line: 'Line', arrow: 'Arrow', rect: 'Box', ellipse: 'Ellipse', cloud: 'Cloud',
  dim: 'Dimension', arc: 'Arc', circle: 'Circle', leader: 'Leader', sketch: 'Sketch',
}

function itemName(c: AnnotationClash, live: RoomAnnotation | undefined): string {
  const row = (live ?? c.theirs ?? c.mine ?? {}) as { kind?: string; text?: string | null }
  const name = KIND_NAME[row.kind ?? ''] ?? 'CAD item'
  const t = row.text?.trim().replace(/\s+/g, ' ')
  return t ? `${name} "${t.length > 28 ? t.slice(0, 28) + '…' : t}"` : name
}

const WHAT: Record<string, (c: AnnotationClash) => string> = {
  changed: c => c.my_op === 'delete'
    ? 'Someone else changed it while you were offline; you deleted it. Their version is kept here.'
    : 'Someone else changed it while you were offline; your version was saved over theirs.',
  restored: () => 'Someone else deleted it while you were offline; your edit put it back.',
  lost: () => 'Someone else deleted it while you were offline; your change couldn’t be applied.',
}

export default function ClashPanel({ annotations, setAnnotations, captureSnapshot, select }: {
  annotations: RoomAnnotation[]
  setAnnotations: React.Dispatch<React.SetStateAction<RoomAnnotation[]>>
  captureSnapshot: () => void
  select: (ids: string[]) => void
}) {
  const { list, open, setOpen, resolve } = useClashes()
  if (!open || !list.length) return null

  const useTheirs = (c: AnnotationClash) => {
    if (!c.theirs) return
    const row = c.theirs as unknown as RoomAnnotation
    captureSnapshot()
    setAnnotations(prev => prev.some(a => a.id === row.id) ? prev.map(a => a.id === row.id ? row : a) : [...prev, row])
    outbox.upsert('room_annotations', [c.theirs])
    resolve(c.id)
  }
  const deleteIt = (c: AnnotationClash) => {
    captureSnapshot()
    setAnnotations(prev => prev.filter(a => a.id !== c.annotation_id))
    outbox.remove('room_annotations', [c.annotation_id])
    resolve(c.id)
  }
  const btn = 'px-2 py-0.5 rounded border border-gray-600 text-gray-200 hover:bg-gray-700 text-[11px]'

  return (
    <div data-clash-panel className="absolute right-2 top-2 z-50 w-[340px] max-h-[60vh] overflow-y-auto rounded-lg border border-amber-500/60 bg-gray-900 shadow-2xl text-xs">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
        <span className="font-semibold text-amber-300">⚠ {list.length} to check</span>
        <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-white" aria-label="Close">✕</button>
      </div>
      <p className="px-3 pt-2 text-gray-500">Items changed by two people at once. The last change was kept. Check each one and pick which version stays.</p>
      {list.map(c => {
        const live = annotations.find(a => a.id === c.annotation_id)
        return (
          <div key={c.id} data-clash={c.kind} className="px-3 py-2 border-t border-gray-800 first-of-type:border-t-0">
            <div className="text-gray-200">{itemName(c, live)}</div>
            <div className="text-gray-400 mt-0.5">{WHAT[c.kind]?.(c)}</div>
            <div className="text-gray-600 mt-0.5">{new Date(c.created_at).toLocaleString()}</div>
            <div className="flex gap-1.5 mt-1.5">
              {live && <button className={btn} onClick={() => select([live.id])}>Show</button>}
              {c.kind === 'changed' && c.theirs && <button className={btn} data-clash-action="theirs" onClick={() => useTheirs(c)}>Use theirs</button>}
              {c.kind === 'restored' && live && <button className={btn} data-clash-action="delete" onClick={() => deleteIt(c)}>Delete it</button>}
              <button className={btn} data-clash-action="ok" onClick={() => resolve(c.id)}>
                {c.kind === 'lost' ? 'OK' : c.kind === 'changed' && c.my_op === 'delete' ? 'Keep deleted' : 'Keep mine'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
