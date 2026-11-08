// ============================================================
// AI1 check (z_ai_helper): ask the chat questions about a real room, as the
// automation account, on the real model. Skipped unless AI1_RUN is set — it
// calls the Anthropic API (costs a little) and logs to ai_messages.
//
//   AI1_RUN='{"room":"<room id>","questions":["Total kick length?","Which cabinets are TBC?"]}' \
//     npx vitest run src/lib/ai/__tests__/headlessAi1.test.ts --silent=false --reporter=verbose
//
// "summaryOnly": ["<room id>", …] = just print those rooms' summary sizes (no API, no log).
// Use a test / sample room for questions — the log rows land on that job.
// ============================================================

import { describe, it } from 'vitest'
import { readFileSync } from 'node:fs'

interface Cfg { room?: string; questions?: string[]; summaryOnly?: string[]; selected?: string[] }
const CFG: Cfg | null = process.env.AI1_RUN ? JSON.parse(process.env.AI1_RUN) : null

describe.skipIf(!CFG)('AI1 chat on a real room', () => {
  it('answers', async () => {
    const cfg = CFG!
    const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('='))
      .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
    process.env.ANTHROPIC_API_KEY ??= env.ANTHROPIC_API_KEY
    const { createClient } = await import('@supabase/supabase-js')
    const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
    const { error } = await client.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
    if (error) throw error
    const { withSupabaseRead } = await import('../server/scope')

    if (cfg.summaryOnly) {
      const { loadRoomSummary } = await import('../roomSummary')
      for (const id of cfg.summaryOnly) {
        const s = await withSupabaseRead(client, () => loadRoomSummary(id))
        console.log(`── ${id}: ${s.split('\n').length} lines, ${s.length} chars ≈ ${Math.round(s.length / 3.5)} tokens ──\n${s}`)
      }
      return
    }

    const { data: room } = await client.from('rooms').select('project_id').eq('id', cfg.room!).single()
    const { runChatTurn } = await import('../server/chat')
    let total = 0
    for (const q of cfg.questions ?? []) {
      const r = await withSupabaseRead(client, () => runChatTurn({ client, projectId: room!.project_id, roomId: cfg.room!, message: q, selectedIds: cfg.selected }))
      total += r.costUsd
      console.log(`\nQ: ${q}\nA: ${r.reply}\n   [${r.ms} ms, $${r.costUsd.toFixed(5)}, tools: ${r.toolCalls.join(', ') || 'none'}]`)
      if (r.question) console.log('   question options:', r.question.options.join(' / '))
      if (r.proposal) console.log('   proposal:', r.proposal.lines)
      if (r.changed) console.log('   applied:', r.changed, 'batch', r.batchId)
    }
    console.log(`\nTotal $${total.toFixed(5)}`)
  }, 300_000)
})
