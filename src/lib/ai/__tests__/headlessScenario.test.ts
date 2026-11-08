// ============================================================
// Chat scenario check (z_ai_helper): build a room (batch steps), ask the chat a
// request as the user would, apply its proposal / change, print the room before
// and after, optionally undo. Skipped unless SCENARIO_RUN is set — it writes to the
// DB and calls the real model. Use a test room only.
//
//   SCENARIO_RUN='{"room":"<id>","build":[…ops],"ask":"…","selected":["WC-01"],"apply":true,"undo":true}' \
//     npx vitest run src/lib/ai/__tests__/headlessScenario.test.ts --silent=false --reporter=verbose
// ============================================================

import { describe, it } from 'vitest'
import { readFileSync } from 'node:fs'

interface Cfg { room: string; build?: unknown[]; ask: string; selected?: string[]; apply?: boolean; undo?: boolean }
const CFG: Cfg | null = process.env.SCENARIO_RUN ? JSON.parse(process.env.SCENARIO_RUN) : null

describe.skipIf(!CFG)('chat scenario', () => {
  it('runs', async () => {
    const cfg = CFG!
    const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('='))
      .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
    process.env.ANTHROPIC_API_KEY ??= env.ANTHROPIC_API_KEY
    const { createClient } = await import('@supabase/supabase-js')
    const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
    const { error } = await client.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
    if (error) throw error
    const { withSupabase, withSupabaseRead } = await import('../server/scope')
    const { runBatch, undoBatch } = await import('../server/cabinetBatch')
    const { runChatTurn } = await import('../server/chat')
    const { loadRoomSummary } = await import('../roomSummary')
    type Op = import('../server/cabinetBatch').BatchOp
    const summary = () => withSupabaseRead(client, () => loadRoomSummary(cfg.room))
    const brief = (s: string) => s.split('\n').filter(l => /^(Ceiling|WC|BC|TC)/.test(l)).join('\n')

    if (cfg.build?.length) {
      const b = await withSupabase(client, () => runBatch(cfg.room, cfg.build as Op[], { description: 'scenario build', source: 'script' }))
      console.log('── Built ──', JSON.stringify({ changed: b.changed, warnings: b.warnings }, null, 1))
    }
    console.log('── Before ──\n' + brief(await summary()))

    const { data: room } = await client.from('rooms').select('project_id').eq('id', cfg.room).single()
    let selectedIds: string[] | undefined
    if (cfg.selected?.length) {
      const { data } = await client.from('cabinet_instances').select('id, label').eq('room_id', cfg.room).in('label', cfg.selected)
      selectedIds = (data ?? []).map(c => c.id as string)
    }
    const r = await withSupabaseRead(client, () => runChatTurn({ client, projectId: room!.project_id, roomId: cfg.room, message: cfg.ask, selectedIds }))
    console.log(`── Asked (${r.model}, ${(r.ms / 1000).toFixed(1)} s, $${r.costUsd.toFixed(4)}) ──\nQ: ${cfg.ask}\nA: ${r.reply}`)
    if (r.question) console.log('   options:', r.question.options.join(' / '))
    if (r.proposal) console.log('   proposal:\n   ' + r.proposal.lines.join('\n   '))
    if (r.changed) console.log('   applied:\n   ' + r.changed.join('\n   '))

    let batchId = r.batchId ?? null
    if (cfg.apply && r.proposal) {
      const res = await withSupabase(client, () => runBatch(cfg.room, r.proposal!.ops, { description: r.proposal!.description, onlyIds: r.proposal!.onlyIds }))
      if (res.batchId && r.messageId) await client.from('ai_messages').update({ proposal_status: 'applied', batch_id: res.batchId, changed: res.changed }).eq('id', r.messageId)
      batchId = res.batchId
      console.log('── Applied ──\n' + res.changed.join('\n') + (res.warnings.length ? `\nwarnings: ${res.warnings.join(' | ')}` : ''))
    }
    console.log('── After ──\n' + brief(await summary()))
    if (cfg.undo && batchId) {
      const u = await withSupabase(client, () => undoBatch(batchId!))
      if (r.messageId) await client.from('ai_messages').update({ undone_at: new Date().toISOString() }).eq('id', r.messageId)
      console.log('── Undone ──\n' + u.changed.join('\n') + '\n' + brief(await summary()))
    }
  }, 600_000)
})
