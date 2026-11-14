'use client'
// Save status for the offline queue (z_offline/OFFLINE-SPEC.md, step 1):
// Saved / Saving… / Offline — n waiting / n couldn't save. Click = try again now.

import { useEffect } from 'react'
import { useOutboxStatus, outbox } from '@/src/lib/offline/outbox'
import { useClashes } from '@/src/lib/offline/clashes'

export default function SaveStatusBadge({ compact }: { compact?: boolean }) {
  const { state, pending, lastError } = useOutboxStatus()
  const clashes = useClashes(s => s.list.length)
  const clashOpen = useClashes(s => s.open)
  const setClashOpen = useClashes(s => s.setOpen)

  // Waiting changes are kept on this device, but with no signal a reload can't load the
  // page again (until step 2) — so warn before leaving.
  useEffect(() => {
    if (!pending) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [pending])

  const n = `${pending} change${pending === 1 ? '' : 's'}`
  const look = {
    saved:   { dot: 'bg-emerald-500', text: 'text-gray-500', label: 'Saved', title: 'All changes saved to the server' },
    saving:  { dot: 'bg-blue-400 animate-pulse', text: 'text-gray-400', label: 'Saving…', title: `${n} being sent` },
    offline: { dot: 'bg-amber-400', text: 'text-amber-300', label: compact ? `Offline · ${pending}` : `Offline — ${n} waiting`,
               title: `No connection. ${n} kept on this device; they send by themselves when signal comes back. Click to try now.` },
    error:   { dot: 'bg-red-500', text: 'text-red-300', label: compact ? `Not saved · ${pending}` : `${n} not saved`,
               title: `The server refused ${n} (kept on this device, retrying): ${lastError ?? ''}. Click to try now.` },
  }[state]

  return (
    <>
      {clashes > 0 && (
        // Step 1b: items two people changed at once — opens the clash list.
        <button type="button" onClick={() => setClashOpen(!clashOpen)} data-clash-count={clashes} data-tour={compact ? undefined : 'clash-check'}
          title="Items someone else changed while you had changes waiting. Click to check them."
          className={`flex items-center gap-1 px-2.5 whitespace-nowrap text-amber-300 hover:bg-gray-800 ${clashOpen ? 'bg-gray-800' : ''}`}>
          ⚠ {compact ? clashes : `${clashes} to check`}
        </button>
      )}
      <button type="button" onClick={() => void outbox.flushNow()} title={look.title} data-save-state={state} data-tour={compact ? undefined : 'save-status'}
        className={`flex items-center gap-1.5 px-3 whitespace-nowrap ${look.text} hover:bg-gray-800`}>
        <span className={`w-2 h-2 rounded-full ${look.dot}`} />
        {look.label}
      </button>
    </>
  )
}
