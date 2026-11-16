// RHK6468 WIR rev 4 CAD + notes: Blonde Oak Woodmatt 18 (to be approved by client).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) throw new Error(t + ': ' + r.error.message); return r.data }
const R = 'dfa682a3-020b-4704-8661-3dbbd6cdf224'
const ann = async (id, f) => { const a = chk(id, await sb.from('room_annotations').select('id,text').eq('id', id).single()); chk(id + 'u', await sb.from('room_annotations').update({ text: f(a.text) }).eq('id', id)) }
await ann('bb198e4c-b3b0-4742-895e-8382ea7dba17', t => t.replace('16mm Polytec Classic White Matt (for now)', '18mm Polytec Woodmatt - Blonde Oak (to be approved by client)')
  .replace('open shelving + mirror frame to match', 'open shelving + mirror frame (36 = 2 x 18) to match'))
await ann('5bb84682-7d8a-4a64-bd47-418060e11e49', () => 'TBC: COLOUR - PT WOODMATT BLONDE OAK 18, TO BE APPROVED BY CLIENT')
await ann('cc864d2f-4c5a-404f-93cf-c059f71d8304', () => 'FULL HEIGHT MIRROR BY OTHERS\n36 FRAME (2 x 18) BY RHK')
const notes = { 'BC-01': n => n.replace('16.5 top over', '18 top over'), 'WC-01': () => 'Bench seat top 18 PT Blonde Oak, 382-400', 'WC-02': () => 'Bench top 18 PT Blonde Oak, 1132-1150' }
for (const l of ['BC-04', 'BC-05', 'BC-06', 'BC-07', 'BC-09', 'BC-10']) notes[l] = () => '120 kick, PT Woodmatt Blonde Oak 18'
for (const [l, f] of Object.entries(notes)) {
  const c = chk(l, await sb.from('cabinet_instances').select('id,notes').eq('room_id', R).eq('label', l).single())
  chk(l + 'u', await sb.from('cabinet_instances').update({ notes: f(c.notes ?? '') }).eq('id', c.id))
}
console.log('cad + notes done')
