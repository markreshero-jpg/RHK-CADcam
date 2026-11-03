// RHK6592 bathrooms: room finish 16 PT Classic White Matt + 140 whiteboard kick, 16.5 panels, semi recessed basins,
// opening (main), spec block, tall hinges.  node _tmp-6592-bath.mjs <roomId> main|ensuite
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const [ROOM, kind] = process.argv.slice(2)
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const PT_SCHED = '654b33ce-46e5-4a61-948c-d29bc26d2f7c', PT_CW = 'fcfa8ede-490a-4dfc-bee9-42923d1e9c0f', STYLE16 = 'b12d551b-3c18-47a3-ae33-f5fd7ea4eb48'
const WHITEBOARD = 'd081b2a1-38a8-472c-a415-f179699a1347', BASIN = 'a23d206f-44db-4848-bf28-d804bf587add', OPENING = 'a29c1e23-c7e1-4d24-b2e6-3f8ab3f6aba8'

// 1. PT range colour: Classic White Matt
let col = chk('col', await sb.from('door_schedule_materials').select('id').eq('schedule_id', PT_SCHED).eq('material_id', PT_CW))[0]
if (!col) {
  const tpl = chk('tpl', await sb.from('door_schedule_materials').select('*').eq('schedule_id', PT_SCHED).limit(1))[0]
  const { id, created_at, updated_at, ...rest } = tpl
  col = chk('col ins', await sb.from('door_schedule_materials').insert({ ...rest, colour_name: 'Classic White Matt', colour_code: 'Classic White', finish: 'Matt', material_id: PT_CW, is_default: false, sort_order: 20 }).select('id'))[0]
}
// 2. room door style + colour, room materials, kick face
chk('room', await sb.from('rooms').update({ door_style_override_id: STYLE16, base_door_colour_id: col.id, wall_door_colour_id: col.id, tall_door_colour_id: col.id }).eq('id', ROOM))
chk('rm del', await sb.from('room_materials').delete().eq('room_id', ROOM))
chk('rm', await sb.from('room_materials').insert(['base', 'wall', 'tall'].flatMap(c => ['exposed', 'door_face'].map(r => ({ room_id: ROOM, assembly_class: c, material_role: r, material_id: PT_CW })))))
chk('rtk del', await sb.from('room_toekick_materials').delete().eq('room_id', ROOM))
chk('rtk', await sb.from('room_toekick_materials').insert({ room_id: ROOM, part_role: 'face', material_id: WHITEBOARD }))
// 3. panels back to 16.5 (placeCabinet rounds)
const cabs = chk('cabs', await sb.from('cabinet_instances').select('id,label,dx,pos_x,pos_y,wall_id,face_grid').eq('room_id', ROOM))
for (const c of cabs) if (Number(c.dx) === 17) chk('dx', await sb.from('cabinet_instances').update({ dx: 16.5 }).eq('id', c.id))
// 4. fixtures (clear old basins/openings first)
const walls = chk('walls', await sb.from('walls').select('id,name,pos_x,pos_y,angle,length').eq('room_id', ROOM))
const back = walls.find(w => Number(w.angle) === 0)
chk('fx del', await sb.from('room_fixtures').delete().eq('room_id', ROOM))
const fcols = Object.keys(chk('fx tpl', await sb.from('room_fixtures').select('*').limit(1))[0])
const cat = chk('cat', await sb.from('fixture_catalog').select('*').in('id', [BASIN, OPENING]))
const fromCat = (id, extra) => {
  const c = cat.find(x => x.id === id), row = { room_id: ROOM, catalog_id: id, wall_id: back.id, rotation: 0, display_name: c.name }
  for (const k of fcols) if (k in c && !['id', 'created_at', 'updated_at', 'room_id', 'wall_id'].includes(k) && !(k in row)) row[k] = c[k]
  return { ...row, ...extra }
}
const BENCH = 850, basinCentres = kind === 'main' ? [1680 + 346, 2772 + 346] : [376 + 350]
const rows = basinCentres.map(cx => fromCat(BASIN, { x: cx - 265, y: 235, z: BENCH + 65 - 180, display_name: 'Semi recessed basin' }))
if (kind === 'main') rows.push(fromCat(OPENING, { x: 720, y: -90, z: 0, width: 855, height: 2080, depth: 90, display_name: 'Opening', name: 'Opening 855 x 2080' }))
console.log('fixtures', chk('fx', await sb.from('room_fixtures').insert(rows).select('id,display_name,x,y')))
// 5. spec block
chk('ann del', await sb.from('room_annotations').delete().eq('room_id', ROOM).eq('kind', 'text').eq('view', 'plan'))
const text = `SPECIFICATIONS - {room}\n{job}\n\nBENCHTOP\nYDL Stone Classic White 20mm (by others)\n\nFRONTS + PANELS\n{fronts}\nPT 16mm Classic White Matt doors, drawers + panels\nKick 140: 16.5 whiteboard\n\nHANDLES\n{handles}\n\nBASINS\nSemi recessed basin${kind === 'main' ? 's' : ''} (model TBC)\n{taps}\n\nCARCASS\n{carcass}\n\nHARDWARE\nHinges: {hinges}\nRunners: {runners}`
chk('ann', await sb.from('room_annotations').insert({ room_id: ROOM, view: 'plan', kind: 'text', geom: { at: { x: kind === 'main' ? 4300 : 2800, y: 0 }, width: 75 }, text, style: { size: 2.5, bgPad: 2, block: 'Spec block', border: 'box', lineSpacing: 1.3, borderWeight: 0.35 }, sort_order: 30 }))
// 6. tall hinges off the shelf holes (main TC-02)
const tc = cabs.find(c => c.label === 'TC-02')
if (kind === 'main' && tc) {
  const fg = tc.face_grid; fg.zones = fg.zones.map(z => ({ ...z, hinges: JSON.parse(process.env.HINGES ?? '[100,890,1485,1880]') }))
  chk('hinges', await sb.from('cabinet_instances').update({ face_grid: fg }).eq('id', tc.id))
}
console.log('steps', JSON.stringify(cabs.map(c => ['updateCabinet', [c.id, { dz: undefined }]]).length))
fs.writeFileSync('z_plan_automation/_tmp-6592-steps.json', JSON.stringify(cabs.filter(c => !/^KICK/.test(c.label)).map(c => ['updateCabinet', [c.label, { dy: undefined }]])))
