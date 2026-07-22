// In-flight coalescing for keyed, non-idempotent-under-concurrency work.
//
// seamDrillSync / masterSlaveSync regenerate a cabinet's generated part_operations
// with a NON-ATOMIC delete-then-insert. If two runs for the SAME cabinet overlap
// (React StrictMode double-mounts the Part Editor effect; a manual regen races an
// optimise pass), they interleave as delete→delete→insert→insert and every
// generated hole is written twice.
//
// Coalescing collapses concurrent callers for one key onto a single in-flight
// promise, so the delete+insert cycle runs once. The entry is cleared when that
// promise settles, so a LATER (sequential) call re-runs against fresh DB state —
// this only dedupes genuinely-overlapping work, never a subsequent regen after an
// edit.

export function coalesceByKey<T>(
  inFlight: Map<string, Promise<T>>,
  key: string,
  run: () => Promise<T>,
): Promise<T> {
  const existing = inFlight.get(key)
  if (existing) return existing

  // Promise.resolve().then(run) so a synchronous throw in `run` becomes a
  // rejection (and still clears the map) rather than escaping this function.
  const p = Promise.resolve().then(run).finally(() => {
    // Guard against clearing a newer entry for the same key.
    if (inFlight.get(key) === p) inFlight.delete(key)
  })
  inFlight.set(key, p)
  return p
}
