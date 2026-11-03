// RHK6595: Loose Parts room carrier TC-01 -> 1 x 2400x900 + 2 x 2400x70 whiteboard 16.5 (fixed sizes),
// and the Kitchen CAD notes (melamine closure, microwave, cooktop/downdraft).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { console.log(w, r.error ? 'ERR ' + r.error.message : 'ok'); return r.data }
const WB = 'd081b2a1-38a8-472c-a415-f179699a1347'
const LOOSE = 'e01106df-71c7-4db4-9165-3bfc69daa21e', KIT = 'd113bd53-5e4a-4ded-9592-cc1f7bc0eecb'

const tc = (await sb.from('cabinet_instances').select('id').eq('room_id', LOOSE).eq('label', 'TC-01')).data[0]
const ap = (await sb.from('cabinet_custom_parts').select('*').eq('cabinet_instance_id', tc.id)).data[0]
chk('sheet', await sb.from('cabinet_custom_parts').update({ name: 'Fridge recess closure 2400 x 900 (loose, cut on site)', expressions: {}, dx: 900, dy: 2400, dz: 16.5, material_id: WB, material_override_id: WB, edge_top: false, edge_bottom: false, edge_left: false, edge_right: false }).eq('id', ap.id))
const { id, created_at, updated_at, ...rest } = ap
for (const n of [1, 2])
  chk('rip ' + n, await sb.from('cabinet_custom_parts').insert({ ...rest, name: `Closure rip 2400 x 70 #${n} (loose)`, expressions: {}, dx: 70, dy: 2400, dz: 16.5, x: 0, z: 100 * n, material_id: WB, material_override_id: WB, edge_top: false, edge_bottom: false, edge_left: false, edge_right: false, sort_order: n }))

const walls = (await sb.from('walls').select('id,name').eq('room_id', KIT)).data
const W = n => walls.find(w => w.name === n).id
const txt = (view, wall, at, width, text) => ({ room_id: KIT, view, wall_id: wall ? W(wall) : null, wall_side: wall ? 'face' : null, kind: 'text', geom: { at, width }, text, style: { size: 2.5, align: 'center' }, sort_order: 40 })
chk('notes', await sb.from('room_annotations').insert([
  txt('elevation', 'Wall 4', { x: 30, y: -1400 }, 41.5, 'FRIDGE SPACE 890. BACK CLOSED IN WITH LOOSE MELAMINE (2400 x 900 + 2 RIPS 2400 x 70) CUT DOWN ON SITE - CLOSES OFF THE UNDERSTAIR STORAGE'),
  txt('plan', null, { x: 30, y: 260 }, 41.5, 'LOOSE MELAMINE CLOSURE BEHIND FRIDGE - CUT ON SITE'),
  txt('elevation', 'Wall 2', { x: 46.5, y: -1500 }, 32.5, 'MICROWAVE CUPBOARD. BI-FOLD DOORS TBC (NORMAL DOORS FOR NOW). NO BOTTOM - SITS ON STONE. 1 ADJ SHELF, MIN 500 CLEAR'),
  txt('elevation', 'Wall 6', { x: 646.5, y: -900 }, 31.5, 'BOSCH PVQ811H26E 800 DOWNDRAFT COOKTOP OVER. TOP FRONT FALSE, 400 DRAWERS - CHECK SPEC SHEET'),
]))
