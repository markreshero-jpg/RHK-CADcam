// RHK6592 rev 6 (Mark 2026-11-01): colour "to match Polytec Classic White", fridge opening + appliance space +
// void corner + open shelf CAD notes, hinges dropped below the upright sink rails.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (m, r) => { if (r.error) { console.error(m, r.error.message); process.exit(1) } console.log('ok', m) }
const KIT = 'dc7a22f3-ed0b-4771-a42e-4548fc4de1e1', BUT = '1c00eb19-09c1-41b8-8c7c-a6441ee0263d'
const MAIN = '6980f63e-923d-4ea8-ae57-a604eb4fa00e', ENS = '8160a0cd-80aa-42e3-9b00-723db14b0747'

// 1. colour + spec block line
chk('colour', await sb.from('door_schedule_materials').update({ colour_name: 'Satin, to match Polytec Classic White' }).eq('id', '334dab4c-c325-45ee-9504-686510d681ac'))
for (const room of [KIT, BUT]) {
  const a = (await sb.from('room_annotations').select('id,text').eq('room_id', room).eq('view', 'plan').like('text', 'SPECIFICATIONS%')).data
  for (const s of a) chk('spec ' + room.slice(0, 4), await sb.from('room_annotations').update({
    text: s.text.replace('2pac Classic White Satin on 18mm satin board, flat', '2pac satin, to match Polytec Classic White,\nshaker (60 frame) on 18mm satin board'),
  }).eq('id', s.id))
}

// 2. elevation CAD notes: text box inside the space, centred, x along the elevation from the wall start,
//    y = -(top of the text AFFL), width (paper mm) = (space - 60) / scale 20.
const walls = async room => Object.fromEntries((await sb.from('walls').select('id,name').eq('room_id', room)).data.map(w => [w.name, w.id]))
const kw = await walls(KIT), bw = await walls(BUT)
const note = (room, wall, x0, x1, aff, text) => ({
  room_id: room, view: 'elevation', wall_id: wall, wall_side: 'face', kind: 'text', text,
  geom: { at: { x: x0 + 30, y: -aff }, width: (x1 - x0 - 60) / 20 }, style: { size: 2.5, align: 'center' },
})
const notes = [
  note(KIT, kw['Wall 1'], 968, 1888, 1000, 'FRIDGE OPENING\n920W x 1850H'),
  note(BUT, bw['Wall 4'], 2669, 3279, 520, 'DISHWASHER SPACE\n610W x 880H'),
  note(BUT, bw['Wall 4'], 2041, 2651, 520, 'WASHER SPACE\n610W x 880H'),
  note(BUT, bw['Wall 4'], 1413, 2023, 520, 'DRYER SPACE\n610W x 880H'),
  note(BUT, bw['Wall 4'], 3355, 3915, 480, 'VOID CORNER'),
  note(BUT, bw['Wall 1'], 0, 580, 480, 'VOID CORNER'),
  note(BUT, bw['Wall 2'], 602, 1572, 1500, 'OPEN SHELVES\nPT CLASSIC WHITE MATT'),
  note(BUT, bw['Wall 2'], 1572, 2542, 1500, 'OPEN SHELVES\nPT CLASSIC WHITE MATT'),
]
for (const room of [KIT, BUT]) await sb.from('room_annotations').delete().eq('room_id', room).eq('view', 'elevation')
  .in('text', notes.map(n => n.text))
chk('notes', await sb.from('room_annotations').insert(notes))

// 3. hinges below the upright top rail: top hinge 30 lower (plate ~29 clear of the rail)
const drop = { [MAIN]: { 'BC-02': [100, 556], 'BC-04': [100, 556] }, [ENS]: { 'BC-03': [100, 556] }, [BUT]: { 'BC-02': [100, 636] } }
for (const [room, m] of Object.entries(drop)) for (const [label, hinges] of Object.entries(m)) {
  const c = (await sb.from('cabinet_instances').select('id,face_grid').eq('room_id', room).eq('label', label).single()).data
  const fg = c.face_grid; fg.zones = fg.zones.map(z => z.face_type === 'door' ? { ...z, hinges } : z)
  chk(`hinges ${label}`, await sb.from('cabinet_instances').update({ face_grid: fg }).eq('id', c.id))
}
