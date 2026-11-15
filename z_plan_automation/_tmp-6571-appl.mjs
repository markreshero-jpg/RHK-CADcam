// RHK6571 Kitchen: Geraldine's appliance + sink specs (email 12/11/2026, files in _JOBS ...\APPLIANCES).
// 1. Library rows for the real models (stand-in 3D models from the nearest catalogue item).
// 2. Sink + oven fixtures swapped in place (same ids); cooktop, DW, mixer added.
// 3. Plan / elevation notes + Appliance spec block updated in place; resolved TBC clouds removed (auto, untouched).
// Re-runnable: catalogue rows / fixtures are found by name before inserting.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '5a1ef0f2-d86e-4c67-8b0e-df4a80dd09c3'
const WALL3 = '9a75bd31-b386-4385-a5d3-f6798bdac781', WALL4 = '68fa61f3-2ec7-4515-a849-f609b3983d1c'
const SINK_FX = '99782f3f-378c-48eb-b8e5-a72a9d75f59d', OVEN_FX = '1f6e267e-a71e-49d3-bff8-0eff7f4f31c7'
const BODY = ['category', 'kind', 'name', 'brand', 'model_no', 'width', 'depth', 'height', 'mount', 'colour', 'model_url', 'model_format', 'model_scale', 'model_rot_x', 'model_rot_y', 'model_off_x', 'model_off_y', 'model_off_z', 'cutout_shape', 'cutout_w', 'cutout_d', 'cutout_radius', 'cutout_off_x', 'cutout_off_y', 'cut_benchtop', 'bench_drop', 'plan_shape', 'elev_shape', 'resizable', 'stretch']
const SRC = 'Spec sheet: RHK6571 _JOBS APPLIANCES folder (Geraldine 12/11/2026).'
const NEW = [
  { key: 'sink', from: '42d89ce0-4507-4b2a-aa8c-c7ac11f8f8f1', set: { name: 'Fienza Kuro Granite Single Bowl Sink 38L (Matte Black)', brand: 'Fienza', model_no: '68612', width: 540, depth: 440, height: 215, bench_drop: 215, colour: '#2a2a2a', cutout_shape: 'rect', cutout_w: 500, cutout_d: 400, cutout_radius: 10, notes: `Top or undermount; bowl 500 x 400 inside (20 walls), 200 deep. Cut-out = undermount (bowl). 3D = Abi Seba 550 stretched. ${SRC}` } },
  { key: 'tap', from: '2d62af70-1116-49e5-97d7-9658d49d6af9', set: { name: 'Linkware Elle Stainless Steel Project Sink Mixer', brand: 'Linkware', model_no: 'Elle', height: 390, notes: `Gooseneck, 228 reach, 390 high, 54 base, 35 tap hole. 3D = Abey Lucia stand-in. ${SRC}` } },
  { key: 'oven', from: '2d1a4f6c-d69d-4c06-8ea4-a430de4e6800', set: { name: 'Bosch Series 4 Built-in Oven 60 Black', brand: 'Bosch', model_no: 'HBA574EB3A', width: 594, depth: 548, height: 595, colour: '#1e1e1e', notes: `Niche 585-595 H x 560-568 W x 550 D; 320 x 115 connection space. 3D = Generic oven 600. ${SRC}` } },
  { key: 'cooktop', from: '5322d561-042b-45b4-a138-b080655e6af6', set: { name: 'Bosch Series 4 Electric Cooktop 60 Black', brand: 'Bosch', model_no: 'PKE611BA2A', kind: 'Cooktop', width: 592, depth: 522, height: 50, bench_drop: 45, cutout_shape: 'rect', cutout_w: 560, cutout_d: 495, cutout_radius: 0, notes: `Ceramic radiant, frameless. Cut-out 560 x 490-500 (drawn 495), min 50 back / 35 front / 90 to a side wall; 45 recess, 20 min over an oven. 3D = Induction cooktop 600. ${SRC}` } },
  { key: 'dw', from: 'd38c8c4c-0429-4a86-8804-e6a17bc8274e', set: { name: 'LG 60cm 14 Place QuadWash Freestanding Dishwasher (Stainless)', brand: 'LG', model_no: 'XD4B24PS', width: 600, depth: 600, height: 850, notes: `600 W x 600 D x 850 H. 3D = Miele G 5210 SC stand-in. ${SRC}` } },
]
const cat = {}
for (const n of NEW) {
  const have = chk('c?', await sb.from('fixture_catalog').select('*').eq('name', n.set.name))
  if (have.length) { cat[n.key] = have[0]; continue }
  const src = chk('src', await sb.from('fixture_catalog').select('*').eq('id', n.from).single())
  const row = { ...Object.fromEntries(Object.entries(src).filter(([k]) => !['id', 'created_at', 'updated_at'].includes(k))), ...n.set }
  cat[n.key] = chk('cins', await sb.from('fixture_catalog').insert(row).select('*').single())
  console.log('catalogue +', cat[n.key].id.slice(0, 8), n.set.name)
}
const body = c => Object.fromEntries(BODY.map(k => [k, c[k]]))

