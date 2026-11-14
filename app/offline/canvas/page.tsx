'use client'
// Offline canvas (z_offline/OFFLINE-SPEC.md, step 2). A static page the service worker
// keeps on the device: when /canvas/<room> can't load (no signal), it sends you here
// with ?room=<id>, and the room opens from this device's copy.

import { useEffect, useState } from 'react'
import CanvasClient from '@/app/canvas/[roomId]/CanvasClient'
import { getRoomSnapshot, type RoomSnapshot } from '@/src/lib/offline/roomCache'

export default function OfflineCanvasPage() {
  const [state, setState] = useState<{ snap: RoomSnapshot | null; roomId: string } | null>(null)

  useEffect(() => {
    const roomId = new URLSearchParams(window.location.search).get('room') ?? ''
    void getRoomSnapshot(roomId).then(snap => setState({ snap: snap ?? null, roomId }))
  }, [])

  if (!state) return <div className="h-dvh bg-gray-950 text-gray-400 flex items-center justify-center text-sm">Opening the copy on this device…</div>

  if (!state.snap) {
    return (
      <div className="h-dvh bg-gray-950 text-gray-300 flex flex-col items-center justify-center gap-3 text-sm px-6 text-center">
        <div className="text-lg text-white">This room isn&apos;t on this device</div>
        <p className="max-w-md text-gray-400">
          With no signal, only rooms opened on this device before (or saved with Take offline on the job) can be opened.
        </p>
        <div className="flex gap-2">
          <a href="/offline" className="px-3 py-1.5 rounded border border-gray-600 hover:bg-gray-800">Rooms on this device</a>
          {state.roomId && <a href={`/canvas/${state.roomId}`} className="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-500">Try again</a>}
        </div>
      </div>
    )
  }

  const d = state.snap.data
  return (
    <CanvasClient
      project={d.project}
      room={d.room}
      walls={d.walls}
      initialCabinets={d.cabinets}
      initialBenchtops={d.benchtops}
      initialFixtures={d.fixtures}
      initialAnnotations={d.annotations}
      initialCadLayers={d.cadLayers}
      offlineCopy={{ savedAt: state.snap.savedAt }}
    />
  )
}
