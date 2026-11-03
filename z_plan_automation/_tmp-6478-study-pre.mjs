// RHK6478 Study: window, stone cladding notes, room finishes (Teak 16.5 fronts + exposed, Set Back SQ Edge finger pull).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = 'a04663c7-1402-4344-be00-3ad4ce3aeae9'
const LX = '8ffd3162-6b06-4abf-9f00-e05caf04eb79', TEAK = '5fdb0fa7-e212-49aa-b8e6-044210033c85', TEAK_BOARD = '67ecbeff-98ac-41e1-9b1a-618a5bf6a96b'
const SETBACK = '69316467'
const hs = chk('hs', await sb.from('handle_schedules').select('id,name').ilike('name', 'Set Back SQ Edge%'))
const walls = chk('walls', await sb.from('walls').select('id,name').eq('room_id', R))
const W = Object.fromEntries(walls.map(w => [w.name, w.id]))
chk('room', await sb.from('rooms').update({
  base_door_style_id: LX, base_door_colour_id: TEAK, tall_door_style_id: LX, tall_door_colour_id: TEAK,
  wall_door_style_id: LX, wall_door_colour_id: TEAK, handle_schedule_id: hs[0].id,
}).eq('id', R))
chk('rm del', await sb.from('room_materials').delete().eq('room_id', R).eq('material_role', 'exposed'))
chk('rm ins', await sb.from('room_materials').insert(['base', 'wall', 'tall'].map(c => ({ room_id: R, assembly_class: c, material_role: 'exposed', material_id: TEAK_BOARD }))))
// Window on Wall 2: 723-1525 from the block wall face (wall start), square set. Sill / head not measured.
chk('fx del', await sb.from('room_fixtures').delete().eq('room_id', R).eq('category', 'opening'))
chk('window', await sb.from('room_fixtures').insert({ room_id: R, catalog_id: '9e0fe4ad-0be5-4de5-885f-1317864fb125', category: 'opening', kind: 'Window',
  name: 'Window 802 (square set)', width: 802, depth: 90, height: 1200, mount: 'wall', x: -90, y: 1504, rotation: 270, z: 900, wall_id: W['Wall 2'] }))
// Stone cladding: plan notes with arrows to both nib faces (x 2656 / 2846).
chk('ann del', await sb.from('room_annotations').delete().eq('room_id', R).eq('view', 'plan').like('text', 'STONE CLADDING%'))
chk('ann', await sb.from('room_annotations').insert([
  { room_id: R, view: 'plan', kind: 'text', sort_order: 10, text: 'STONE CLADDING TO NIB (30-40, by others)', style: { size: 2.5 },
    geom: { at: { x: 1700, y: 1200 }, width: 45, leader: [{ x: 2656, y: 1780 }, { x: 2300, y: 1300 }] } },
  { room_id: R, view: 'plan', kind: 'text', sort_order: 11, text: 'STONE CLADDING TO NIB (30-40, by others)', style: { size: 2.5 },
    geom: { at: { x: 3050, y: 1200 }, width: 45, leader: [{ x: 2846, y: 1780 }, { x: 3050, y: 1300 }] } },
]))
console.log('ok', hs[0].name, W)
