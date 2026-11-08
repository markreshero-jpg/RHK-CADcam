// ============================================================
// AI4 check (z_ai_helper): draw a room from a plan file on the real model, as the
// automation account. Skipped unless AI4_RUN is set — it calls Opus (tens of cents),
// uploads the file to ai-uploads and logs to ai_messages. Use a test / sample room.
//
//   AI4_RUN='{"room":"<room id>","file":"z_sample_plans/….pdf","message":"","apply":true,"compare":"<room id>"}' \
//     npx vitest run src/lib/ai/__tests__/headlessAi4.test.ts --silent=false --reporter=verbose
//
// apply: run the proposal (Undo is on the message in the app). compare: print
// that room's summary beside the drawn one (e.g. the same plan drawn by hand).
// ============================================================

import { describe, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

interface Cfg { room: string; file: string; message?: string; apply?: boolean; compare?: string; answers?: string }
const CFG: Cfg | null = process.env.AI4_RUN ? JSON.parse(process.env.AI4_RUN) : null

describe.skipIf(!CFG)('AI4 draw from a plan', () => {
  it('reads the plan and (optionally) applies it', async () => {
    const cfg = CFG!
    const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('='))
      .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
    process.env.ANTHROPIC_API_KEY ??= env.ANTHROPIC_API_KEY
    const { createClient } = await import('@supabase/supabase-js')
    const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
    const { error } = await client.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
    if (error) throw error
    const { withSupabase, withSupabaseRead } = await import('../server/scope')
    const { runDrawTurn, DRAW_BUCKET } = await import('../server/draw')
    const { runBatch } = await import('../server/cabinetBatch')
    const { loadRoomSummary } = await import('../roomSummary')

    const { data: room } = await client.from('rooms').select('project_id').eq('id', cfg.room).single()
    const name = basename(cfg.file)
    const path = `${room!.project_id}/${Date.now()}-${name.replace(/[^\w.-]+/g, '_')}`
    const up = await client.storage.from(DRAW_BUCKET).upload(path, readFileSync(cfg.file), { contentType: name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/png' })
    if (up.error) throw up.error

    let ctx = { path, fileName: name, notes: cfg.message ?? '', qa: [] as { q: string; a: string }[] }
    let r = await withSupabaseRead(client, () => runDrawTurn({ projectId: room!.project_id, roomId: cfg.room, ctx }))
    // It asked first: print the questions, answer with cfg.answers, carry on.
    if (r.question) {
      const q = r.question.items?.map((x, i) => `${i + 1}. ${x.text} [${x.options.join(' / ')}]`).join(' ') ?? r.question.text
      console.log(`── Asked (${(r.ms / 1000).toFixed(0)} s, $${r.costUsd.toFixed(3)}) ── ${q} ── Answer: ${cfg.answers ?? '(none, stopping)'}`)
      if (!cfg.answers) return
      ctx = { ...ctx, qa: [{ q, a: cfg.answers }] }
      r = await withSupabaseRead(client, () => runDrawTurn({ projectId: room!.project_id, roomId: cfg.room, ctx }))
    }
    console.log(`── Read in ${(r.ms / 1000).toFixed(0)} s, $${r.costUsd.toFixed(3)}, tools: ${r.toolCalls.join(', ')} ──\n${r.reply}\n\n── Proposal ──\n${r.proposal?.lines.join('\n') ?? '(none)'}`)

    if (cfg.apply && r.proposal) {
      const res = await withSupabase(client, () => runBatch(cfg.room, r.proposal!.ops, { description: r.proposal!.description }))
      if (res.batchId && r.messageId) await client.from('ai_messages').update({ proposal_status: 'applied', batch_id: res.batchId, changed: res.changed }).eq('id', r.messageId)
      console.log(`── Applied (batch ${res.batchId}) ──\nwarnings: ${JSON.stringify(res.warnings)}\nerrors: ${JSON.stringify(res.errors.slice(0, 8))}`)
      console.log('── Drawn room ──\n' + await withSupabaseRead(client, () => loadRoomSummary(cfg.room)))
    }
    if (cfg.compare) console.log('── Compare: ──\n' + await withSupabaseRead(client, () => loadRoomSummary(cfg.compare!)))
  }, 600_000)
})
