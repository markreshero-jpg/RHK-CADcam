'use client'
// Take offline (z_offline/OFFLINE-SPEC.md, step 2): opens each room of the job in a hidden
// frame, one at a time. The canvas saves its copy on this device, and the service worker
// keeps every read it made, so the rooms then open with no signal.

import { useEffect, useState } from 'react'
import type { Room } from '@/src/lib/types'
import { listRoomSnapshots, deleteRoomSnapshot } from '@/src/lib/offline/roomCache'

const WARM_DONE = 'rhk-warm-done'   // = useRoomSnapshot's message
const CHANGED = 'rhk-offline-rooms-changed'
const ROOM_TIMEOUT = 75000

type Status = { kind: 'idle' } | { kind: 'running'; done: number; total: number; name: string } | { kind: 'done'; ok: number; total: number; missed: string[] } | { kind: 'error'; msg: string }

/** Opens the room in a hidden frame until it has saved its copy. null = saved, else why not. */
function warmRoom(roomId: string): Promise<string | null> {
  return new Promise(resolve => {
    const frame = document.createElement('iframe')
    frame.src = `/canvas/${roomId}?warm=1`
    frame.setAttribute('aria-hidden', 'true')
    frame.tabIndex = -1
    // Real size (the canvas lays out to it) but off screen.
    Object.assign(frame.style, { position: 'fixed', left: '-20000px', top: '0', width: '1400px', height: '900px', opacity: '0', pointerEvents: 'none', border: '0' })
    let settled = false
    const finish = (why: string | null) => {
      if (settled) return
      settled = true
      window.removeEventListener('message', onMsg); clearTimeout(t); frame.remove(); resolve(why)
    }
    const onMsg = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data?.type === WARM_DONE && e.data.roomId === roomId) finish(e.data.ok ? null : 'couldn’t write the copy on this device')
    }
    const t = setTimeout(() => {
      // Say how far it got: the room page may not have loaded at all.
      let where = ''
      try { where = frame.contentWindow?.location.pathname ?? '' } catch { /* other origin = login redirect */ }
      finish(`took over ${ROOM_TIMEOUT / 1000}s${where && !where.startsWith('/canvas/') ? ` (ended up on ${where})` : ''}`)
    }, ROOM_TIMEOUT)
    window.addEventListener('message', onMsg)
    document.body.appendChild(frame)
  })
}

/** Takes room copies off this device. Only the copy: the live room is untouched, and any
 *  changes still waiting to send stay in the queue. */
export async function removeOfflineRooms(roomIds: string[]) {
  await Promise.all(roomIds.map(id => deleteRoomSnapshot(id)))
  window.dispatchEvent(new Event(CHANGED))
}

/** Rooms of this job kept on this device: room id -> when the copy was saved. */
export function useOfflineRooms(projectId: string): Map<string, number> {
  const [have, setHave] = useState<Map<string, number>>(new Map())
  useEffect(() => {
    const load = () => void listRoomSnapshots().then(all =>
      setHave(new Map(all.filter(r => r.projectId === projectId).map(r => [r.roomId, r.savedAt]))))
    load()
    window.addEventListener(CHANGED, load); window.addEventListener('focus', load)
    return () => { window.removeEventListener(CHANGED, load); window.removeEventListener('focus', load) }
  }, [projectId])
  return have
}

