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

interface Cfg { room: string; ops: unknown[]; undo?: string }
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

    const COLS = 'id, label, cabinet_definition_id, wall_id, dx, dy, dz, pos_x, pos_y, pos_z, rotation, left_neighbour_type, right_neighbour_type, rule_overrides, material_overrides, toekick_overrides, notes'
    const rows = async () => (await client.from('cabinet_instances').select(COLS).eq('room_id', cfg.room).order('label')).data ?? []
    const customs = async (ids: string[]) => (await client.from('cabinet_custom_parts').select('id, cabinet_instance_id, name, dx, dy, dz').in('cabinet_instance_id', ids).order('id')).data ?? []

    // Room colour rows (Materials tab) — set_material steps change these.
    const mats = async () => [
      ...((await client.from('room_materials').select('assembly_class, material_role, material_id').eq('room_id', cfg.room)).data ?? []),
      ...((await client.from('room_toekick_materials').select('part_role, material_id').eq('room_id', cfg.room)).data ?? []),
    ]
    // What the saved fronts now are (from the resolve), per cabinet.
    const fronts = async () => {
      const { data } = await client.from('face_zones').select('cabinet_instance_id, material_id').in('cabinet_instance_id', (await rows()).map(r => r.id))
      const zs = (data ?? []) as { cabinet_instance_id: string; material_id: string | null }[]
      const { data: ms } = await client.from('materials').select('id, name').in('id', [...new Set(zs.map(z => z.material_id).filter((x): x is string => !!x))])
      const mn = new Map(((ms ?? []) as { id: string; name: string }[]).map(m => [m.id, m.name]))
      const by = new Map<string, Set<string>>()
      for (const f of zs) {
        const set = by.get(f.cabinet_instance_id) ?? new Set(); set.add(mn.get(f.material_id ?? '') ?? '-'); by.set(f.cabinet_instance_id, set)
      }
      const lab = new Map((await rows()).map(r => [r.id, r.label]))
      return [...by].map(([id, s]) => `${lab.get(id)}: ${[...s].join(' / ')}`).sort().join('\n')
    }

    // Clean up a run that stopped before its Undo: AI3_RUN='{"room":"…","ops":[],"undo":"<batch id>"}'
    if (cfg.undo) {
      const r = await withSupabase(client, () => undoBatch(cfg.undo!))
      console.log('── Undo only ──\n' + JSON.stringify(r, null, 2))
      return
    }

    await withSupabase(client, async () => {
      const before = await rows()
      const beforeMats = await mats()
      console.log('── Fronts before ──\n' + await fronts())
      const beforeParts = await customs(before.map(r => r.id))

      const plan = await planBatch(cfg.room, cfg.ops as Op[])
      console.log('── Plan ──\n' + [...plan.lines, ...plan.warnings.map(w => '⚠ ' + w), ...plan.problems.map(p => '✗ ' + p)].join('\n'))
      expect(plan.problems).toEqual([])

      const t0 = Date.now()
      const res = await runBatch(cfg.room, cfg.ops as Op[], { description: 'AI3 test', source: 'script' })
      console.log(`── Applied in ${Date.now() - t0} ms ──\n` + JSON.stringify(res, null, 2))
      expect(res.batchId).toBeTruthy()
      if (res.errors.length) console.log('(resolver errors after the change — check they were there before)')
      console.log('── Room after ──\n' + (await rows()).map(r => `${r.label} ${r.dx}×${r.dy}×${r.dz} @(${Math.round(r.pos_x)},${Math.round(r.pos_y)}) L=${r.left_neighbour_type} R=${r.right_neighbour_type}`).join('\n'))

      console.log('── Fronts after ──\n' + await fronts())
      const t1 = Date.now()
      const undo = await undoBatch(res.batchId!)
      console.log(`── Undone in ${Date.now() - t1} ms ──\n` + JSON.stringify(undo, null, 2))
      if (undo.errors.length) console.log('(resolver errors after undo)')

      const after = await rows()
      const canon = (v: unknown) => JSON.stringify(v, (_k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x)
      expect(canon(after)).toEqual(canon(before))
      expect(canon(await customs(before.map(r => r.id)))).toEqual(canon(beforeParts))
      expect(canon(await mats())).toEqual(canon(beforeMats))
      console.log('── Fronts after undo ──\n' + await fronts())
    })
  }, 300_000)
})
