// RHK6478 WIP pre-nest (Mark 2026-11-22):
//  1. Fillers 18 seen on edge (face + back against the wall / cabinet), front edge taped only - Wall 2:
//     TC-01 TFKW 30 -> TFK 70 x 18 side-on (TC-02 open shelves 238 -> 250, left edge to 18);
//     BC-02 BFK 30 -> 18 side-on (BC-01 1085 -> 1097); WC-03 WEP 30 -> WF-L 18 side-on, front flush with the
//     WC-02 open unit (WC-02 1085 -> 1097, its LED route +12). Wall 5 (BC-05 12 / WC-04 30 / TC-06 50) left for Mark.
//  2. Panels one long edge taped (front): TC-03, TC-04, TC-07, BC-06.
//  3. TC-04 up on the kick (pos_z 100, 2262) and the kick run through: TC-06 | TC-05 | TC-04 | BC-04 sink
//     (BC-04 joins KICK 2 - same detach transform as Join kicks), KICK 2 refit 1718 long, left return (TOERETL)
//     at the D/W opening.
//  4. Library: DTC Dragon Pro (Inner) back = normal Dragon Pro back (DB_BACK_HEIGHT_ADJUST 12, back / bottom
//     12.5 up, was 0 / 14 - inner backs came out 12 too high, RHK6581).
//  5. CAD: spec block (2pac Dulux White Beach Quarter 25W, D/W fully integrated), LED notes -> "LED STRIP LIGHT"
//     + arrow to the overhead underside, GPO note (cut-out by electrician), I/O 200 x 200 box-out drawn behind TC-02.
// Run: node z_plan_automation/_tmp-6478-wip-prenest.mjs go
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer-core'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) { console.log('ERR', t, r.error.message); process.exit(1) } return r.data }
const R = 'cb47d462-90eb-4ba0-8e6e-ca4d978628ae', W2 = 'a8f5b817-1b73-4fe7-8d8f-6ce5ba54ab2f', W5 = '3408b48c-6dec-4872-933b-48de834222ec'
const TFK = '48ab05ae-eca2-4058-bc41-a17ae81800e6', INNER = 'b35608fe-9a09-4b6f-977c-343d5650c5cc'
const cabs = chk('cabs', await sb.from('cabinet_instances').select('*').eq('room_id', R))
const by = l => { const c = cabs.find(x => x.label === l); if (!c) { console.log('no', l); process.exit(1) } return c }
const cps = chk('cps', await sb.from('cabinet_custom_parts').select('*').in('cabinet_instance_id', cabs.map(c => c.id)))
const cp = l => cps.filter(p => p.cabinet_instance_id === by(l).id)
const wfl = chk('wfl', await sb.from('cabinet_definitions').select('id').eq('name', 'WF-L').single()).id
const FRONT_ONLY = { edge_top: false, edge_bottom: false, edge_left: false, edge_right: true }
if (process.argv[2] !== 'go') { console.log('dry run - pass go'); process.exit(0) }

// guards: state as queried 2026-11-22
const expect = { 'TC-01': [0, 30], 'TC-02': [30, 238], 'BC-01': [1236, 1085], 'BC-02': [2321, 30], 'WC-02': [1236, 1085], 'WC-03': [2321, 30], 'TC-04': [951, 18], 'BC-04': [1721, 770] }
for (const [l, [x, w]] of Object.entries(expect)) if (Math.abs(by(l).pos_x - x) > 0.5 || Math.abs(by(l).dx - w) > 0.5) { console.log('moved since query', l, by(l).pos_x, by(l).dx); process.exit(1) }
if (by('BC-04').kick_run_id || !by('BC-04').has_toekick || by('TC-04').pos_z !== 0) { console.log('kick state changed'); process.exit(1) }

