// Shop rules + job notes for the AI helper (z_ai_helper AI5). The shop's rules
// (Settings › AI helper → shop_settings.ai_rules) go in every request's system
// prompt after the fixed instructions — prompt-cached, so they cost ~nothing after
// the first message until someone edits them. A job's notes (Job properties →
// projects.ai_notes) go with each question while that job is open.

import { supabase } from '@/src/lib/supabase'

export async function loadAiContext(projectId: string): Promise<{ rules: string; jobNotes: string }> {
  const [{ data: shop }, { data: job }] = await Promise.all([
    supabase.from('shop_settings').select('ai_rules').limit(1).maybeSingle(),
    supabase.from('projects').select('ai_notes').eq('id', projectId).maybeSingle(),
  ])
  return {
    rules: ((shop as { ai_rules?: string | null } | null)?.ai_rules ?? '').trim(),
    jobNotes: ((job as { ai_notes?: string | null } | null)?.ai_notes ?? '').trim(),
  }
}

/** The system blocks: the fixed instructions, then the shop's rules — each a cache breakpoint. */
export function systemBlocks(fixed: string, rules: string) {
  return [
    { type: 'text' as const, text: fixed, cache_control: { type: 'ephemeral' as const } },
    ...(rules ? [{ type: 'text' as const, text: `The shop's rules (Settings › AI helper) — follow them:\n${rules}`, cache_control: { type: 'ephemeral' as const } }] : []),
  ]
}

/** Job notes as they go into a user turn. */
export const jobNotesBlock = (notes: string) => notes ? `\n<job_notes>\n${notes}\n</job_notes>\n` : ''
