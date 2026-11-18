// RHK6571 Kitchen rev 3: Mark's site measure 2026-11-18 (+ his answers the same day).
// El B 2448 o/a: BC-07 450 drawers out, BC-04 blind corner 1300 -> 1785 with 2 doors, D/W moves up next to the end,
// BC-06 end panel at the waterfall (glued to it), top + WF end out 35; overheads WC-05/06 917.5 to keep the end line.
// Overheads 710 high, tops 2180 (room wall_cabinet_top). BC-09 inner cutlery drawer. WC-03 duct out the back wall:
// 200 hole in the back, shelf up to 500, no flue notch / box. Sink -> Fienza Kuro 68613 double bowl U/M centred on the doors.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '5a1ef0f2-d86e-4c67-8b0e-df4a80dd09c3', BT2 = 'f8776d8b-baab-41c9-8a36-f5a4513da440'
const SINK_FX = '99782f3f-378c-48eb-b8e5-a72a9d75f59d', TAP_FX = '4e8d8ddc-12cb-42d4-aff0-8218951aa98c', DW_FX = '931293a6-5717-4643-ae71-577323460252'
const BACKUP = process.argv[2]
const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── Backup of everything touched ─────────────────────────────────
const cabs = chk('cabs', await sb.from('cabinet_instances').select('*').eq('room_id', R))
const by = l => cabs.find(c => c.label === l)
fs.writeFileSync(BACKUP, JSON.stringify({
  room: chk('room', await sb.from('rooms').select('*').eq('id', R)),
  cabs, fixtures: chk('fx', await sb.from('room_fixtures').select('*').eq('room_id', R)),
  benchtops: chk('bt', await sb.from('benchtop_instances').select('*').eq('room_id', R)),
  annotations: chk('ann', await sb.from('room_annotations').select('*').eq('room_id', R)),
}, null, 1))
console.log('backup', BACKUP)

// ── DB edits (before the canvas loads) ───────────────────────────
chk('room', await sb.from('rooms').update({ wall_cabinet_top: 2180 }).eq('id', R))
// BC-04: blind 633.5 | door | door (hinges outside).
const g4 = by('BC-04').face_grid
chk('bc04', await sb.from('cabinet_instances').update({ face_grid: {
  cols: [g4.cols[0], { col_index: 1, width_locked: false }, { col_index: 2, width_locked: false }], rows: g4.rows,
  zones: [g4.zones[0], { col_index: 1, row_index: 0, face_type: 'door', hinge_side: 'left' }, { col_index: 2, row_index: 0, face_type: 'door', hinge_side: 'right' }],
} }).eq('id', by('BC-04').id))
// BC-09: top drawer (row 1) main box 450 x 178 Silk White, room for the inner drawer above.
const g9 = by('BC-09').face_grid
chk('bc09', await sb.from('cabinet_instances').update({ face_grid: { ...g9, zones: g9.zones.map(z => z.row_index === 1
  ? { ...z, drawer_type_config: { type: 'system', slide_product_id: '04cf0ad3-7ee1-418e-845e-7a95d399060f' } } : z) } }).eq('id', by('BC-09').id))
