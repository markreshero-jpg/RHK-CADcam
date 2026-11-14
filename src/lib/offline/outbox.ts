// Offline save queue (z_offline/OFFLINE-SPEC.md, step 1).
//
// Every CAD / markup write goes here first: it is kept on this device (IndexedDB)
// straight away, then sent to Supabase. If the send fails (no signal) it stays
// queued and retries on its own — when the browser says it's back online, when the
// tab comes back to the front, and on a backing-off timer. Nothing is dropped:
// a change only leaves the queue once the server has accepted it.

import { create } from 'zustand'
import { supabase } from '@/src/lib/supabase'
import {
  entryKey, isNetworkFailure, mergeOp, applyPending as applyPendingPure, checkClash, CLASH_CHECKED,
  type OutboxEntry, type OutboxOp, type OutboxTable, type ClashFound,
} from './outboxCore'
import { idbPut as idbPutRaw, idbDelete as idbDeleteRaw, idbAll, idbClear } from './idb'

export type SaveState = 'saved' | 'saving' | 'offline' | 'error'

interface OutboxStatus {
  state: SaveState
  pending: number
  lastError: string | null
  lastSavedAt: number | null
}

export const useOutboxStatus = create<OutboxStatus>(() => ({
  state: 'saved', pending: 0, lastError: null, lastSavedAt: null,
}))

// ── IndexedDB (falls back to memory only if the browser won't give us one) ──

const idbPut = (e: OutboxEntry) => idbPutRaw('outbox', e)
const idbDelete = (key: string) => idbDeleteRaw('outbox', key)

// ── Queue ──

const queue = new Map<string, OutboxEntry>()
// Step 1b: each row's server updated_at as this device last saw it (load or own save).
const known = new Map<string, string>()
// The full row as on screen, to put back an item someone else deleted (see checkClash).
const lookups = new Map<OutboxTable, (id: string) => Record<string, unknown> | undefined>()
export type ClashRow = Record<string, unknown> & { id: string; annotation_id: string; kind: string }
const clashListeners = new Set<(rows: ClashRow[]) => void>()
let seqCounter = 0
let ready: Promise<void> | null = null

function publish(patch: Partial<OutboxStatus> = {}) {
  const pending = queue.size
  const cur = useOutboxStatus.getState()
  let state = patch.state ?? cur.state
  if (pending === 0 && !patch.state) state = 'saved'
  useOutboxStatus.setState({ ...patch, state, pending })
}

/** Load anything left over from an earlier visit and start sending it. */
export function initOutbox(): Promise<void> {
  if (ready) return ready
  ready = (async () => {
    if (typeof window === 'undefined') return
    const saved = await idbAll<OutboxEntry>('outbox')
    for (const e of saved) {
      // Something queued this session (before the load finished) is newer — keep it.
      if (!queue.has(e.key)) queue.set(e.key, e)
      seqCounter = Math.max(seqCounter, e.seq)
    }
    window.addEventListener('online', () => { backoff = 0; void flush() })
    window.addEventListener('offline', () => publish({ state: 'offline' }))
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void flush() })
    publish(queue.size ? { state: navigator.onLine ? 'saving' : 'offline' } : {})
    void flush()
  })()
  return ready
}

function enqueue(table: OutboxTable, id: string, roomId: string | null, op: OutboxOp) {
  const key = entryKey(table, id)
  const prev = queue.get(key)
  const item = mergeOp(prev?.item, op)
  if (!item) return
  const e: OutboxEntry = {
    key, table, id, roomId: roomId ?? prev?.roomId ?? null,
    seq: ++seqCounter, queuedAt: prev?.queuedAt ?? Date.now(), item,
    // The version this device was looking at when it first changed the row.
    base: prev ? prev.base : CLASH_CHECKED.has(table) ? known.get(key) : undefined,
  }
  queue.set(key, e)
  void idbPut(e)
  publish({ state: navigator.onLine === false ? 'offline' : 'saving' })
  scheduleFlush(150)
}

