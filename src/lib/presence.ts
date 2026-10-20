// ── Online presence (z_access_control/ACCESS-CONTROL-SPEC.md, Phase 3) ───────
// Every signed-in tab joins the private Realtime channel `online-users` (RLS
// policies online_presence_* on realtime.messages) and tracks where it is.
// One channel per tab, owned here; PresenceTracker (root layout) starts it and
// reports page changes, usePresence() reads who's online.

import { useSyncExternalStore } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'

export interface PresenceMeta {
  email: string
  path: string
  /** When this tab joined (ISO). */
  online_at: string
}

/** user id → one meta per open tab. */
export type PresenceState = Record<string, PresenceMeta[]>

const TOPIC = 'online-users'

let channel: RealtimeChannel | null = null
let userId: string | null = null
let me: PresenceMeta | null = null
let state: PresenceState = {}
const listeners = new Set<() => void>()

function emitChange() { listeners.forEach(l => l()) }

function stop() {
  if (channel) supabase.removeChannel(channel)
  channel = null
  userId = null
  me = null
  state = {}
  emitChange()
}

async function start(id: string, email: string, path: string) {
  if (userId === id) return     // already joined (or joining) as this user
  stop()
  userId = id
  me = { email, path, online_at: new Date().toISOString() }
  // Private channels authorise with the user's JWT, not the anon key.
  await supabase.realtime.setAuth()
  if (userId !== id) return     // signed out / switched while waiting
  const ch = supabase.channel(TOPIC, { config: { private: true, presence: { key: id } } })
  channel = ch
  ch.on('presence', { event: 'sync' }, () => {
    const raw = ch.presenceState<PresenceMeta>()
    state = Object.fromEntries(Object.entries(raw).map(([k, metas]) =>
      [k, metas.map(({ email, path, online_at }) => ({ email, path, online_at }))]))
    emitChange()
  })
  ch.subscribe(status => {
    if (status === 'SUBSCRIBED' && channel === ch && me) ch.track(me)
  })
}

/** Join / leave with the auth session; call once per tab. */
export function startPresence(getPath: () => string) {
  const sync = (id: string | undefined, email: string | undefined) => {
    if (id) void start(id, email ?? '', getPath())
    else stop()
  }
  supabase.auth.getUser().then(({ data }) => sync(data.user?.id, data.user?.email))
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') stop()
    else if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') sync(session?.user.id, session?.user.email)
    else if (event === 'TOKEN_REFRESHED') void supabase.realtime.setAuth()
  })
  return () => { data.subscription.unsubscribe(); stop() }
}

/** Report this tab's page (on navigation). */
export function setPresencePath(path: string) {
  if (!me || me.path === path) return
  me = { ...me, path }
  channel?.track(me)
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
const EMPTY: PresenceState = {}

/** Live map of who's online (empty until this tab has joined). */
export function usePresence(): PresenceState {
  return useSyncExternalStore(subscribe, () => state, () => EMPTY)
}
