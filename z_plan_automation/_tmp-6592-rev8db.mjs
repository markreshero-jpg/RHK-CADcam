// RHK6592 rev 8 (Mark 2026-11-05) — DB phase. Flavio's edited plans (SITE CHECK MEASURES):
// colour -> Dulux White on White Satin; butlers Wall 1 2230 -> 2290 (room 60 deeper, south run moves 60 south);
// butlers south top: 20 stone waterfall at the entry end (outside the 18 end panel, top stays 2540 = 20 past it).
// Edits in place only (never delete user CAD).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (m, r) => { if (r.error) { console.error(m, r.error.message); process.exit(1) } console.log('ok', m, r.count ?? '') }
const KIT = 'dc7a22f3-ed0b-4771-a42e-4548fc4de1e1', BUT = '1c00eb19-09c1-41b8-8c7c-a6441ee0263d'
const D = 60 // room grows 60 to the south

// 1. colour + spec block lines
chk('colour', await sb.from('door_schedule_materials').update({ colour_name: 'Dulux White on White Satin' }).eq('id', '334dab4c-c325-45ee-9504-686510d681ac'))
for (const room of [KIT, BUT]) {
  const a = (await sb.from('room_annotations').select('id,text').eq('room_id', room).eq('view', 'plan').like('text', 'SPECIFICATIONS%')).data
  for (const s of a) {
    let t = s.text.replace('2pac satin, to match Polytec Classic White,', '2pac Dulux White on White, satin finish,')
    if (room === BUT) t = t
      .replace('YDL Stone Nuvola Snow 20mm\n', 'YDL Stone Nuvola Snow 20mm\n20mm waterfall at the entry end (outside the end panel)\n')
      .replace('6 adj shelves each\n', '6 adj shelves each\nBroom cupboard: PT 16mm Classic White Matt door, RH hinge\nFloating shelf: 36mm 2pac (2 x 18 satin), 600 above the bench, no LED\n')
    chk('spec ' + room.slice(0, 4), await sb.from('room_annotations').update({ text: t }).eq('id', s.id))
  }
}

// 2. butlers walls: Wall 1 (west, S->N) + Wall 3 (east) 2230 -> 2290, Wall 1 + Wall 4 start at y 2290
const w = Object.fromEntries((await sb.from('walls').select('id,name').eq('room_id', BUT)).data.map(x => [x.name, x.id]))
chk('wall 1', await sb.from('walls').update({ length: 2290, pos_y: 2290 }).eq('id', w['Wall 1']))
chk('wall 3', await sb.from('walls').update({ length: 2290 }).eq('id', w['Wall 3']))
chk('wall 4', await sb.from('walls').update({ pos_y: 2290 }).eq('id', w['Wall 4']))
const room = (await sb.from('rooms').select('*').eq('id', BUT).single()).data
for (const k of ['depth', 'length', 'height_y', 'room_depth']) if (typeof room[k] === 'number' && room[k] === 2230) console.log('NOTE room.' + k + ' = 2230')

// 3. cabinets: south run + its pos_y 60 south; west run keeps its offsets from the (moved) wall start
const cabs = (await sb.from('cabinet_instances').select('id,label,wall_id,pos_y,notes').eq('room_id', BUT)).data
for (const c of cabs) {
  let y = null
  if (c.wall_id === w['Wall 4']) y = 2290
  if (c.wall_id === w['Wall 1'] && c.label !== 'BC-03') y = Number(c.pos_y) + D // BC-01, BC-02, KICK 1
  if (y != null) chk(`${c.label} y ${y}`, await sb.from('cabinet_instances').update({ pos_y: y }).eq('id', c.id))
}
const tc04 = cabs.find(c => c.label === 'TC-04')
chk('TC-04 note', await sb.from('cabinet_instances').update({ notes: 'PT 16 Classic White Matt panel between the open shelving and the broom cupboard, floor to 2200, 300 OA' }).eq('id', tc04.id))
const bc02 = cabs.find(c => c.label === 'BC-02')
chk('BC-02 note', await sb.from('cabinet_instances').update({ notes: 'Sink cupboard 810 (Wall 1 2290 site measure), undermount sink (model TBC)' }).eq('id', bc02.id))

// 4. benchtops in place
const ARR = 'ec4c909c-11b4-4916-ab99-b1081b2ffd95', WF = 'ec8720a4-d679-414f-8936-03679e555932'
const W = { wall: true }, J = { wall: false }, A = { wall: false, profile_id: ARR }, F = { wall: false, profile_id: WF, waterfall_join: 'mitre' }
const P = (...xy) => xy.map(([x, y]) => ({ x, y }))
const seg = (pts, edges) => pts.map((p0, i) => ({ type: 'line', p0, p1: pts[(i + 1) % pts.length], edge: edges[i] }))
const tops = (await sb.from('benchtop_instances').select('id,label').eq('room_id', BUT)).data
const bt = Object.fromEntries(tops.map(t => [t.label, t.id]))
const p1 = P([0, 0], [600, 0], [600, 1690], [0, 1690])
chk('BT1', await sb.from('benchtop_instances').update({ polygon: p1, segments: seg(p1, [W, A, J, W]),
  notes: 'Butlers west: YDL Stone Nuvola Snow 20mm, 600 deep, 1690 to the corner (wall 2290). Butt joint to the south top at the corner. Undermount sink 600.' }).eq('id', bt['Benchtop 1']))
const p2 = P([0, 1690], [600, 1690], [2540, 1690], [2540, 2290], [0, 2290])
chk('BT2', await sb.from('benchtop_instances').update({ polygon: p2, segments: seg(p2, [J, A, F, W, W]),
  notes: 'Butlers south (over the D/W, washer, dryer): YDL Stone Nuvola Snow 20mm, 600 deep, runs through the corner. 20 waterfall at the entry end, outside the 18 end panel (2540 OA incl the waterfall).' }).eq('id', bt['Benchtop 2']))