// Public write API — what the canvas calls instead of supabase directly.
export const outbox = {
  upsert(table: OutboxTable, rows: (Record<string, unknown> & { id: string; room_id?: unknown })[]) {
    void initOutbox()
    for (const r of rows) enqueue(table, r.id, (r.room_id as string) ?? null, { op: 'upsert', row: { ...r } })
  },
  patch(table: OutboxTable, id: string, patch: Record<string, unknown>) {
    void initOutbox()
    enqueue(table, id, null, { op: 'patch', patch: { ...patch } })
  },
  remove(table: OutboxTable, ids: string[]) {
    void initOutbox()
    for (const id of ids) enqueue(table, id, null, { op: 'delete' })
  },
  /** Resolves once everything queued so far has reached the server (or a send fails). */
  flushNow: () => flush(),
  /** Sign out: drop everything waiting (it must never send under another login). */
  async discardAll() {
    queue.clear(); known.clear()
    await idbClear('outbox')
    publish({ state: 'saved' })
  },
  /** Step 1b: remember the server versions of rows just loaded (the clash check's baseline). */
  track(table: OutboxTable, rows: { id: string; updated_at?: string | null }[]) {
    for (const r of rows) if (r.updated_at) known.set(entryKey(table, r.id), r.updated_at)
  },
  /** The server updated_at this device last saw for a row (room copies keep it, so the
   *  offline canvas checks clashes against the right version — step 2). */
  knownStamp(table: OutboxTable, id: string): string | undefined { return known.get(entryKey(table, id)) },
  /** The full row as on screen (lets a change to an item someone else deleted put it back). */
  setLookup(table: OutboxTable, fn: ((id: string) => Record<string, unknown> | undefined) | null) {
    if (fn) lookups.set(table, fn); else lookups.delete(table)
  },
  /** Called with each batch of clash records written to annotation_clashes. */
  onClashes(fn: (rows: ClashRow[]) => void) { clashListeners.add(fn); return () => { clashListeners.delete(fn) } },
}

/** Waiting changes laid over rows just loaded from the server. */
export function applyPending<T extends { id: string; room_id?: string | null }>(
  rows: T[], table: OutboxTable, roomId: string,
): T[] {
  return applyPendingPure(rows, [...queue.values()], table, roomId)
}

// ── Sending ──

let flushing: Promise<void> | null = null
let again = false
let timer: ReturnType<typeof setTimeout> | null = null
let backoff = 0   // ms; 0 = no failures yet

function scheduleFlush(ms: number) {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { timer = null; void flush() }, ms)
}

/** Sent and accepted. stamps = the rows' new server updated_at (step 1b baseline). */
function done(e: OutboxEntry, stamps?: Map<string, string>) {
  const stamp = stamps?.get(e.id)
  if (e.item.op === 'delete') known.delete(e.key)
  else if (stamp) known.set(e.key, stamp)
  const cur = queue.get(e.key)
  if (!cur) return
  if (cur.seq === e.seq) { queue.delete(e.key); void idbDelete(e.key); return }
  // Changed again while this was in flight: the next send builds on what was just saved.
  if (cur.base === e.base) {
    const next = { ...cur, base: e.item.op === 'delete' ? undefined : stamp ?? cur.base }
    queue.set(e.key, next); void idbPut(next)
  }
}

type Res = { status?: number; error?: { message?: string } | null; data?: unknown }

function stampsOf(res: Res): Map<string, string> {
  const m = new Map<string, string>()
  for (const r of (Array.isArray(res.data) ? res.data : []) as { id: string; updated_at?: string }[]) if (r.updated_at) m.set(r.id, r.updated_at)
  return m
}

async function send(table: OutboxTable, entries: OutboxEntry[]): Promise<Res> {
  const first = entries[0].item
  const cols = CLASH_CHECKED.has(table) ? 'id, updated_at' : 'id'
  if (first.op === 'upsert') {
    // defaultToNull false: a row missing a column keeps the column's default.
    return supabase.from(table).upsert(entries.map(e => (e.item as { row: Record<string, unknown> }).row), { onConflict: 'id', defaultToNull: false }).select(cols)
  }
  if (first.op === 'delete') return supabase.from(table).delete().in('id', entries.map(e => e.id))
  return supabase.from(table).update((first as { patch: Record<string, unknown> }).patch).eq('id', entries[0].id).select(cols)
}

/** Step 1b: before sending, check the rows this device changed against the server.
 *  Clashes are written to annotation_clashes; the queued change still goes in (last
 *  change wins). Returns false if the connection dropped. */
