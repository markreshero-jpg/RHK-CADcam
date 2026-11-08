// ============================================================
// AI0 check (z_ai_helper): server-side bulk edit + Undo on a real room, run as
// the automation account. Skipped unless AI0_RUN is set — it writes to the DB.
//
//   AI0_RUN='{"room":"<room id>","filter":{"classes":["wall"]},"changes":{"dy":900}}' \
//     npx vitest run src/lib/ai/__tests__/headlessAi0.test.ts --silent=false
//
// Prints the room summary, applies the change, checks the saved parts moved,
// undoes it and checks every cabinet is back exactly as it was.
// Use a test / sample room — never a customer job.
// ============================================================

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

interface Cfg { room: string; filter: Record<string, unknown>; changes: Record<string, unknown> }
const CFG: Cfg | null = process.env.AI0_RUN ? JSON.parse(process.env.AI0_RUN) : null

describe.skipIf(!CFG)('AI0 server bulk edit + undo', () => {
  it('applies by filter and undoes exactly', async () => {
    const cfg = CFG!
    const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('='))
      .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
    const { createClient } = await import('@supabase/supabase-js')
    const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
    const { error } = await client.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
    if (error) throw error

    const { withSupabase } = await import('../server/scope')
    const { loadRoomSummary } = await import('../roomSummary')
    const { updateCabinets, undoBatch } = await import('../server/cabinetBatch')

    const snapshot = async () => {
      const { data } = await client.from('cabinet_instances').select('id, label, dx, dy, dz, pos_x, pos_y, pos_z, left_neighbour_type, right_neighbour_type, notes').eq('room_id', cfg.room).order('label')
      return data ?? []
    }
    const partsOf = async (ids: string[]) => {
      const { data } = await client.from('case_parts').select('cabinet_instance_id, part_key, dx, dy').in('cabinet_instance_id', ids).order('part_key')
      return JSON.stringify(data)
    }

    await withSupabase(client, async () => {
      const summary = await loadRoomSummary(cfg.room)
      console.log(`\n── Summary (${summary.length} chars ≈ ${Math.round(summary.length / 4)} tokens) ──\n${summary}\n`)

      const before = await snapshot()
      const t0 = Date.now()
      const res = await updateCabinets({ roomId: cfg.room, filter: cfg.filter, changes: cfg.changes, description: 'AI0 test', source: 'script' })
      console.log(`── Applied in ${Date.now() - t0} ms ──`, JSON.stringify(res, null, 2))
      expect(res.batchId).toBeTruthy()
      expect(res.errors).toEqual([])

      const changedIds = before.filter(b => res.changed.some(l => l.startsWith(`${b.label}:`))).map(b => b.id)
      const partsAfter = await partsOf(changedIds)

      const t1 = Date.now()
      const undo = await undoBatch(res.batchId!)
      console.log(`── Undone in ${Date.now() - t1} ms ──`, JSON.stringify(undo, null, 2))
      expect(undo.warnings).toEqual([])

      const restored = await snapshot()
      expect(restored).toEqual(before)
      expect(await partsOf(changedIds)).not.toEqual(partsAfter)   // parts re-resolved back
    })
  }, 180_000)
})