// WC-03: duct out the back wall above the hood (273 high): 200 hole centre 385 up (285-485 = 1755-1955 AFF, under the 2000 brick line), shelf at 500.
chk('wc03', await sb.from('cabinet_instances').update({ rangehood: { ...by('WC-03').rangehood, duct: { out: 'back', dia: 200, h: 385 }, shelf_h: 500 } }).eq('id', by('WC-03').id))
// Benchtop 2: north end 1631 -> 1596 (2448 o/a from the corner incl the 20 waterfall).
const bt = chk('bt2', await sb.from('benchtop_instances').select('*').eq('id', BT2).single())
const mv = p => p.y === 1631 ? { ...p, y: 1596 } : p
chk('bt2u', await sb.from('benchtop_instances').update({
  polygon: bt.polygon.map(mv), segments: bt.segments.map(s => ({ ...s, p0: mv(s.p0), p1: mv(s.p1) })),
  notes: '20mm stone Ambassador Dapple White, El B, 600 deep, 2448 from the corner incl 20 waterfall at the north end (site 18/11). Runs through the corner; El C top joins along its front line. Fienza Kuro 68613 U/M double bowl over BC-04 doors (polished cut-out).',
}).eq('id', BT2))
// Sink catalogue row (stand-in 3D = Abi Zalo double bowl).
const NAME = 'Fienza Kuro Granite Double Bowl Sink 29L/29L (Matte Black)'
let sink = chk('c?', await sb.from('fixture_catalog').select('*').eq('name', NAME))[0]
if (!sink) {
  const src = chk('src', await sb.from('fixture_catalog').select('*').eq('id', '88593274-22ee-409c-af80-1c7254bb639a').single())
  sink = chk('cins', await sb.from('fixture_catalog').insert({ ...Object.fromEntries(Object.entries(src).filter(([k]) => !['id', 'created_at', 'updated_at'].includes(k))),
    name: NAME, brand: 'Fienza', model_no: '68613', width: 762, depth: 457, height: 220, bench_drop: 220, colour: '#2a2a2a',
    cutout_shape: 'rect', cutout_w: 712, cutout_d: 406, cutout_radius: 15, cutout_off_x: 0, cutout_off_y: 0,
    notes: 'Top or undermount; bowls 341 + 30 + 341 x 406 inside, 205 deep; 762 x 457 x 220 overall. Cut-out = undermount (bowls 712 x 406 R15). 3D = Abi Zalo double bowl stand-in. Spec: RHK6571 _JOBS APPLIANCES (NCP via Geraldine 16/11/2026).' }).select('*').single())
  console.log('catalogue +', sink.id)
}
const BODY = ['category', 'kind', 'name', 'brand', 'model_no', 'width', 'depth', 'height', 'mount', 'colour', 'model_url', 'model_format', 'model_scale', 'model_rot_x', 'model_rot_y', 'model_off_x', 'model_off_y', 'model_off_z', 'cutout_shape', 'cutout_w', 'cutout_d', 'cutout_radius', 'cutout_off_x', 'cutout_off_y', 'cut_benchtop', 'bench_drop', 'plan_shape', 'elev_shape', 'resizable', 'stretch']
chk('sinkfx', await sb.from('room_fixtures').update({ ...Object.fromEntries(BODY.map(k => [k, sink[k]])), catalog_id: sink.id,
  label: 'Fienza Kuro 68613 granite double bowl, Matte Black - UNDERMOUNT (762 x 457, bowls 341 + 341 x 406)', display_name: null }).eq('id', SINK_FX))
// BC-07 (the 450 drawers) out - Mark's markup "delete drws".
const del = await sb.from('cabinet_instances').delete().eq('id', by('BC-07').id)
console.log('BC-07 delete:', del.error?.message ?? 'ok')

