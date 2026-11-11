// RHK6339 J04 (Mark 2026-11-12): lining pieces 700 deep, join the kick, 35 solid timber top wall to wall,
// spec block + SITE NOTES (plan), notes on the Wall 2 elevation.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'b2252689-fdc9-4fd7-be9a-f29853f0391e'
const SCH = 'cadefc6c-ca21-4de4-b7ac-55b044a1bd15', METH = '58155ef3-dfc2-4ab1-96bd-a8b1c0400f73'
const GENERAL = '9768e64f-5133-4558-8375-b293405b976c', SITE = '82e5b80d-e0b7-4480-a64a-46af8e0b4d41'
const { data: wall2 } = await sb.from('walls').select('id').eq('room_id', R).eq('name', 'Wall 2').single()

// Top: 0-2271 along Wall 2, 700 deep (flush with the jamb face), carcass top 865 (35 top -> 900 FFL).
const P = [{ x: 0, y: 0 }, { x: 2271, y: 0 }, { x: 2271, y: 700 }, { x: 0, y: 700 }]
const edges = [{ wall: true }, { wall: true }, { wall: false }, { wall: true }]
const segments = P.map((p0, i) => ({ type: 'line', p0, p1: P[(i + 1) % 4], edge: edges[i] }))
const { data: old } = await sb.from('benchtop_instances').select('id').eq('room_id', R)
if (!old?.length) {
  const r = await sb.from('benchtop_instances').insert({
    room_id: R, label: 'Benchtop 1', polygon: P, segments,
    edge_tags: [{ type: 'wall', edge_index: 0 }, { type: 'wall', edge_index: 1 }, { type: 'wall', edge_index: 3 }],
    join_types: [], joins: [], arc_segments: [], cutout_polygons: [], wall_id: wall2.id, wall_side: 'face', height_mm: 865,
    benchtop_schedule_id: SCH, benchtop_build_method_id: METH,
    notes: '35 solid timber Blackbutt, clear matt lacquer, made by hand. 2271 frame to frame x 700 (flush with the jamb face). Undermount SS sink cut-out + extra coats to the exposed edges at the sink. Top 900 FFL.',
  }).select('id').single()
  console.log('top', r.error?.message ?? r.data.id)
} else console.log('top exists', old[0].id)

const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  // WEP depth = dz + door + 2 -> 681 gives a 700 lining.
  for (const l of ['WC-01', 'WC-02']) { console.log(l, JSON.stringify(await page.evaluate(l => window.__canvasApi.updateCabinet(l, { dz: 681 }), l))); await sleep(2000) }
  console.log('join', JSON.stringify(await page.evaluate(() => window.__canvasApi.joinKicks('BC-01')))); await sleep(4000)
  for (const ci of await page.evaluate(() => window.__canvasApi.getIssues())) for (const e of [...ci.errors, ...ci.warnings]) console.log(' ', ci.label, e.code, e.message)
} finally { await browser.close() }

const ann = (await sb.from('room_annotations').select('id,text,sort_order').eq('room_id', R)).data
if (ann.some(a => a.text?.startsWith('SPECIFICATIONS'))) { console.log('CAD already there'); process.exit(0) }
let so = Math.max(0, ...ann.map(a => a.sort_order ?? 0))
const box = { src: 'markup-std', size: 2.5, bgPad: 2, border: 'box', lineSpacing: 1.3, borderWeight: 0.35 }
const spec = ['SPECIFICATIONS - {room}', '{job}', '',
  'FRONTS + PANELS', 'Veneer Blackbutt 17, vertical grain', 'Kick: Veneer Blackbutt', '',
  'OPEN SHELF + A/C BOX', 'Veneer Blackbutt 33 (top, bottom, sides, divisions)', 'Open shelf back: Veneer Blackbutt 17', 'A/C removable panel: Veneer Blackbutt 17', '',
  'BENCHTOP', '35 solid timber Blackbutt, clear matt lacquer', '',
  'HANDLES', 'Sharknose finger pull', '',
  'CARCASS', 'PT Black Matt'].join('\n')
const site = ['SITE NOTES', '2271 frame to frame (Rory).', '700 back of jamb to raw wall, no gyprock on the wall.',
  'Joinery flush with the jamb face. Door jamb sticks out 14.', '2228 raw floor to underside of shadow,',
  '14 timber floor -> shelf top 2214 FFL, bench 900 FFL.', '14 timber lining both ends BY OTHERS (shown, no CNC).',
  'A/C box size TBC. Shadow gap 35 TBC.', 'Shelf nosings left off for now (may add later).'].join('\n')
// Elevation frame: x along Wall 2 (0-2271), y = -height AFF.
const E = { view: 'elevation', wall_id: wall2.id, wall_side: 'face', kind: 'text' }
const rows = [
  { view: 'plan', cad_layer_id: GENERAL, kind: 'text', text: spec, geom: { at: { x: 3400, y: -400 }, width: 90 }, style: { ...box, block: 'Spec block' } },
  { view: 'plan', cad_layer_id: SITE, kind: 'text', text: site, geom: { at: { x: 3400, y: 1100 }, width: 90 }, style: box },
  { ...E, cad_layer_id: GENERAL, text: 'A/C BOX - REMOVABLE PANEL, EXHAUST SLOTS TBC. SIZE TBC', geom: { at: { x: 1137, y: -2440 }, width: (1150 - 60) / 20 }, style: { size: 2.5, align: 'center' } },
  { ...E, cad_layer_id: GENERAL, text: 'UNDERMOUNT SS SINK + HOT WATER UNIT BY OTHERS', geom: { at: { x: 1160, y: -760 }, width: (1141 - 60) / 20 }, style: { size: 2.5, align: 'center' } },
  { ...E, cad_layer_id: GENERAL, text: '14 TIMBER LINING BY OTHERS', geom: { at: { x: -700, y: -1400 }, leader: [{ x: 7, y: -1350 }, { x: -150, y: -1350 }] }, style: { size: 2.5 } },
  { ...E, cad_layer_id: GENERAL, text: '14 TIMBER LINING BY OTHERS', geom: { at: { x: 2450, y: -1400 }, leader: [{ x: 2264, y: -1350 }, { x: 2430, y: -1350 }] }, style: { size: 2.5 } },
  { ...E, cad_layer_id: SITE, text: '35 SHADOW GAP TBC', geom: { at: { x: 2450, y: -2300 }, leader: [{ x: 2000, y: -2231 }, { x: 2430, y: -2260 }] }, style: { size: 2.5 } },
]
for (const row of rows) {
  const r = await sb.from('room_annotations').insert({ room_id: R, wall_id: null, ...row, sort_order: ++so }).select('id').single()
  console.log(row.view, row.text.split('\n')[0], r.error?.message ?? r.data.id)
}