// 1. fillers
const side = (l, ex) => { const [p] = cp(l); if (cp(l).length !== 1 || p.orientation === 'side') { console.log(l, 'unexpected', cp(l).length, p?.orientation); process.exit(1) } return p }
const upd = async (t, tbl, id, u) => chk(t, await sb.from(tbl).update(u).eq('id', id))
{ const p = side('TC-01')
  await upd('TC-01 cp', 'cabinet_custom_parts', p.id, { orientation: 'side', x: 0, dx: 70, ...FRONT_ONLY,
    expressions: { y: 'cab.kick', z: 'cab.d + t.door + 2 - 70', dx: '70', dy: 'cab.h - cab.kick', dz: 't.exposed' } })
  await upd('TC-01', 'cabinet_instances', by('TC-01').id, { dx: 18, cabinet_definition_id: TFK,
    notes: '18 side-on filler (TFK, on its kick) to Wall 1: 70 x 18 Satin Board 2pac 25W, front edge flush with the TC-02 shelves, taped front only (Mark 2026-11-22)' })
  await upd('TC-02', 'cabinet_instances', by('TC-02').id, { pos_x: 18, dx: 250 }) }
{ const p = side('BC-02')
  await upd('BC-02 cp', 'cabinet_custom_parts', p.id, { orientation: 'side', x: 0, dx: 70, ...FRONT_ONLY,
    expressions: { y: 'cab.kick', z: 'cab.d + 2 + t.exposed - 70', dx: '70', dy: 'cab.h - cab.kick', dz: 't.exposed' } })
  await upd('BC-02', 'cabinet_instances', by('BC-02').id, { pos_x: 2333, dx: 18,
    notes: '18 side-on filler (BFK) to Wall 3: 70 x 18 Satin Board 2pac 25W, front flush with the drawer fronts, taped front only (Mark 2026-11-22)' })
  await upd('BC-01', 'cabinet_instances', by('BC-01').id, { dx: 1097 }) }
{ const p = side('WC-03')
  await upd('WC-03 cp', 'cabinet_custom_parts', p.id, { name: 'Filler', orientation: 'side', x: 0, dx: 70, ...FRONT_ONLY,
    expressions: { z: 'cab.d - 70', dx: '70', dy: 'cab.h', dz: 't.exposed' } })
  await upd('WC-03', 'cabinet_instances', by('WC-03').id, { pos_x: 2333, dx: 18, cabinet_definition_id: wfl,
    notes: '18 side-on filler (WF-L) to Wall 3: 70 x 18 Satin Board 2pac 25W, front flush with the WC-02 open unit, taped front only (Mark 2026-11-22)' })
  await upd('WC-02', 'cabinet_instances', by('WC-02').id, { dx: 1097 })
  const led = chk('led', await sb.from('part_operations').select('id,pos_y,size_dy').eq('source_cabinet_id', by('WC-02').id).eq('operation_type', 'route').single())
  await upd('WC-02 led', 'part_operations', led.id, { size_dy: led.size_dy + 12, pos_y: led.pos_y + 6 }) }
console.log('fillers done')

// 2. panels: front long edge only
for (const l of ['TC-03', 'TC-04', 'TC-07', 'BC-06']) {
  const [p] = cp(l); if (p.orientation !== 'side') { console.log(l, 'not side', p.orientation); process.exit(1) }
  await upd(l, 'cabinet_custom_parts', p.id, FRONT_ONLY)
}
console.log('panel edging done')

// 3. kick through: TC-04 + BC-04 into KICK 2's run (Join kicks' detach transform), refit, left return
const run = by('KICK 2').kick_run_id
await upd('TC-04 up', 'cabinet_instances', by('TC-04').id, { pos_z: 100, dy: 2262, kick_run_id: run })
await upd('BC-04 up', 'cabinet_instances', by('BC-04').id, { pos_z: 100, dy: 800, has_toekick: false, kick_run_id: run })
// computeKickAssemblyGeom: Wall 5 runs from x 2351 towards 0, leftmost member = BC-04 (pos_x 1721), right end = TC-06 at x 3
await upd('KICK 2', 'cabinet_instances', by('KICK 2').id, { pos_x: 1721, pos_y: 2202, dx: 1718,
  rule_overrides: { ...(by('KICK 2').rule_overrides ?? {}), TOERETL: true } })
console.log('kick run through + left return')

// 4. library inner Dragon Pro back
const m = chk('m', await sb.from('drawer_box_methods').select('rules').eq('id', INNER).single())
await upd('inner method', 'drawer_box_methods', INNER, { rules: { ...m.rules, DB_BACK_HEIGHT_ADJUST: 12, DB_BACK_Y_OFFSET: 12.5, DB_DADO_HEIGHT: 12.5 } })
console.log('inner method was', JSON.stringify({ h: m.rules.DB_BACK_HEIGHT_ADJUST, y: m.rules.DB_BACK_Y_OFFSET, d: m.rules.DB_DADO_HEIGHT }))

