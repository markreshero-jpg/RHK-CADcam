// RHK6478 Kitchen appliance block rev 1 (Mark 2026-11-05): no "drawn as" detail in the fixture names; FRIDGE / FREEZER / MICROWAVE sections.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = 'dd6c9440-6664-4e87-8ea9-4d88b7a9b1b6'
const fx = chk('fx', await sb.from('room_fixtures').select('id,name').eq('room_id', R))
for (const f of fx) {
  const name = f.name.replace(/\s*\((drawn as|generic)[^)]*\)/gi, '').replace(/\s+/g, ' ').trim()
  if (name !== f.name) { chk('name', await sb.from('room_fixtures').update({ name }).eq('id', f.id)); console.log(f.name, '->', name) }
}
const ap = chk('ap', await sb.from('room_annotations').select('id,text').eq('room_id', R).eq('view', 'plan').contains('style', { block: 'Appliance spec block' }).single())
const text = ap.text.replace(/\n\nOTHER APPLIANCES\n[\s\S]*$/, '\n\nFRIDGE\nLiebherr IRBH5120 integrated fridge - niche 1772-1788\n\nFREEZER\nLiebherr SIFNH5128 integrated freezer - niche 1772-1788\n\nMICROWAVE\n{appliances_other}')
chk('upd', await sb.from('room_annotations').update({ text }).eq('id', ap.id))
console.log(text)
