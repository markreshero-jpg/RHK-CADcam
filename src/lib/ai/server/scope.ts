// Server-side runner for the AI helper (z_ai_helper AI0). Runs app code that
// imports '@/src/lib/supabase' — the resolver, save paths — with a given client,
// so every read and write is made as the signed-in user (RLS applies). Never
// pass a service-role client here.

import { AsyncLocalStorage } from 'node:async_hooks'
import type { SupabaseClient } from '@supabase/supabase-js'
import { invalidateResolverCaches } from '@/src/lib/resolver/resolveCabinetFromDB'

type Store = AsyncLocalStorage<SupabaseClient | undefined>
const g = globalThis as { __rhkSupabaseScope?: Store }
const store: Store = g.__rhkSupabaseScope ?? (g.__rhkSupabaseScope = new AsyncLocalStorage())

// The resolver keeps module-level caches (cabinet inputs, cascades). On the
// server they'd outlive the request and could be stale or another user's, so
// runs go one at a time and each starts with empty caches.
let queue: Promise<unknown> = Promise.resolve()

/** Reads only (no resolver, no saves): runs as the user without queueing. */
export function withSupabaseRead<T>(client: SupabaseClient, fn: () => Promise<T>): Promise<T> {
  return store.run(client, fn)
}

export function withSupabase<T>(client: SupabaseClient, fn: () => Promise<T>): Promise<T> {
  const run = queue.catch(() => {}).then(() => store.run(client, async () => {
    invalidateResolverCaches()
    try { return await fn() } finally { invalidateResolverCaches() }
  }))
  queue = run
  return run
}