// 5. CAD
const anns = chk('anns', await sb.from('room_annotations').select('*').eq('room_id', R))
const ann = id => { const a = anns.find(x => x.id.startsWith(id)); if (!a) { console.log('no ann', id); process.exit(1) } return a }
const spec = ann('5e204933')
await upd('spec', 'room_annotations', spec.id, { text: spec.text
  .replace('FRONTS + PANELS\n2 Pac - colour TBC', 'FRONTS + PANELS\n18mm 2pac - Dulux White Beach Quarter (25W)\nKick 100: to match fronts\nD/W: fully integrated, 2pac panel by RHK\n\nHANDLES\n{handles}') })
const gpo = ann('95bc18e2')
await upd('gpo', 'room_annotations', gpo.id, { text: 'GPO INSIDE DRAWER\ncut-out by electrician' })
// LED: one note per wall, arrow up to the overhead underside (1530 AFF); the two route-detail notes go
const led = async (id, at, tip) => {
  const a = ann(id)
  await upd('led ' + id, 'room_annotations', a.id, { text: 'LED STRIP LIGHT', geom: { at, width: 40 }, style: { size: 2.5, align: 'center' } })
  chk('arrow', await sb.from('room_annotations').insert({ room_id: R, view: 'elevation', wall_id: a.wall_id, wall_side: 'face', kind: 'line',
    geom: { pts: [{ x: at.x, y: at.y - 8 }, tip] }, style: { weight: 0.18, arrowEnd: 'closed', arrowSize: 2 }, sort_order: 61 }))
}
await led('71c7a8d6', { x: 1780, y: -1420 }, { x: 1780, y: -1530 })   // Wall 2: WC-02 open unit underside
await led('c43f5162', { x: 700, y: -1420 }, { x: 700, y: -1530 })     // Wall 5: WC-11 under panel underside
for (const id of ['578578f4', 'c98479e3']) {   // automation notes 2026-11-04, never edited (updated_at = created_at)
  const a = ann(id); if (a.updated_at !== a.created_at) { console.log('edited by Mark, kept', id); continue }
  const d = await sb.from('room_annotations').delete().eq('id', a.id)
  console.log('del', id, d.error ? 'KEPT: ' + d.error.message : 'ok')
}
// I/O box-out 200 x 200 in the Wall 1 / Wall 2 corner, behind TC-01 / TC-02
const io = [
  { view: 'plan', wall_id: null, wall_side: null, kind: 'rect', geom: { a: { x: 0, y: 0 }, b: { x: 200, y: 200 } }, style: { weight: 0.25, dash: 'dashed' } },
  { view: 'plan', wall_id: null, wall_side: null, kind: 'text', geom: { at: { x: 100, y: 130 }, width: 30 }, text: 'I/O\n200 x 200', style: { size: 2.5, align: 'center' } },
  { view: 'elevation', wall_id: W2, wall_side: 'face', kind: 'rect', geom: { a: { x: 0, y: 0 }, b: { x: 200, y: -2380 } }, style: { weight: 0.25, dash: 'dashed' } },
  { view: 'elevation', wall_id: W2, wall_side: 'face', kind: 'text', geom: { at: { x: 100, y: -2150 }, width: 30 }, text: 'I/O\n200 x 200\nBOX-OUT\nbehind', style: { size: 2.5, align: 'center' } },
]
chk('io', await sb.from('room_annotations').insert(io.map((a, i) => ({ room_id: R, sort_order: 70 + i, ...a }))))
console.log('CAD done')

// re-resolve
const sleep = ms => new Promise(r => setTimeout(r, ms))
const order = ['TC-01', 'TC-02', 'BC-01', 'BC-02', 'KICK 1', 'WC-02', 'WC-03', 'TC-03', 'TC-07', 'TC-04', 'BC-04', 'TC-05', 'TC-06', 'BC-06', 'BC-05', 'BC-07', 'WC-05', 'WC-06', 'WC-11', 'KICK 2']
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
