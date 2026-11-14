// Pure merge rules for the offline save queue (z_offline/OFFLINE-SPEC.md, step 1).
// One entry per row: later changes to the same row fold into the waiting one, so
// the queue holds at most one write per row however long the connection is down.

export type OutboxTable = 'room_annotations'

export type OutboxOp =
  | { op: 'upsert'; row: Record<string, unknown> & { id: string } }
  | { op: 'patch'; patch: Record<string, unknown> }
  | { op: 'delete' }

export interface OutboxEntry {
  key: string          // `${table}:${id}`
  table: OutboxTable
  id: string
  roomId: string | null
  /** Bumped on every change — a flush only clears the entry if it hasn't moved on. */
  seq: number
  queuedAt: number
  item: OutboxOp
}

export const entryKey = (table: OutboxTable, id: string) => `${table}:${id}`

/** Fold a new change into what is already waiting for that row. */
export function mergeOp(prev: OutboxOp | undefined, next: OutboxOp): OutboxOp | null {
  if (!prev) return next
  if (next.op === 'delete') return next
  if (next.op === 'upsert') return next
  // next is a patch
  if (prev.op === 'delete') return prev                       // edits to a deleted row: drop
  if (prev.op === 'upsert') return { op: 'upsert', row: { ...prev.row, ...next.patch } }
  return { op: 'patch', patch: { ...prev.patch, ...next.patch } }
}

/** Lay the waiting changes over rows loaded from the server (for one room). */
export function applyPending<T extends { id: string; room_id?: string | null }>(
  rows: T[], entries: OutboxEntry[], table: OutboxTable, roomId: string,
): T[] {
  const mine = entries.filter(e => e.table === table)
  if (!mine.length) return rows
  const byId = new Map(mine.map(e => [e.id, e]))
  const out: T[] = []
  for (const r of rows) {
    const e = byId.get(r.id)
    if (!e) { out.push(r); continue }
    byId.delete(r.id)
    if (e.item.op === 'delete') continue
    if (e.item.op === 'upsert') out.push(e.item.row as unknown as T)
    else out.push({ ...r, ...e.item.patch })
  }
  // Rows added offline that the server hasn't got yet.
  for (const e of byId.values()) {
    if (e.item.op === 'upsert' && (e.item.row.room_id ?? e.roomId) === roomId) out.push(e.item.row as unknown as T)
  }
  return out
}

/** supabase-js returns status 0 when fetch itself failed (no signal, DNS, timeout). */
export function isNetworkFailure(res: { status?: number; error?: { message?: string } | null }): boolean {
  if (res.status === 0) return true
  const m = res.error?.message ?? ''
  return /Failed to fetch|NetworkError|FetchError|Load failed|network/i.test(m)
}