// Fixtures: swap in place / insert. label = the spec line the Appliance block prints.
const LBL = {
  sink: 'Fienza Kuro 68612 granite single bowl, Matte Black - UNDERMOUNT (540 x 440, bowl 500 x 400)',
  tap: 'Linkware Elle stainless steel sink mixer',
  oven: 'Bosch HBA574EB3A Series 4 built-in oven 60, black',
  cooktop: 'Bosch PKE611BA2A Series 4 electric cooktop 60, black (cut-out 560 x 495)',
  dw: 'LG XD4B24PS 60cm freestanding dishwasher, stainless (600 x 600 x 850)',
}
chk('sink', await sb.from('room_fixtures').update({ ...body(cat.sink), catalog_id: cat.sink.id, label: LBL.sink, display_name: null }).eq('id', SINK_FX))
chk('oven', await sb.from('room_fixtures').update({ ...body(cat.oven), catalog_id: cat.oven.id, label: LBL.oven, display_name: null }).eq('id', OVEN_FX))
const ids = { sink: SINK_FX, oven: OVEN_FX }
const add = [
  // El C: cooktop centred on BC-02 (cabinet x 2843.5-3443.5, wall at y 4044, rot 180); 39 off the wall -> cut-out 52.5 back / 52.5 front.
  { key: 'cooktop', wall: WALL3, x: 3439.5, y: 4005, z: 855, rotation: 180 },
  // El B: DW centred in the 610 space (room y 2117.5-2727.5), against the wall (x 2210), rot 270.
  { key: 'dw', wall: WALL4, x: 2210, y: 2722.5, z: 0, rotation: 270 },
  // Mixer: tap hole centred behind the sink (sink centre room y 3077.3), 45 off the wall.
  { key: 'tap', wall: WALL4, x: 2225, y: 3107.25, z: 900, rotation: 270 },
]
for (const a of add) {
  const have = chk('f?', await sb.from('room_fixtures').select('id').eq('room_id', R).eq('catalog_id', cat[a.key].id))
  if (have.length) { ids[a.key] = have[0].id; continue }
  const r = chk('fins', await sb.from('room_fixtures').insert({ ...body(cat[a.key]), catalog_id: cat[a.key].id, room_id: R, wall_id: a.wall, x: a.x, y: a.y, z: a.z, rotation: a.rotation, label: LBL[a.key] }).select('id').single())
  ids[a.key] = r.id; console.log('fixture +', a.key, r.id.slice(0, 8))
}

// Poses through the canvas (links each to the cabinet under it).
const POSE = { sink: { x: 2290, y: 3347.3, z: 665 }, oven: { x: 3441, y: 4050.5 }, cooktop: { x: 3439.5, y: 4005, z: 855 }, dw: { x: 2210, y: 2722.5 }, tap: { x: 2225, y: 3107.25, z: 900 } }
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 600000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 180000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await new Promise(r => setTimeout(r, 4000))
  const api = (f, ...a) => page.evaluate(([f, a]) => window.__canvasApi[f](...a), [f, a])
  for (const [k, p] of Object.entries(POSE)) { console.log(k, JSON.stringify(await api('updateFixture', ids[k], p))); await new Promise(r => setTimeout(r, 1500)) }
  await new Promise(r => setTimeout(r, 2500))
  const st = await api('getState')
  for (const f of st.fixtures ?? []) console.log('  ', f.name, JSON.stringify({ x: f.x, y: f.y, z: f.z, rot: f.rotation, w: f.width, d: f.depth, cab: f.cabinet, clash: f.clash }))
} finally { await browser.close() }

// CAD notes, updated in place.
const A = (id, text) => sb.from('room_annotations').update({ text }).eq('id', id)
const appl = 'APPLIANCES + SINKS - {room}\n{job}\n\nSINK\n{sinks}\n\nTAPWARE\n{taps}\n\nOVENS\n{ovens}\n\nCOOKTOP\n{cooktops}\n\nRANGEHOOD\nWestinghouse WRR626SB 60cm slide-out, stainless\n+ Abey RHH6 horizontal ducting kit 150\n\nDISHWASHER\n{dishwashers}\n\nFRIDGE\nBy owner'
for (const [id, t] of [
  ['5eb158bd-9a0f-4b36-bee1-4d19302c932d', appl],
  ['ad7e5cef-1cd2-4c14-91f0-309e48400e5b', 'D/W SPACE 610\nLG XD4B24PS'],
  ['9ad4f7f7-9fae-4ac5-a7c9-1487a1261792', 'U/M SINGLE BOWL\nFIENZA KURO 68612\nPOSITION TBC ON SITE'],
  ['3224d53a-e607-4cf5-883d-602a159c6031', 'COOKTOP\nBOSCH PKE611BA2A'],
  ['fdc7c308-e98c-43fb-a067-567c85e65d2f', 'DISHWASHER SPACE\n610W x 880H\nLG XD4B24PS 850H'],
  ['a9533050-abe1-4961-9ec2-10caa4673298', 'U/M SINGLE BOWL FIENZA KURO 68612\nPOSITION TBC ON SITE'],
  ['28271d79-44aa-4eb1-9133-1439b85f001c', 'RANGEHOOD WESTINGHOUSE WRR626SB SLIDE-OUT\nCUT-OUT + HORIZONTAL DUCT TBC'],
  ['8fa26281-691c-4ead-87bc-132e6059799a', 'LG XD4B24PS'],
]) chk('ann ' + id.slice(0, 8), await A(id, t))
// Answered: cooktop + DW model clouds (auto, never edited).
chk('del', await sb.from('room_annotations').delete().in('id', ['5a428660', '53a8be34'].length ? (await sb.from('room_annotations').select('id').eq('room_id', R).eq('kind', 'cloud')).data.map(r => r.id).filter(id => id.startsWith('5a428660') || id.startsWith('53a8be34')) : []))
console.log('done', JSON.stringify(ids))
