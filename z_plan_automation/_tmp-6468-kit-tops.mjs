// RHK6468 Kitchen rev 1: stone tops (ST Arabescato / RS reconstituted Colour TBC), windows W7 + W8,
// sinks + taps (library stand-ins renamed to the plumbing spec). DB rows only; re-run safe (replaces its own rows).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) throw new Error(t + ': ' + r.error.message); return r.data }
const R = '58bac32f-cdca-4a86-a1a4-c29af7ef9430'
const ST = 'c45de930-b06f-47ce-b1c0-6ad02803dde8', RS = 'ca01b6c2-c3cc-4084-8905-5c45577fb58b', STONE20 = 'fde097ae-d0e2-46dc-a549-9939ff7d8c28'
const MA300 = 'dd11de90-4e45-46e8-912e-bb1bb3c84906'
const W = Object.fromEntries(chk('walls', await sb.from('walls').select('id,name').eq('room_id', R)).map(w => [w.name, w.id]))

// ── Tops (one per wall, joints at the butler's corners) ──
const top = (label, wall, sched, notes, segs) => ({ room_id: R, label, wall_id: W[wall], wall_side: 'face', height_mm: 900,
  benchtop_schedule_id: sched, benchtop_build_method_id: STONE20, notes,
  polygon: segs.map(s => s[0]), edge_tags: [], join_types: [], arc_segments: [], cutout_polygons: [], joins: [],
  segments: segs.map((s, i) => ({ type: 'line', p0: s[0], p1: segs[(i + 1) % segs.length][0], edge: s[1] })) })
const P = (x, y) => ({ x, y }), WALL = { wall: true }, EXP = { wall: false }, JOINT = { wall: false, joint: 'butt' }, APRON = { wall: false, profile_id: MA300 }
const tops = [
  top('Kitchen run', 'Wall 7', ST, 'ST 20 SNB Arabescato Marble honed. 3872 x 700, both ends open (north end to the door jamb). Undermount Franke MRG620 double.',
    [[P(3328, -2893), EXP], [P(4028, -2893), EXP], [P(4028, 979), EXP], [P(3328, 979), WALL]]),
  top('Island', 'Wall 8', ST, 'ST 20 SNB Arabescato Marble honed. 4000 x 1080, 300 mitred apron on the back + both ends (sits on the veneer end boxes, back mouldings flush below).',
    [[P(5108, -2893), APRON], [P(6188, -2893), APRON], [P(6188, 1107), APRON], [P(5108, 1107), EXP]]),
  top('Drawers under W7', 'Wall 2', ST, 'ST 20 SNB Arabescato Marble honed, under window W7, against the tall panel.',
    [[P(4859, 2041), EXP], [P(6065, 2041), WALL], [P(6065, 2700), WALL], [P(4859, 2700), WALL]]),
  top("Butler's south", 'Wall 2', RS, 'RS 20 reconstituted stone - colour TBC. Runs through the SW corner, butt joint to the west top. Undermount Franke 370 single.',
    [[P(0, 2041), JOINT], [P(599, 2041), EXP], [P(2612, 2041), WALL], [P(2612, 2700), WALL], [P(0, 2700), WALL]]),
  top("Butler's west", 'Wall 3', RS, 'RS 20 reconstituted stone - colour TBC. Butt joints to the north + south tops.',
    [[P(0, 519), JOINT], [P(599, 519), EXP], [P(599, 2041), JOINT], [P(0, 2041), WALL]]),
  top("Butler's north", 'Wall 4', RS, 'RS 20 reconstituted stone - colour TBC. Runs through the NW corner, stops at the tall end panel (cavity slider TBC beyond).',
    [[P(0, 0), WALL], [P(3055, 0), WALL], [P(3055, 519), EXP], [P(599, 519), JOINT], [P(0, 519), WALL]]),
]
chk('tops del', await sb.from('benchtop_instances').delete().eq('room_id', R))
for (const t of tops) chk(t.label, await sb.from('benchtop_instances').insert(t))
console.log('tops', tops.length)

