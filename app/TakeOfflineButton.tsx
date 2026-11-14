'use client'
// Take offline (z_offline/OFFLINE-SPEC.md, step 2): opens each room of the job in a hidden
// frame, one at a time. The canvas saves its copy on this device, and the service worker
// keeps every read it made, so the rooms then open with no signal.

import { useEffect, useState } from 'react'
import type { Room } from '@/src/lib/types'
import { listRoomSnapshots } from '@/src/lib/offline/roomCache'

const WARM_DONE = 'rhk-warm-done'   // = useRoomSnapshot's message
const ROOM_TIMEOUT = 75000

type Status = { kind: 'idle' } | { kind: 'running'; done: number; total: number; name: string } | { kind: 'done'; ok: number; total: number } | { kind: 'error'; msg: string }

function warmRoom(roomId: string): Promise<boolean> {
  return new Promise(resolve => {
    const frame = document.createElement('iframe')
    frame.src = `/canvas/${roomId}?warm=1`
    frame.setAttribute('aria-hidden', 'true')
    frame.tabIndex = -1
    // Real size (the canvas lays out to it) but off screen.
    Object.assign(frame.style, { position: 'fixed', left: '-20000px', top: '0', width: '1400px', height: '900px', opacity: '0', pointerEvents: 'none', border: '0' })
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      window.removeEventListener('message', onMsg); clearTimeout(t); frame.remove(); resolve(ok)
    }
    const onMsg = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data?.type === WARM_DONE && e.data.roomId === roomId) finish(!!e.data.ok)
    }
    const t = setTimeout(() => finish(false), ROOM_TIMEOUT)
    window.addEventListener('message', onMsg)
    document.body.appendChild(frame)
  })
}

export default function TakeOfflineButton({ projectId, rooms }: { projectId: string; rooms: Room[] }) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [have, setHave] = useState<{ n: number; at: number } | null>(null)

  const refresh = () => void listRoomSnapshots().then(all => {
    const mine = all.filter(r => r.projectId === projectId)
    setHave(mine.length ? { n: mine.length, at: Math.min(...mine.map(r => r.savedAt)) } : null)
  })
  useEffect(refresh, [projectId])

  async function run() {
    if (status.kind === 'running' || !rooms.length) return
    if (!navigator.onLine) { setStatus({ kind: 'error', msg: 'Needs signal' }); return }
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
    if (!reg) { setStatus({ kind: 'error', msg: 'Offline support isn’t switched on in this browser' }); return }
    await navigator.serviceWorker.ready
    let ok = 0
    for (let i = 0; i < rooms.length; i++) {
      setStatus({ kind: 'running', done: i, total: rooms.length, name: rooms[i].name })
      if (await warmRoom(rooms[i].id)) ok++
    }
    reg.active?.postMessage('refresh-shell!')
    setStatus({ kind: 'done', ok, total: rooms.length })
    refresh()
  }

  const when = (t: number) => new Date(t).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  const label = status.kind === 'running' ? `Saving ${status.done + 1}/${status.total}: ${status.name}…`
    : status.kind === 'done' ? (status.ok === status.total ? `On this device: ${status.ok} room${status.ok === 1 ? '' : 's'}` : `${status.ok} of ${status.total} saved, try again`)
    : status.kind === 'error' ? status.msg
    : have ? `Offline: ${have.n} room${have.n === 1 ? '' : 's'}` : 'Take offline'
  const title = status.kind === 'running' ? 'Opening each room in the background to keep a copy on this device'
    : have ? `Rooms kept on this device for no-signal use (oldest copy ${when(have.at)}). Click to update them all now.`
    : 'Keep a copy of every room on this device, so they open on site with no signal'

  return (
    <button onClick={run} disabled={status.kind === 'running'} title={title} data-take-offline={status.kind}
      className={`flex-none flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors hover:bg-surface-2 disabled:opacity-80 ${
        status.kind === 'error' ? 'text-red-400' : have || status.kind === 'done' ? 'text-emerald-500' : 'text-ink-subtle hover:text-ink'}`}>
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M3 13h10" />
      </svg>
      <span className="whitespace-nowrap">{label}</span>
    </button>
  )
}
