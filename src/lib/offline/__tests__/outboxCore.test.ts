import { describe, it, expect } from 'vitest'
import { mergeOp, applyPending, isNetworkFailure, checkClash, type OutboxEntry, type OutboxOp } from '../outboxCore'

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

describe('checkClash (step 1b)', () => {
  const base = '2026-11-14T01:00:00.000000+00:00'
  const later = '2026-11-14T02:00:00.000000+00:00'
  const withBase = (item: OutboxOp): OutboxEntry => ({ ...entry('1', item), base })
  const server = (updated_at: string) => ({ id: '1', room_id: 'R1', text: 'theirs', updated_at })

  it('no base (new row / already checked) = no check', () => {
    expect(checkClash(entry('1', { op: 'patch', patch: { text: 'x' } }), undefined)).toBeNull()
  })
  it('server unchanged since I saw it = no clash', () => {
    expect(checkClash(withBase({ op: 'patch', patch: { text: 'x' } }), server(base))).toBeNull()
  })
  it('someone else changed it = changed, mine still sent, theirs kept', () => {
    const c = checkClash(withBase({ op: 'patch', patch: { text: 'x' } }), server(later))!
    expect(c.kind).toBe('changed')
    expect(c.theirs?.text).toBe('theirs')
    expect(c.send).toEqual({ op: 'patch', patch: { text: 'x' } })
  })
  it('I deleted what they changed = changed (their version kept)', () => {
    const c = checkClash(withBase({ op: 'delete' }), server(later))!
    expect(c.kind).toBe('changed'); expect(c.send).toEqual({ op: 'delete' })
  })
  it('both deleted = no clash', () => {
    expect(checkClash(withBase({ op: 'delete' }), undefined)).toBeNull()
  })
  it('they deleted, I edited, row on screen = restored as a full upsert', () => {
    const c = checkClash(withBase({ op: 'patch', patch: { text: 'mine' } }), undefined, { id: '1', room_id: 'R1', text: 'old', kind: 'text' })!
    expect(c.kind).toBe('restored')
    expect(c.send).toEqual({ op: 'upsert', row: { id: '1', room_id: 'R1', text: 'mine', kind: 'text' } })
  })
  it('they deleted, I edited, nothing on screen = lost, nothing sent', () => {
    const c = checkClash(withBase({ op: 'patch', patch: { text: 'mine' } }), undefined)!
    expect(c.kind).toBe('lost'); expect(c.send).toBeNull()
  })
})