// ── Fixtures ──
const D2R = Math.PI / 180
const axes = r => ({ a: { x: Math.cos(r * D2R), y: Math.sin(r * D2R) }, n: { x: -Math.sin(r * D2R), y: Math.cos(r * D2R) } })
const blFromCentre = (c, r, w, d) => { const { a, n } = axes(r); return { x: c.x - a.x * w / 2 - n.x * d / 2, y: c.y - a.y * w / 2 - n.y * d / 2 } }
const centreFromHole = (h, r, offX, offY) => { const { a, n } = axes(r); return { x: h.x - a.x * offX - n.x * offY, y: h.y - a.y * offX - n.y * offY } }
const cat = async id => chk('cat', await sb.from('fixture_catalog').select('*').eq('id', id).single())
const fcols = Object.keys(chk('fx tpl', await sb.from('room_fixtures').select('*').limit(1))[0])
const row = (c, extra) => { const r = { room_id: R, catalog_id: c.id }; for (const k of fcols) if (k in c && !['id', 'created_at', 'updated_at', 'room_id', 'wall_id', 'notes'].includes(k)) r[k] = c[k]; return { ...r, ...extra } }
const SINK2 = await cat('88593274-22ee-409c-af80-1c7254bb639a'), SINK1 = await cat('ab1c3583-04c1-4105-aa8c-8cf2c54574a5')
const PULL = await cat('c8170123-0e37-437c-a3d0-36e091b5c589'), GOOSE = await cat('2d62af70-1116-49e5-97d7-9658d49d6af9'), WIN = await cat('04f9173d-18c2-4c62-ab7e-d8f8246a2b76')
const tap = (c, hole, r, wall, name, notes) => { const ctr = centreFromHole(hole, r, Number(c.cutout_off_x), Number(c.cutout_off_y)); const bl = blFromCentre(ctr, r, Number(c.width), Number(c.depth))
  return row(c, { display_name: name, notes, x: bl.x, y: bl.y, z: 920, rotation: r, wall_id: W[wall] }) }
const sink = (c, ctr, r, wall, name, notes) => { const bl = blFromCentre(ctr, r, Number(c.width), Number(c.depth))
  return row(c, { display_name: name, notes, x: bl.x, y: bl.y, z: 900 - Number(c.height), rotation: r, wall_id: W[wall] }) }
const fx = [
  // Kitchen run faces east (rot 270). BC-07 centre 834.5 from the run's south end (y 979); sink front 80 off the 4028 edge.
  sink(SINK2, { x: 4028 - 80 - 225, y: 979 - 834.5 }, 270, 'Wall 7', 'Franke MRG620-3535SGFPC double U/M - Onyx', 'Spec: Franke MRG620-3535SGFPC 760 x 440 x 200 double bowl, Onyx. Model = Abi Zalo double (stand-in).'),
  tap(PULL, { x: 4028 - 80 - 450 - 60, y: 979 - 834.5 }, 270, 'Wall 7', 'Gessi pull-out mixer - matte bronze', 'Spec: Winnings / Gessi pull-out mixer, bronze matte (model TBC). Model = Abi pull-out (stand-in).'),
  // Butler's south faces north (rot 180). BC-36 centre x 1687; top front y 2041.
  sink(SINK1, { x: 1687, y: 2041 + 80 + 220 }, 180, 'Wall 2', 'Franke 370 single bowl U/M - Onyx', "Spec: Franke 370 single bowl undermount, Onyx (waste colour TBC). Model = Abi Ohelu 380 (stand-in)."),
  tap(PULL, { x: 1687, y: 2041 + 80 + 440 + 60 }, 180, 'Wall 2', 'Franke pull-out mixer - black steel', 'Spec: Franke pull-out mixer, black steel. Model = Abi pull-out (stand-in).'),
  tap(GOOSE, { x: 1687 - 150, y: 2041 + 80 + 440 + 60 }, 180, 'Wall 2', 'Zip tap H5L783Z03AU matte black - TBC', 'Spec: Zip H5L783Z03AU matte black - which sink TBC (spec says sink 7). Model = Abey gooseneck (stand-in).'),
  // Windows in Wall 2 (south, rot 180, back face y 2790).
  row(WIN, { display_name: 'W8 window 2553 x 700', name: 'W8 window 2553 x 700', notes: 'Site: 2553 between jambs, bench 920 to overhead underside 1620.', x: 6065 - 3453, y: 2790, z: 920, width: 2553, height: 700, depth: 90, rotation: 180, wall_id: W['Wall 2'], mount: 'wall' }),
  row(WIN, { display_name: 'W7 window - size TBC', name: 'W7 window - size TBC', notes: 'Not measured: drawn 990 wide over the drawers, bench to 2370 - TBC.', x: 6065 - 124.5, y: 2790, z: 920, width: 990, height: 1450, depth: 90, rotation: 180, wall_id: W['Wall 2'], mount: 'wall' }),
]
chk('fx del', await sb.from('room_fixtures').delete().eq('room_id', R).in('category', ['sink', 'tap', 'opening']))
for (const f0 of fx) { const { notes, ...f } = f0; const r = chk(f.display_name, await sb.from('room_fixtures').insert(f).select('id,display_name,x,y,z,rotation').single()); console.log(JSON.stringify(r)) }