export default function TakeOfflineButton({ rooms, saved }: { rooms: Room[]; saved: Map<string, number> }) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const mine = rooms.filter(r => saved.has(r.id))
  const have = mine.length ? { n: mine.length, at: Math.min(...mine.map(r => saved.get(r.id)!)) } : null
  const refresh = () => window.dispatchEvent(new Event(CHANGED))

  async function run() {
    if (status.kind === 'running' || !rooms.length) return
    if (!navigator.onLine) { setStatus({ kind: 'error', msg: 'Needs signal' }); return }
    if (!('serviceWorker' in navigator)) { setStatus({ kind: 'error', msg: 'This browser can’t keep rooms offline' }); return }
    let on = process.env.NODE_ENV === 'production'
    try { if (localStorage.getItem('rhk.sw') === '1') on = true } catch { /* private window */ }
    if (!on) { setStatus({ kind: 'error', msg: 'Offline only works on the live site' }); return }
    // The page may not have finished setting up offline support yet (first visit after a
    // deploy): set it up now rather than failing.
    setStatus({ kind: 'running', done: 0, total: rooms.length, name: 'setting up' })
    let reg = await navigator.serviceWorker.getRegistration()
    try {
      if (!reg) reg = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      reg = await Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, no) => setTimeout(() => no(new Error('timeout')), 30000))])
    } catch (e) {
      console.error('[offline] take offline', e)
      setStatus({ kind: 'error', msg: 'Couldn’t switch on offline support, reload and try again' }); return
    }
    // Every room once, then up to two more goes at any that didn't save.
    let todo = rooms
    for (let round = 0; round < 3 && todo.length; round++) {
      const missed: Room[] = []
      for (let i = 0; i < todo.length; i++) {
        setStatus({ kind: 'running', done: rooms.length - todo.length + i, total: rooms.length, name: round ? `${todo[i].name} (again)` : todo[i].name })
        const why = await warmRoom(todo[i].id)
        if (why) { missed.push(todo[i]); console.warn(`[offline] Take offline: ${todo[i].name} not saved: ${why}`) }
      }
      todo = missed
    }
    reg.active?.postMessage('refresh-shell!')
    setStatus({ kind: 'done', ok: rooms.length - todo.length, total: rooms.length, missed: todo.map(r => r.name) })
    refresh()
  }

  const when = (t: number) => new Date(t).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  const label = status.kind === 'running' ? `Saving ${status.done + 1}/${status.total}: ${status.name}…`
    : status.kind === 'done' ? (status.ok === status.total ? `On this device: ${status.ok} room${status.ok === 1 ? '' : 's'}` : `${status.ok} of ${status.total} saved, ${status.missed.join(', ')} didn’t: try again`)
    : status.kind === 'error' ? status.msg
    : have ? (have.n < rooms.length ? `Offline: ${have.n} of ${rooms.length} rooms` : `Offline: all ${have.n} room${have.n === 1 ? '' : 's'}`) : 'Take offline'
  const missing = rooms.filter(r => !saved.has(r.id)).map(r => r.name)
  const title = status.kind === 'running' ? 'Opening each room in the background to keep a copy on this device'
    : have ? `${have.n} of ${rooms.length} rooms kept on this device for no-signal use (oldest copy ${when(have.at)}).${missing.length ? ` Not on this device: ${missing.join(', ')}.` : ''} Click to save them all now.`
    : 'Keep a copy of every room on this device, so they open on site with no signal'

  return (
    <>
    <button onClick={run} disabled={status.kind === 'running'} title={title} data-take-offline={status.kind}
      className={`min-w-0 flex items-center gap-1.5 text-xs max-sm:text-sm px-2 py-2 sm:py-1 rounded max-sm:[&_svg]:size-4 transition-colors hover:bg-surface-2 disabled:opacity-80 ${
        status.kind === 'error' || (status.kind === 'done' && status.ok < status.total) ? 'text-red-400'
        : have && have.n < rooms.length && status.kind !== 'running' ? 'text-amber-500'
        : have || status.kind === 'done' ? 'text-emerald-500' : 'text-ink-subtle max-sm:text-ink-muted hover:text-ink'}`}>
      <svg className="flex-none" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M3 13h10" />
      </svg>
      <span className="whitespace-nowrap truncate">{label}</span>
    </button>
    {have && status.kind !== 'running' && (
      <button data-take-offline-remove onClick={() => { setStatus({ kind: 'idle' }); void removeOfflineRooms(mine.map(r => r.id)) }}
        title="Take this job’s rooms off this device (only the copies: the live rooms aren’t touched). A room you open is kept again."
        className="flex-none -ml-1 text-ink-subtle hover:text-red-400 px-1 py-1 rounded hover:bg-surface-2 transition-colors text-xs leading-none">
        ✕
      </button>
    )}
    </>
  )
}
