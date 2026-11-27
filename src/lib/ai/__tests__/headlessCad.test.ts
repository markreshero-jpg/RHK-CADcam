// ============================================================
// CAD picture check (z_ai_helper Q9): render a room's CAD the way the AI sees it.
// Skipped unless CAD_RUN is set. Reads only.
//
//   CAD_RUN='{"room":"<id>","out":"<dir>","view":"plan"}' (or "wall":"Wall 1")
//     npx vitest run src/lib/ai/__tests__/headlessCad.test.ts --silent=false
// ============================================================

import { describe, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'

const CFG: { room: string; out: string; wall?: string } | null = process.env.CAD_RUN ? JSON.parse(process.env.CAD_RUN) : null

describe.skipIf(!CFG)('cad picture', () => {
  it('renders', async () => {
    const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('='))
      .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
    const { createClient } = await import('@supabase/supabase-js')
    const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
    const { error } = await client.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
    if (error) throw error
    const { withSupabaseRead } = await import('../server/scope')
    const { loadCadPicture, cadViews } = await import('../server/cadPicture')
    const cfg = CFG!
    const r = await withSupabaseRead(client, () => loadCadPicture(cfg.room, cfg.wall ? { view: 'elevation', wall: cfg.wall } : { view: 'plan' }))
    console.log(await withSupabaseRead(client, () => cadViews(cfg.room)))
    console.log(r.text)
    if (r.png) { writeFileSync(cfg.out, Buffer.from(r.png, 'base64')); console.log('wrote', cfg.out, Math.round(r.png.length * 0.75 / 1024), 'KB') }
  }, 120000)
})
