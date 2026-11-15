// RHK6478 Laundry (Mark 2026-11-16): talls run 2 shorter (wall 1822 - TC-09 filler 30 -> 28, run slides 2);
// ceiling = Kitchen 2685 (Friday CH), shadowlines 18 -> 28 => cabinet top line 2679 -> 2657 (all tops drop 22,
// overhead / upper-pair / tower-top undersides stay put).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'fc12bc7d-53ee-46ee-a302-3411f5129bcc', CH = 2685, SL = 28, TOP = CH - SL, D = 2679 - TOP
const chk = (w, r) => { if (r.error) { console.log('ERR', w, r.error.message); process.exit(1) } else console.log('ok', w) }
const { data: cabs } = await sb.from('cabinet_instances').select('id,label,dx,dy,pos_x,notes').eq('room_id', R)
const L = Object.fromEntries(cabs.map(c => [c.label, c]))
const upd = async (lab, patch) => chk(lab + ' ' + JSON.stringify(patch).slice(0, 80), await sb.from('cabinet_instances').update(patch).eq('id', L[lab].id))
const cp = async (lab, patch) => chk(lab + ' cp', await sb.from('cabinet_custom_parts').update(patch).eq('cabinet_instance_id', L[lab].id))
// room + walls
chk('room', await sb.from('rooms').update({ room_dy: CH, wall_cabinet_top: TOP }).eq('id', R))
chk('walls', await sb.from('walls').update({ height: CH }).eq('room_id', R).eq('height', 2697))
// talls run -2
await upd('TC-09', { dx: 28, notes: '# 20 28 filler to Nib 1 (talls recess 1822, Friday 13.11 - Mark 2026-11-16)' }); await cp('TC-09', { dx: 28 })
for (const l of ['TC-08', 'WC-08', 'TC-07', 'WC-07', 'TC-06']) await upd(l, { pos_x: Number(L[l].pos_x) - 2 })
for (const l of ['KICK 1', 'WC-11']) await upd(l, { pos_x: Number(L[l].pos_x) - 2, dx: Number(L[l].dx) - 2 })
// shadowlines 28
for (const l of ['WC-09', 'WC-10', 'WC-11']) await upd(l, { dy: SL, notes: L[l].notes.replace(/^18 /, '28 ').replace('2679-2697', `${TOP}-${CH}`) })
// tops down 22
for (const l of ['TC-01', 'TC-02', 'TC-05', 'TC-09', 'TC-06', 'TC-04', 'WC-02', 'WC-03', 'WC-04', 'WC-05', 'WC-07', 'WC-08']) {
  const dy = Number(L[l].dy) - D
  await upd(l, { dy, notes: (L[l].notes ?? '').replace('2020-2679', `2020-${TOP}`) })
}
for (const l of ['TC-01', 'TC-02', 'TC-05', 'TC-09', 'TC-06', 'WC-05']) {
  const { data: ps } = await sb.from('cabinet_custom_parts').select('id,dy').eq('cabinet_instance_id', L[l].id)
  for (const p of ps) chk(l + ' part dy', await sb.from('cabinet_custom_parts').update({ dy: Number(p.dy) - D }).eq('id', p.id))
}
process.exit(0)
