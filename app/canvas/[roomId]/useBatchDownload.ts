'use client'
import { useEffect, useRef } from 'react'

/** Give up waiting on a room that never gets ready (a drawing that never measures, a stuck 3D render). */
const READY_TIMEOUT_MS = 90_000
/** One more beat after ready, so the last measured layout is on the page. */
const SETTLE_MS = 300

/**
 * Job Reports, several rooms at once: a drawing report mounted with `onDone`
 * downloads its PDF as soon as `ready`, then calls `onDone` to hand on to the
 * next room — once only, and also when it fails or times out, so the queue
 * never stalls.
 */
export function useBatchDownload(onDone: (() => void) | undefined, ready: boolean, download: () => Promise<void>) {
  const started = useRef(false)
  const latest = useRef({ onDone, download })
  useEffect(() => { latest.current = { onDone, download } })

  useEffect(() => {
    if (!onDone || started.current) return
    const run = () => {
      if (started.current) return
      started.current = true
      void latest.current.download().catch(e => console.error('[batch download]', e)).finally(() => latest.current.onDone?.())
    }
    if (ready) { const t = setTimeout(run, SETTLE_MS); return () => clearTimeout(t) }
    const t = setTimeout(run, READY_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [onDone, ready])
}
