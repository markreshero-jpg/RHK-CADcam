// RHK6478 WIP rev (Mark 2026-11-22, after the pre-nest pass):
//  - Wall 5 fillers 18 seen on edge (front edge taped only): BC-05 12 -> 18 (BFF to the floor), WC-04 30 -> 18 (WF-L),
//    TC-06 50 -> 18 (TFK, in the kick run). Everything shifted across (Wall 5 runs from x 2351 towards 0):
//    BC-06 / D/W / sink move 6, TC-04 6, the pantry TC-05 880 -> 906 (takes the 26), TC-06 at the wall end.
//    Overheads WC-05 / WC-06 685 -> 694 each (18 -> 1406, sink right edge / TC-04), WC-11 under panel 1388
//    (LED route +18), shadowlines WC-09 0-1424 / WC-10 1424-2348, Benchtop 2 1406, sink / tap / D/W fixtures -6.
//  - D/W kick face: 600 x 100 x 18 custom part on BC-07 in line with KICK 2's face (front 40 back), fixed to the
//    D/W; KICK 2 keeps its return at the D/W opening.
//  - D/W finger rail: resolver z_handles D28 gives BC-07 its own 80 rail; the optimiser joins it to BC-04's (D19).
//  - TC-05 bottom inner drawer: box 2 up off the carcass bottom (y 30.5 -> 18.5); the others stay locked.
// Run: node z_plan_automation/_tmp-6478-wip-wall5.mjs go
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer-core'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) { console.log('ERR', t, r.error.message); process.exit(1) } return r.data }
const R = 'cb47d462-90eb-4ba0-8e6e-ca4d978628ae'
const TFK = '48ab05ae-eca2-4058-bc41-a17ae81800e6'
const cabs = chk('cabs', await sb.from('cabinet_instances').select('*').eq('room_id', R))
const by = l => { const c = cabs.find(x => x.label === l); if (!c) { console.log('no', l); process.exit(1) } return c }
const cps = chk('cps', await sb.from('cabinet_custom_parts').select('*').in('cabinet_instance_id', cabs.map(c => c.id)))
const cp = l => cps.filter(p => p.cabinet_instance_id === by(l).id)
const wfl = chk('wfl', await sb.from('cabinet_definitions').select('id').eq('name', 'WF-L').single()).id
const FRONT_ONLY = { edge_top: false, edge_bottom: false, edge_left: false, edge_right: true }
const upd = async (t, tbl, id, u) => chk(t, await sb.from(tbl).update(u).eq('id', id))
if (process.argv[2] !== 'go') { console.log('dry run - pass go'); process.exit(0) }

// guards
const expect = { 'BC-05': [2351, 12], 'BC-06': [2339, 18], 'BC-07': [2321, 600], 'BC-04': [1721, 770], 'TC-04': [951, 18], 'TC-05': [933, 880],
  'TC-06': [53, 50], 'WC-04': [2351, 30], 'WC-05': [2321, 685], 'WC-06': [1636, 685], 'WC-11': [2321, 1370], 'WC-09': [2351, 1418], 'WC-10': [933, 930], 'KICK 2': [1721, 1718] }
for (const [l, [x, w]] of Object.entries(expect)) if (Math.abs(by(l).pos_x - x) > 0.5 || Math.abs(by(l).dx - w) > 0.5) { console.log('changed since query', l, by(l).pos_x, by(l).dx); process.exit(1) }

// 1. new pos_x / widths (rot 180: the cabinet spans [pos_x - dx, pos_x])
const plan = { 'BC-05': [2351, 18], 'BC-06': [2333, 18], 'BC-07': [2315, 600], 'BC-04': [1715, 770], 'TC-04': [945, 18], 'TC-05': [927, 906],
  'TC-06': [21, 18], 'WC-04': [2351, 18], 'WC-05': [2333, 694], 'WC-06': [1639, 694], 'WC-11': [2333, 1388], 'WC-09': [2351, 1424], 'WC-10': [927, 924],
  'KICK 2': [1715, 1712] }
for (const [l, [x, w]] of Object.entries(plan)) await upd(l, 'cabinet_instances', by(l).id, { pos_x: x, dx: w })
console.log('Wall 5 shifted')

// fillers side-on
const side = l => { const [p] = cp(l); if (cp(l).length !== 1 || p.orientation === 'side') { console.log(l, 'unexpected', cp(l).length, p?.orientation); process.exit(1) } return p }
await upd('BC-05 cp', 'cabinet_custom_parts', side('BC-05').id, { orientation: 'side', x: 0, dx: 70, ...FRONT_ONLY,
  expressions: { z: 'cab.d + 2 + t.exposed - 70', dx: '70', dy: 'cab.h', dz: 't.exposed' } })
await upd('BC-05', 'cabinet_instances', by('BC-05').id, { notes: '18 side-on filler (BFF, to the floor) to Wall 4: 70 x 18 Satin Board 2pac 25W, front flush with the BC-06 D/W panel, taped front only (Mark 2026-11-22)' })
await upd('WC-04 cp', 'cabinet_custom_parts', side('WC-04').id, { name: 'Filler', orientation: 'side', x: 0, dx: 70, ...FRONT_ONLY,
  expressions: { z: 'cab.d + 2 + t.exposed - 70', dx: '70', dy: 'cab.h', dz: 't.exposed' } })