// ── Canvas: sizes / offsets / poses through the real paths ───────
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 600000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  const load = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 180000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(5000) }
  const api = async (f, ...a) => { const r = await page.evaluate(([f, a]) => window.__canvasApi[f](...a), [f, a]); await sleep(1800); return r }
  await load()
  // El B base: right to left so nothing overlaps on the way.
  await api('updateCabinet', 'BC-06', { offset: 2411.5 })
  await api('updateCabinet', 'BC-05', { offset: 1785 })
  await api('updateCabinet', 'BC-04', { dx: 1785 })
  // El B overheads: end line follows the base (+35).
  await api('updateCabinet', 'WC-07', { offset: 2435 })
  await api('updateCabinet', 'WC-06', { offset: 1517.5, dx: 917.5 })
  await api('updateCabinet', 'WC-05', { dx: 917.5 })
  await api('updateCabinet', 'WC-14', { dx: 1835 })
  // All overheads 710 (tops 2180, underside stays 1470).
  for (const l of ['WC-01', 'WC-02', 'WC-03', 'WC-04', 'WC-05', 'WC-06', 'WC-07', 'WC-08', 'WC-09', 'WC-10', 'WC-11', 'WC-12']) await api('updateCabinet', l, { dy: 710 })
  for (const l of ['WC-13', 'WC-14', 'WC-15', 'WC-16']) await api('updateCabinet', l, { dz: Number(by(l).dz) })   // re-cut the under panels
  // Fixtures (room coords, rot 270 on Wall 4: y = 4044 - offset; back-left corner).
  const C = 4044 - (633.5 + 1785) / 2   // centre of the door pair (offset 1209.25)
  console.log('sink', JSON.stringify(await api('updateFixture', SINK_FX, { x: 2290, y: C + 381, z: 660 })))
  console.log('tap', JSON.stringify(await api('updateFixture', TAP_FX, { x: 2225, y: C + 30 })))
  console.log('dw', JSON.stringify(await api('updateFixture', DW_FX, { x: 2210, y: 4044 - 1806.5 })))
  // BC-09 inner drawer: 95 Silk White box 25 over the top drawer's main box.
  const rp9 = await api('getResolved', 'BC-09')
  const stk = rp9.drawer_stacks.map(s => ({ y: Math.min(...s.box_parts.map(p => p.Y)), h: Math.max(...s.box_parts.map(p => p.Y + (p.part_type === 'db_bottom' ? p.DZ : p.DX))) }))
  const bottom = rp9.case_parts.find(p => p.part_key === 'bottom')
  const floor = bottom.Y + bottom.DZ
  console.log('BC-09 stacks', JSON.stringify(stk), 'floor', floor)
  const top = stk.reduce((a, b) => b.y > a.y ? b : a)
  const yPos = Math.round(top.h + 25 - floor)
  const ig = by('BC-09').internal_grid
  chk('bc09i', await sb.from('cabinet_instances').update({ internal_grid: { ...ig, tree: { type: 'open', fittings: [{ type: 'inner_drawer', y_locked: true, y_position: yPos, slide_product_id: '531cd069-c633-4177-a9f9-4a09cf245493' }] } } }).eq('id', by('BC-09').id))
  console.log('inner y_position', yPos)
  await load()
  await api('updateCabinet', 'BC-09', { dy: 740 })
  await api('updateCabinet', 'WC-03', { dy: 710 })
  const st = await page.evaluate(() => window.__canvasApi.getState())
  for (const c of st.cabinets.filter(c => ['Wall 4', 'Wall 3'].includes(c.wall))) console.log('  ', c.label, c.wall, c.offset, c.dx, c.dy)
  for (const f of st.fixtures) console.log('  FX', f.name.slice(0, 40), f.x, f.y, f.cabinet, JSON.stringify(f.clash))
  const r3 = await api('getResolved', 'WC-03')
  console.log('WC-03 back', JSON.stringify(r3.case_parts.filter(p => p.part_key === 'back').map(p => [p.DX, p.DY, JSON.stringify(p.cutouts)])), 'rh parts', r3.case_parts.filter(p => p.part_key.startsWith('rh:')).length,
    'shelves', JSON.stringify(r3.internal_parts.map(p => [p.part_type, p.Y])), 'faces', JSON.stringify(r3.face_zones.map(z => [z.face_type, z.DY, z.Y])))
  const r9 = await api('getResolved', 'BC-09')
  console.log('BC-09 int', JSON.stringify((r9.internal_parts ?? []).map(p => [p.part_type, p.Y])), 'stacks', JSON.stringify(r9.drawer_stacks.map(s => [s.inner ?? null, Math.min(...s.box_parts.map(p => p.Y))])))
  const issues = await page.evaluate(() => window.__canvasApi.getIssues())
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) console.log('  ISSUE', ci.label, e.code, e.message)
} finally { await browser.close() }
console.log('done')
