import { describe, it, expect } from 'vitest'
import { mergeOp, applyPending, isNetworkFailure, type OutboxEntry, type OutboxOp } from '../outboxCore'

const row = (id: string, extra: Record<string, unknown> = {}) => ({ id, room_id: 'R1', text: 'a', ...extra })
const entry = (id: string, item: OutboxOp, roomId: string | null = 'R1'): OutboxEntry =>
  ({ key: `room_annotations:${id}`, table: 'room_annotations', id, roomId, seq: 1, queuedAt: 0, item })

describe('mergeOp', () => {
  it('folds a patch into a waiting insert', () => {
    expect(mergeOp({ op: 'upsert', row: row('1') }, { op: 'patch', patch: { text: 'b' } }))
      .toEqual({ op: 'upsert', row: row('1', { text: 'b' }) })
  })
  it('merges patches, later wins', () => {
    expect(mergeOp({ op: 'patch', patch: { text: 'b', geom: 1 } }, { op: 'patch', patch: { text: 'c' } }))
      .toEqual({ op: 'patch', patch: { text: 'c', geom: 1 } })
  })
  it('delete wins over anything waiting', () => {
    expect(mergeOp({ op: 'upsert', row: row('1') }, { op: 'delete' })).toEqual({ op: 'delete' })
  })
  it('a patch after a delete is dropped', () => {
    expect(mergeOp({ op: 'delete' }, { op: 'patch', patch: { text: 'x' } })).toEqual({ op: 'delete' })
  })
  it('undo of a delete (upsert) replaces the delete', () => {
    expect(mergeOp({ op: 'delete' }, { op: 'upsert', row: row('1') })).toEqual({ op: 'upsert', row: row('1') })
  })
})

describe('applyPending', () => {
  const loaded = [row('1'), row('2'), row('3')]
  it('applies patches, deletes and offline adds for this room only', () => {
    const out = applyPending(loaded, [
      entry('1', { op: 'patch', patch: { text: 'edited' } }),
      entry('2', { op: 'delete' }),
      entry('9', { op: 'upsert', row: row('9') }),
      entry('8', { op: 'upsert', row: row('8', { room_id: 'OTHER' }) }, 'OTHER'),
    ], 'room_annotations', 'R1')
    expect(out.map(r => [r.id, r.text])).toEqual([['1', 'edited'], ['3', 'a'], ['9', 'a']])
  })
  it('returns rows untouched with nothing queued', () => {
    expect(applyPending(loaded, [], 'room_annotations', 'R1')).toBe(loaded)
  })
})

describe('isNetworkFailure', () => {
  it('status 0 / fetch errors are network', () => {
    expect(isNetworkFailure({ status: 0, error: { message: 'x' } })).toBe(true)
    expect(isNetworkFailure({ status: 500, error: { message: 'TypeError: Failed to fetch' } })).toBe(true)
  })
  it('a server refusal is not', () => {
    expect(isNetworkFailure({ status: 403, error: { message: 'new row violates row-level security policy' } })).toBe(false)
  })
})
