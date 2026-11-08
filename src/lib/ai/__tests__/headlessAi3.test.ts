// ============================================================
// AI3 check (z_ai_helper): a several-step batch — delete, move, place — on a real
// room, then Undo, as the automation account. Skipped unless AI3_RUN is set — it
// writes to the DB. Use a test / sample room only.
//
//   AI3_RUN='{"room":"<room id>","ops":[{"op":"delete","labels":["WC-02"]}, …]}' \
//     npx vitest run src/lib/ai/__tests__/headlessAi3.test.ts --silent=false --reporter=verbose
//
// Checks: the preview lines match what ran; after Undo every original cabinet row
// (and its custom parts) is back exactly, same ids, and nothing added is left.
// ============================================================

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

interface Cfg { room: string; ops: unknown[] }
const CFG: Cfg | null = process.env.AI3_RUN ? JSON.parse(process.env.AI3_RUN) : null

describe.skipIf(!CFG)('AI3 delete / move / place + undo', () => {
  it('applies a multi-step batch and undoes it exactly', async () => {
    const cfg = CFG!
    const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('='))
      .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
    const { createClient } = await import('@supabase/supabase-js')
    const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
    const { error } = await client.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
    if (error) throw error
    const { withSupabase } = await import('../server/scope')
    const { planBatch, runBatch, undoBatch } = await import('../server/cabinetBatch')
    type Op = import('../server/cabinetBatch').BatchOp

    const COLS = 'id, label, cabinet_definition_id, wall_id, dx, dy, dz, pos_x, pos_y, pos_z, rotation, left_neighbour_type, right_neighbour_type, rule_overrides, notes'
    const rows = async () => (await client.from('cabinet_instances').select(COLS).eq('room_id', cfg.room).order('label')).data ?? []
    const customs = async (ids: string[]) => (await client.from('cabinet_custom_parts').select('id, cabinet_instance_id, name, dx, dy, dz').in('cabinet_instance_id', ids).order('id')).data ?? []

    await withSupabase(client, async () => {
      const before = await rows()
      const beforeParts = await customs(before.map(r => r.id))

      const plan = await planBatch(cfg.room, cfg.ops as Op[])
      console.log('── Plan ──\n' + [...plan.lines, ...plan.warnings.map(w => '⚠ ' + w), ...plan.problems.map(p => '✗ ' + p)].join('\n'))
      expect(plan.problems).toEqual([])

      const t0 = Date.now()
      const res = await runBatch(cfg.room, cfg.ops as Op[], { description: 'AI3 test', source: 'script' })
      console.log(`── Applied in ${Date.now() - t0} ms ──\n` + JSON.stringify(res, null, 2))
      expect(res.batchId).toBeTruthy()
      expect(res.errors).toEqual([])
      console.log('── Room after ──\n' + (await rows()).map(r => `${r.label} ${r.dx}×${r.dy}×${r.dz} @(${Math.round(r.pos_x)},${Math.round(r.pos_y)}) L=${r.left_neighbour_type} R=${r.right_neighbour_type}`).join('\n'))

      const t1 = Date.now()
      const undo = await undoBatch(res.batchId!)
      console.log(`── Undone in ${Date.now() - t1} ms ──\n` + JSON.stringify(undo, null, 2))
      expect(undo.errors).toEqual([])

      const after = await rows()
      const canon = (v: unknown) => JSON.stringify(v, (_k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x)
      expect(canon(after)).toEqual(canon(before))
      expect(canon(await customs(before.map(r => r.id)))).toEqual(canon(beforeParts))
    })
  }, 300_000)
})
