import { createBrowserClient } from '@supabase/ssr'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

const browserClient = createBrowserClient(
  url || 'https://placeholder.supabase.co',
  key || 'placeholder'
)

type Client = typeof browserClient

// Server code (z_ai_helper) runs the resolver / save code as the signed-in user:
// src/lib/ai/server/scope.ts installs a per-request client store here
// (AsyncLocalStorage, set on globalThis so this file stays browser-safe). The
// browser never sets it, so there every call goes to the browser client.
function scopedClient(): Client | undefined {
  return (globalThis as { __rhkSupabaseScope?: { getStore(): Client | undefined } }).__rhkSupabaseScope?.getStore()
}

export const supabase: Client = new Proxy(browserClient, {
  get(target, prop) {
    const client = scopedClient() ?? target
    const value = Reflect.get(client, prop, client)
    return typeof value === 'function' ? value.bind(client) : value
  },
})
