// RHK6468 pre-nest fixes (Mark 2026-11-16): grain match every Kitchen drawer bank (one vertical group per stack);
// applied panels: back edge untaped (side orientation, edge_left = back / wall edge).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const P = '21601535-e1c8-4087-96b8-bb2506b96c3d', KIT = '58bac32f-cdca-4a86-a1a4-c29af7ef9430'
const BANKS = ['BC-11', 'BC-13', 'BC-15', 'BC-19', 'BC-21', 'BC-23', 'BC-32', 'BC-41', 'BC-43', 'BC-46', 'BC-48', 'BC-50', 'TC-06']
const groups = chk('g', await sb.from('grain_match_groups').select('id,name').eq('room_id', KIT))
let n = groups.reduce((m, g) => Math.max(m, Number(g.name.replace(/\D/g, '')) || 0), 0)
const cabs = chk('c', await sb.from('cabinet_instances').select('id,label,grain_match_group_id').eq('room_id', KIT).in('label', BANKS))
for (const l of BANKS) {
  const c = cabs.find(c => c.label === l); if (!c) throw new Error('missing ' + l)
  if (c.grain_match_group_id) { console.log(l, 'already grouped'); continue }
  const g = chk('gi', await sb.from('grain_match_groups').insert({ room_id: KIT, name: `GM${++n}`, direction: 'vertical' }).select('id,name').single())
  chk('cu', await sb.from('cabinet_instances').update({ grain_match_group_id: g.id }).eq('id', c.id))
  console.log(l, '->', g.name)
}
const rooms = chk('r', await sb.from('rooms').select('id,name').eq('project_id', P))
const allCabs = chk('ac', await sb.from('cabinet_instances').select('id,label,room_id').in('room_id', rooms.map(r => r.id)))
const parts = chk('p', await sb.from('cabinet_custom_parts').select('id,name,orientation,cabinet_instance_id,edge_left').in('cabinet_instance_id', allCabs.map(c => c.id)).eq('name', 'Applied Panel').eq('orientation', 'side').eq('edge_left', true))
for (const p of parts) {
  chk('e', await sb.from('cabinet_custom_parts').update({ edge_left: false }).eq('id', p.id))
  const c = allCabs.find(c => c.id === p.cabinet_instance_id)
  console.log('back edge off:', rooms.find(r => r.id === c.room_id).name, c.label)
}
console.log('applied panels', parts.length)