await upd('WC-04', 'cabinet_instances', by('WC-04').id, { cabinet_definition_id: wfl, notes: '18 side-on filler (WF-L) to Wall 4: 70 x 18 Satin Board 2pac 25W, front flush with the overhead doors, taped front only (Mark 2026-11-22)' })
await upd('TC-06 cp', 'cabinet_custom_parts', side('TC-06').id, { orientation: 'side', x: 0, dx: 70, ...FRONT_ONLY,
  expressions: { y: 'cab.kick', z: 'cab.d + t.door + 2 - 70', dx: '70', dy: 'cab.h - cab.kick', dz: 't.exposed' } })
await upd('TC-06', 'cabinet_instances', by('TC-06').id, { cabinet_definition_id: TFK, notes: '18 side-on filler (TFK, on the kick) to Wall 6: 70 x 18 Satin Board 2pac 25W, front flush with the pantry door, taped front only (Mark 2026-11-22: 18, was 50 for the inner drawers)' })
console.log('fillers side-on')

// WC-11 LED route +18
const led = chk('led', await sb.from('part_operations').select('id,pos_y,size_dy').eq('source_cabinet_id', by('WC-11').id).eq('operation_type', 'route').single())
await upd('WC-11 led', 'part_operations', led.id, { size_dy: led.size_dy + 18, pos_y: led.pos_y + 9 })

// Benchtop 2: 951 -> 945
const bt = chk('bt', await sb.from('benchtop_instances').select('*').eq('room_id', R).eq('label', 'Benchtop 2').single())
const mv = p => (Math.abs(p.x - 951) < 0.5 ? { ...p, x: 945 } : p)
await upd('bt', 'benchtop_instances', bt.id, { polygon: bt.polygon.map(mv), segments: bt.segments.map(s => ({ ...s, p0: mv(s.p0), p1: mv(s.p1) })),
  notes: bt.notes.replace('1400 x 650', '1406 x 650') })
// fixtures follow their cabinets (-6 in plan x)
const fx = chk('fx', await sb.from('room_fixtures').select('id,x,cabinet_id').eq('room_id', R))
for (const f of fx) if ([by('BC-04').id, by('BC-07').id].includes(f.cabinet_id)) await upd('fx', 'room_fixtures', f.id, { x: f.x - 6 })
console.log('benchtop + fixtures')

// 2. D/W kick face on BC-07 (pos_z 100): y -100 down to the floor, in line with KICK 2's face (back at 572, front 590)
const tk = chk('tk', await sb.from('toekick_parts').select('material_id').eq('cabinet_instance_id', by('KICK 2').id).eq('part_key', 'kick_front_face').limit(1))
const kmat = tk[0].material_id
if (!cp('BC-07').some(p => p.name === 'D/W kick face')) {
  const base = cps.find(p => p.part_library_id) ?? cps[0]
  chk('dw kick', await sb.from('cabinet_custom_parts').insert({ cabinet_instance_id: by('BC-07').id, part_library_id: base.part_library_id,
    name: 'D/W kick face', orientation: 'front', x: 0, y: -100, z: 572, dx: 600, dy: 100, dz: 18, expressions: {},
    material_id: kmat, material_override_id: kmat, edge_top: false, edge_bottom: false, edge_left: false, edge_right: false,
    visible: true, no_cnc: false, sort_order: 10 }))
}
await upd('BC-07', 'cabinet_instances', by('BC-07').id, { notes: ((by('BC-07').notes ?? '') + ' | D/W kick face 600 x 100 x 18 in line with KICK 2 (fixed to the D/W); backing rail 80 joins the BC-04 sink rail (Mark 2026-11-22)').trim() })
console.log('D/W kick face, material', kmat)

// 3. TC-05 bottom inner drawer 2 up off the carcass bottom (bottom panel top 16.5)
const g = by('TC-05').internal_grid
const fit = g.tree.children[0].section.fittings
if (fit[0].type !== 'inner_drawer' || fit[0].y_position !== 30.5) { console.log('TC-05 bottom drawer not as expected', JSON.stringify(fit[0])); process.exit(1) }
fit[0].y_position = 18.5
await upd('TC-05 grid', 'cabinet_instances', by('TC-05').id, { internal_grid: g })
console.log('TC-05 bottom drawer y 18.5')

// re-resolve the room
const sleep = ms => new Promise(r => setTimeout(r, ms))
const order = ['BC-05', 'BC-06', 'BC-07', 'BC-04', 'TC-04', 'TC-05', 'TC-06', 'WC-04', 'WC-05', 'WC-06', 'WC-11', 'WC-09', 'WC-10', 'KICK 2']
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); page.on('dialog', d => d.dismiss()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)))
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 240000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 240000 }); await sleep(5000)
  for (const l of order) { await page.evaluate(([i, z]) => window.__canvasApi.updateCabinet(i, { dz: z }), [by(l).id, by(l).dz]); await sleep(1500) }
  await sleep(2000)
  const iss = await page.evaluate(() => window.__canvasApi.getIssues())
  for (const x of iss) for (const e of [...x.errors, ...x.warnings]) console.log('ISSUE', x.label, e.code, e.message)
} finally { await browser.close() }
process.exit(0)
