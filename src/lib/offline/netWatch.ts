// Watches the Supabase client's requests (z_offline/OFFLINE-SPEC.md, step 2):
//  - how many are in flight (Take offline waits for a room to finish loading), and
//  - writes that failed for want of signal and are NOT in the offline queue (cabinets,
//    walls, fixtures… — step 3). Those used to fail silently; now the save light says so.

import { create } from 'zustand'

/** Tables the offline queue saves itself (it retries them, so they're not "lost"). */
const QUEUED_TABLES = ['room_annotations', 'annotation_clashes']

let inflight = 0
let lastActivity = Date.now()
export const netInflight = () => inflight
export const netIdleFor = () => (inflight ? 0 : Date.now() - lastActivity)

export const useNetWatch = create<{ unsaved: number; lastUnsaved: string | null }>(() => ({ unsaved: 0, lastUnsaved: null }))

function describe(input: RequestInfo | URL): string {
  try { return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url } catch { return '' }
}

export const watchedFetch: typeof fetch = async (input, init) => {
  inflight++; lastActivity = Date.now()
  try {
    return await fetch(input, init)
  } catch (e) {
    const url = describe(input)
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const write = method !== 'GET' && method !== 'HEAD' && /\/(rest|storage)\/v1\//.test(url)
    const table = url.match(/\/rest\/v1\/([a-z0-9_]+)/)?.[1] ?? ''
    if (write && !QUEUED_TABLES.includes(table) && typeof window !== 'undefined') {
      const what = table.startsWith('rpc') ? url.match(/rpc\/([a-z0-9_]+)/)?.[1] ?? 'save' : table
      useNetWatch.setState(s => ({ unsaved: s.unsaved + 1, lastUnsaved: what }))
    }
    throw e
  } finally {
    inflight--; lastActivity = Date.now()
  }
}
