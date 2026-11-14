import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
// Spec block + SITE NOTES clear of the 4 dim rows on the east side (outer face 5704 + 1200)
const rows = (await sb.from('room_annotations').select('*').eq('room_id', 'dfa682a3-020b-4704-8661-3dbbd6cdf224').eq('view', 'plan').eq('kind', 'text')).data
for (const r of rows.filter(r => /^(SPECIFICATIONS|SITE NOTES)/.test(r.text) && !r.user_edited_at)) {
  const e = await sb.from('room_annotations').update({ geom: { ...r.geom, at: { ...r.geom.at, x: 6904 } } }).eq('id', r.id); console.log(r.text.slice(0, 12), e.error?.message ?? 'moved')
}
