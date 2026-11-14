'use client'
// Keeps this room's copy on the device up to date (z_offline/OFFLINE-SPEC.md, step 2),
// and runs the "Take offline" warm-up when the canvas is opened in its hidden frame.

import { useEffect, useRef } from 'react'
import { saveRoomSnapshot, type RoomSnapshotData } from '@/src/lib/offline/roomCache'
import { outbox } from '@/src/lib/offline/outbox'
import { netIdleFor } from '@/src/lib/offline/netWatch'

const SAVE_AFTER_MS = 2000
export const WARM_DONE = 'rhk-warm-done'

function withStamps(d: RoomSnapshotData): RoomSnapshotData {
  // The clash baseline is the server version this device last saw, not the row's own field.
  return { ...d, annotations: d.annotations.map(a => ({ ...a, updated_at: outbox.knownStamp('room_annotations', a.id) ?? a.updated_at })) }
}

export function useRoomSnapshot(data: RoomSnapshotData) {
  const latest = useRef(data)
  useEffect(() => { latest.current = data })

  // A moment after each change.
  useEffect(() => {
    const t = setTimeout(() => { void saveRoomSnapshot(withStamps(latest.current)) }, SAVE_AFTER_MS)
    return () => clearTimeout(t)
  }, [data.project, data.room, data.walls, data.cabinets, data.benchtops, data.fixtures, data.annotations, data.cadLayers])

  // Leaving the page: save now.
  useEffect(() => {
    const now = () => { void saveRoomSnapshot(withStamps(latest.current)) }
    window.addEventListener('pagehide', now)
    return () => window.removeEventListener('pagehide', now)
  }, [])

  // Take offline (?warm=1 in a hidden frame): wait until the room has finished loading —
  // every read it makes is then cached by the service worker — save, and tell the job page.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('warm') || window.parent === window) return
    let stop = false
    const started = Date.now()
    void (async () => {
      const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
      await sleep(4000)
      while (!stop && netIdleFor() < 2500 && Date.now() - started < 45000) await sleep(400)
      if (stop) return
      const ok = await saveRoomSnapshot(withStamps(latest.current))
      window.parent.postMessage({ type: WARM_DONE, roomId: latest.current.room.id, ok }, window.location.origin)
    })()
    return () => { stop = true }
  }, [])
}
