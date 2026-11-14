'use client'
// Rooms on this device (z_offline/OFFLINE-SPEC.md, step 2). The service worker shows this
// when a page can't load with no signal. Lists every room copy kept here, by job.

import { useEffect, useState } from 'react'
import { listRoomSnapshots, deleteRoomSnapshot, type RoomSnapshot } from '@/src/lib/offline/roomCache'
import { useOutboxStatus } from '@/src/lib/offline/outbox'

type Meta = Omit<RoomSnapshot, 'data'>

export default function OfflinePage() {
  const [rooms, setRooms] = useState<Meta[] | null>(null)
  const [online, setOnline] = useState(true)
  const pending = useOutboxStatus(s => s.pending)

  useEffect(() => {
    void listRoomSnapshots().then(setRooms)
    const set = () => setOnline(navigator.onLine)
    set()
    window.addEventListener('online', set); window.addEventListener('offline', set)
    return () => { window.removeEventListener('online', set); window.removeEventListener('offline', set) }
  }, [])

  const jobs = new Map<string, Meta[]>()
  for (const r of rooms ?? []) jobs.set(r.projectName || 'Job', [...(jobs.get(r.projectName || 'Job') ?? []), r])
  const when = (t: number) => new Date(t).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

  return (
    <div className="min-h-dvh bg-gray-950 text-gray-200 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-xl font-semibold text-white">Rooms on this device</h1>
          <span className={`text-xs px-2 py-0.5 rounded-full ${online ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
            {online ? 'Online' : 'No signal'}
          </span>
          {/* Plain links on purpose: full page loads, so the service worker can step in. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          {online && <a href="/" className="ml-auto text-sm text-blue-400 hover:text-blue-300">Go to jobs →</a>}
        </div>
        <p className="text-sm text-gray-400 mb-6">
          These open with no signal. A room is kept here when you open it, or when you use Take offline on its job.
          {pending > 0 && <> <span className="text-amber-300">{pending} change{pending === 1 ? '' : 's'} waiting to send.</span></>}
        </p>
        {rooms === null && <div className="text-gray-500 text-sm">Loading…</div>}
        {rooms?.length === 0 && <div className="text-gray-500 text-sm">No rooms saved on this device yet. Open a job with signal and use Take offline.</div>}
        {[...jobs.entries()].map(([job, list]) => (
          <div key={job} className="mb-5">
            <div className="text-sm font-semibold text-gray-300 mb-1.5">{job}</div>
            <div className="rounded-lg border border-gray-800 divide-y divide-gray-800">
              {list.map(r => (
                <div key={r.roomId} className="flex items-center gap-3 px-3 py-2">
                  {/* /canvas/… opens live with signal; with none the service worker opens this copy. */}
                  <a data-offline-room={r.roomId} href={online ? `/canvas/${r.roomId}` : `/offline/canvas?room=${r.roomId}`} className="text-blue-300 hover:text-blue-200">{r.roomName}</a>
                  <span className="text-xs text-gray-500">saved {when(r.savedAt)}</span>
                  <button className="ml-auto text-xs text-gray-500 hover:text-red-300"
                    onClick={() => { void deleteRoomSnapshot(r.roomId).then(() => setRooms(prev => prev?.filter(x => x.roomId !== r.roomId) ?? null)) }}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
