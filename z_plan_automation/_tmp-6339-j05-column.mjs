// RHK6339 J05 (Mark 2026-11-11): portal column. Solid = nib wall off Wall 2 (plan, 3D, Wall 2 elevation);
// see-through = dashed CAD outline + label on the Wall 1 elevation (it stands in front of BC-03).
// Column 100 x 100 nominal, face 703 off Wall 1 (716 site less 1x gyprock), full height.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'ab417075-b6e2-4189-93c5-c281e1f05f9b', WALL1 = '863581fd-8134-41c0-aded-c1440f85c1a3'
const GENERAL = '9768e64f-5133-4558-8375-b293405b976c'
const T = 100, FACE = 703, H = 2700

const { data: nibs } = await sb.from('walls').select('id').eq('room_id', R).eq('wall_type', 'nib')
if (!nibs.length) {
  // Nib: start on Wall 2's inside face (x 2830), pointing into the room, centred on its line.
  const r = await sb.from('walls').insert({ room_id: R, name: 'Portal column', wall_type: 'nib', sort_order: 2,
    pos_x: 2830, pos_y: FACE + T / 2, angle: 180, length: T, thickness: T, height: H }).select('id').single()
  console.log('nib', r.error?.message ?? r.data.id)
} else console.log('nib exists')

const ann = (await sb.from('room_annotations').select('id,text,sort_order,kind,view,wall_id').eq('room_id', R)).data
let so = Math.max(0, ...ann.map(a => a.sort_order ?? 0))
if (!ann.some(a => a.view === 'elevation' && a.kind === 'rect' && a.wall_id === WALL1)) {
  const rows = [
    { kind: 'rect', geom: { a: { x: 2830 - T, y: 0 }, b: { x: 2830, y: -H } }, style: { dash: 'dashed', weight: 0.35 } },
    { kind: 'text', text: 'PORTAL COLUMN\n(IN FRONT)', geom: { at: { x: 2340, y: -1150 }, width: 18 }, style: { size: 2.5, align: 'right' } },
  ]
  for (const row of rows) {
    const r = await sb.from('room_annotations').insert({ room_id: R, view: 'elevation', wall_id: WALL1, wall_side: 'face',
      cad_layer_id: GENERAL, text: null, ...row, sort_order: ++so }).select('id').single()
    console.log(row.kind, r.error?.message ?? r.data.id)
  }
} else console.log('wall 1 column CAD exists')