async function checkClashes(snapshot: OutboxEntry[]): Promise<boolean> {
  const toCheck = snapshot.filter(e => e.base !== undefined && CLASH_CHECKED.has(e.table))
  if (!toCheck.length) return true
  const res = await supabase.from('room_annotations').select('*').in('id', toCheck.map(e => e.id))
  if (isNetworkFailure(res)) return false
  if (res.error) { console.error('[outbox] clash check failed', res.error); return true }   // don't hold up saving
  const server = new Map(((res.data ?? []) as (Record<string, unknown> & { id: string; updated_at?: string })[]).map(r => [r.id, r]))
  const found: { e: OutboxEntry; c: ClashFound }[] = []
  for (const e of toCheck) {
    const c = checkClash(e, server.get(e.id), lookups.get(e.table)?.(e.id))
    if (c) found.push({ e, c })
  }
  const rows = found.map(({ e, c }) => ({
    room_id: e.roomId ?? (c.theirs?.room_id as string | undefined) ?? (c.mine.room_id as string | undefined),
    annotation_id: e.id, kind: c.kind, my_op: e.item.op, theirs: c.theirs, mine: c.mine, their_updated_at: c.theirUpdatedAt,
  })).filter(r => r.room_id)
  if (rows.length) {
    const ins = await supabase.from('annotation_clashes').insert(rows).select('*')
    if (isNetworkFailure(ins)) return false
    if (ins.error) console.error('[outbox] clash log failed', ins.error)
    else if (ins.data?.length) for (const fn of clashListeners) fn(ins.data as ClashRow[])
  }
  // Checked: don't check (or log) these again on a retry.
  const clashed = new Map(found.map(f => [f.e.key, f.c]))
  for (const e of toCheck) {
    const cur = queue.get(e.key)
    if (!cur || cur.seq !== e.seq) continue
    const c = clashed.get(e.key)
    if (c && c.send === null) { queue.delete(e.key); void idbDelete(e.key); continue }   // nothing left to apply
    const next: OutboxEntry = { ...cur, base: undefined, item: c?.send ?? cur.item }
    queue.set(e.key, next); void idbPut(next)
  }
  return true
}

async function flush(): Promise<void> {
  if (flushing) { again = true; return flushing }
  flushing = (async () => {
    do {
      again = false
      if (!queue.size) { publish({ state: 'saved' }); break }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) { publish({ state: 'offline' }); retryLater(); break }
      publish({ state: 'saving' })
      if (!await checkClashes([...queue.values()])) { publish({ state: 'offline' }); retryLater(); break }
      const snapshot = [...queue.values()]
      // Batches: all upserts per table together, all deletes together, patches one by one.
      const groups: OutboxEntry[][] = []
      for (const t of new Set(snapshot.map(e => e.table))) {
        const ups = snapshot.filter(e => e.table === t && e.item.op === 'upsert')
        const dels = snapshot.filter(e => e.table === t && e.item.op === 'delete')
        if (ups.length) groups.push(ups)
        if (dels.length) groups.push(dels)
        for (const p of snapshot.filter(e => e.table === t && e.item.op === 'patch')) groups.push([p])
      }
      let offline = false
      let error: string | null = null
      for (const g of groups) {
        let res = await send(g[0].table, g)
        if (isNetworkFailure(res)) { offline = true; break }
        if (res.error && g.length > 1) {
          // One bad row shouldn't hold up the rest — send them singly.
          for (const e of g) {
            res = await send(e.table, [e])
            if (isNetworkFailure(res)) { offline = true; break }
            if (res.error) { error = res.error.message ?? 'Save rejected'; console.error('[outbox] rejected', e, res.error) }
            else done(e, stampsOf(res))
          }
          if (offline) break
          continue
        }
        if (res.error) { error = res.error.message ?? 'Save rejected'; console.error('[outbox] rejected', g, res.error); continue }
        const stamps = stampsOf(res)
        g.forEach(e => done(e, stamps))
      }
      if (offline) { publish({ state: 'offline' }); retryLater(); break }
      if (error) { publish({ state: 'error', lastError: error }); retryLater(); break }
      backoff = 0
      publish({ state: queue.size ? 'saving' : 'saved', lastError: null, lastSavedAt: Date.now() })
    } while (again)
    if (queue.size && !timer) scheduleFlush(150)
  })()
  try { await flushing } finally { flushing = null }
}

function retryLater() {
  backoff = Math.min(backoff ? backoff * 2 : 2000, 60000)
  scheduleFlush(backoff)
}
