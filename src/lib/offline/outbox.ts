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
  entryKey, isNetworkFailure, mergeOp, applyPending as applyPendingPure,
  type OutboxEntry, type OutboxOp, type OutboxTable,
} from './outboxCore'

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

const DB_NAME = 'rhk-offline'
const STORE = 'outbox'
let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'key' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => { console.error('[outbox] IndexedDB open failed', req.error); resolve(null) }
      req.onblocked = () => resolve(null)
    } catch (e) { console.error('[outbox] IndexedDB unavailable', e); resolve(null) }
  })
  return dbPromise
}

async function idbPut(e: OutboxEntry) {
  const db = await openDb(); if (!db) return
  await new Promise<void>(res => {
    const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(e)
    tx.oncomplete = () => res(); tx.onerror = () => { console.error('[outbox] save failed', tx.error); res() }
  })
}

async function idbDelete(key: string) {
  const db = await openDb(); if (!db) return
  await new Promise<void>(res => {
    const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(key)
    tx.oncomplete = () => res(); tx.onerror = () => res()
  })
}

async function idbAll(): Promise<OutboxEntry[]> {
  const db = await openDb(); if (!db) return []
  return new Promise(res => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
    req.onsuccess = () => res((req.result ?? []) as OutboxEntry[])
    req.onerror = () => res([])
  })
}

// ── Queue ──

const queue = new Map<string, OutboxEntry>()
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
    const saved = await idbAll()
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

function done(e: OutboxEntry) {
  const cur = queue.get(e.key)
  if (cur && cur.seq === e.seq) { queue.delete(e.key); void idbDelete(e.key) }
}

type Res = { status?: number; error?: { message?: string } | null }

async function send(table: OutboxTable, entries: OutboxEntry[]): Promise<Res> {
  const first = entries[0].item
  if (first.op === 'upsert') {
    // defaultToNull false: a row missing a column keeps the column's default.
    return supabase.from(table).upsert(entries.map(e => (e.item as { row: Record<string, unknown> }).row), { onConflict: 'id', defaultToNull: false })
  }
  if (first.op === 'delete') return supabase.from(table).delete().in('id', entries.map(e => e.id))
  return supabase.from(table).update((first as { patch: Record<string, unknown> }).patch).eq('id', entries[0].id)
}

async function flush(): Promise<void> {
  if (flushing) { again = true; return flushing }
  flushing = (async () => {
    do {
      again = false
      if (!queue.size) { publish({ state: 'saved' }); break }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) { publish({ state: 'offline' }); retryLater(); break }
      publish({ state: 'saving' })
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
            else done(e)
          }
          if (offline) break
          continue
        }
        if (res.error) { error = res.error.message ?? 'Save rejected'; console.error('[outbox] rejected', g, res.error); continue }
        g.forEach(done)
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
