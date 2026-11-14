'use client'
// Shown on the canvas when it was opened from this device's copy (z_offline step 2).

import { useEffect, useState } from 'react'

export default function OfflineCopyBanner({ roomId, savedAt }: { roomId: string; savedAt: number }) {
  const [online, setOnline] = useState(false)
  useEffect(() => {
    const set = () => setOnline(navigator.onLine)
    set()
    window.addEventListener('online', set); window.addEventListener('offline', set)
    return () => { window.removeEventListener('online', set); window.removeEventListener('offline', set) }
  }, [])
  const when = new Date(savedAt).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  return (
    <div data-offline-copy className="flex-none flex items-center gap-3 px-3 py-1 bg-amber-500/15 border-b border-amber-500/40 text-amber-200 text-xs">
      <span className="font-semibold">Offline copy</span>
      <span className="text-amber-200/80 truncate">
        Saved on this device {when}. CAD and markups save when signal comes back; cabinet, wall and fixture changes need signal.
      </span>
      <span className="ml-auto flex gap-2 shrink-0">
        <a href="/offline" className="px-2 py-0.5 rounded border border-amber-500/50 hover:bg-amber-500/20">Rooms on this device</a>
        {online && (
          <a href={`/canvas/${roomId}`} className="px-2 py-0.5 rounded bg-amber-500 text-gray-900 font-semibold hover:bg-amber-400">
            Back online: open live
          </a>
        )}
      </span>
    </div>
  )
}
