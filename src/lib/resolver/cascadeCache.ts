// ── Resolver cascade cache ────────────────────────────────────────────────────
// loadCabinetInput reads two very different kinds of data:
//   • per-cabinet rows (the instance, its overrides, hinge instances, kick run)
//   • the cascade + library behind it (room/job/shop settings, every schedule and
//     its rows, construction methods, door styles, hinge hardware, slides)
// The second kind is identical for every cabinet in a room and changes only when
// the user edits settings or the library — yet it was re-fetched in full on every
// resolve, which is what made a single scribe edit cost ~13 sequential round trips.
//
// This module memoises those shared reads for the session. It caches the PROMISE,
// not the result, so N cabinets resolving at once (the page-load sweep) share one
// in-flight request instead of firing N copies.
//
// Invalidation is explicit: call invalidateResolverCascade() whenever room, job,
// shop or library data is saved, and on canvas mount so returning from a library
// page never reads stale values. A failed load evicts itself so it is retried.

/** Bumped on every invalidation; entries from an older generation are ignored. */
let generation = 0

const store = new Map<string, { gen: number; value: Promise<unknown> }>()

/**
 * Memoise a shared cascade/library read for this session.
 * `key` must capture everything the query depends on.
 */
export function cachedCascade<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key)
  if (hit && hit.gen === generation) return hit.value as Promise<T>

  const gen = generation
  const value = load().catch(err => {
    // Don't cache a failure — drop it so the next resolve retries.
    const cur = store.get(key)
    if (cur && cur.value === value) store.delete(key)
    throw err
  })
  store.set(key, { gen, value })
  return value
}

/**
 * Drop every cached cascade/library read. Call after saving room, job, shop or
 * library data, and when the canvas mounts.
 */
export function invalidateResolverCascade(): void {
  generation++
  store.clear()
}

/** Cached entry count — for tests and the dev automation bridge. */
export function cascadeCacheSize(): number {
  return store.size
}
