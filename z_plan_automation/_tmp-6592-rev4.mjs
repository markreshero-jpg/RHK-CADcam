// RHK6592 rev 4 (Mark 2026-10-29): library basin renamed "semi inset", basins centred on the vanity top depth;
// main tall handles 1000 AFF to the handle centre.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const BASIN = 'a23d206f-44db-4848-bf28-d804bf587add', MAIN = '6980f63e-923d-4ea8-ae57-a604eb4fa00e', ENS = '8160a0cd-80aa-42e3-9b00-723db14b0747'
const OLD = 'White Semi Recessed Basin 530x360', NEW = 'White Semi Inset Basin 530x360'
const cat = chk('cat', await sb.from('fixture_catalog').select('notes').eq('id', BASIN).single())
chk('cat upd', await sb.from('fixture_catalog').update({ name: NEW, notes: cat.notes.replace('Semi-inset basin', 'Semi inset basin') }).eq('id', BASIN))
// every placed copy keeps the catalog name; the bathrooms also get the display name + centred y
chk('rows name', await sb.from('room_fixtures').update({ name: NEW }).eq('catalog_id', BASIN).eq('name', OLD))
const TOP_D = 495, D = 360
console.log(chk('rows', await sb.from('room_fixtures').update({ display_name: 'Semi inset basin', y: (TOP_D - D) / 2 }).eq('catalog_id', BASIN).in('room_id', [MAIN, ENS]).select('room_id,x,y')))
for (const room of [MAIN, ENS]) {
  const a = chk('ann', await sb.from('room_annotations').select('id,text').eq('room_id', room).eq('kind', 'text'))
  for (const r of a) chk('ann upd', await sb.from('room_annotations').update({ text: r.text.replace('Semi recessed', 'Semi inset') }).eq('id', r.id))
}
// tall handles: grip off the door bottom; door bottom = kick 140 (door y 0 on the carcass), 128 handle -> half 64
const tc = chk('tc', await sb.from('cabinet_instances').select('id,face_grid,pos_z').eq('room_id', MAIN).eq('label', 'TC-02').single())
const offset = 1000 - Number(tc.pos_z) - 64
tc.face_grid.zones = tc.face_grid.zones.map(z => ({ ...z, grip_edge: 'bottom', handle_offset: offset }))
chk('tc upd', await sb.from('cabinet_instances').update({ face_grid: tc.face_grid }).eq('id', tc.id))
console.log('handle_offset', offset)
