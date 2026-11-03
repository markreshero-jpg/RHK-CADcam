// Temp: RHK6586 Mark 2026-11-01 robe/study rev 3.
//  1. BC-08 corner shelf out flush (gable full depth 482.5 = drawer front); filler flush with the open face (FACINS).
//     BC-09 gets its missing Applied Panel (482.5 deep, doubles the shelf gable).
//  2. Robe up: wall cab top 2095 -> 2330, bulkhead 150 (2330-2480).
//  3. 16.5 pairs glued up + edged as one 33: halves untaped, each half commented.
//  4. BC-03 drawer box dropped 16.5 (Face Grid box_raise -16.5) - no carcass bottom.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'd4fdad8f-bcbf-4c38-a6ad-b6e0cee7ca8d', KIT = process.argv[2]
const chk = (l, r) => { console.log(l, r.error ? 'ERR ' + r.error.message : 'ok ' + (r.data?.length ?? '')); if (r.error) process.exit(1) }
const cabs = async room => (await sb.from('cabinet_instances').select('*').eq('room_id', room)).data
const study = await cabs(R)
const C = l => study.find(c => c.label === l)
const upd = async (c, patch) => chk(c.label, await sb.from('cabinet_instances').update(patch).eq('id', c.id).select('id'))

if (!process.argv.includes('--resolve-only')) {
  // 1. shelf
  const W = 507.5, D = 482.5, GI = W - 16.5, T = GI - D, s = 40 / Math.SQRT2
  const footprint = { params: {}, segments: [
    { type: 'line', p0: { x: T, y: 0 }, p1: { x: W, y: 0 }, edge: { id: 'back', role: 'back' } },
    { type: 'line', p0: { x: W, y: 0 }, p1: { x: W, y: D }, edge: { id: 'right', role: 'side' } },
    { type: 'line', p0: { x: W, y: D }, p1: { x: GI, y: D }, edge: { id: 'end', role: 'side' } },
    { type: 'line', p0: { x: GI, y: D }, p1: { x: T + s, y: s }, edge: { id: 'front', role: 'front', sub: 'open' } },
    { type: 'line', p0: { x: T + s, y: s }, p1: { x: T, y: 0 }, edge: { id: 'filler', role: 'front', filler: { width: 40, cleat: 60 } } },
  ] }
  const b8 = C('BC-08')
  await upd(b8, { footprint, dz: D, rule_overrides: { ...b8.rule_overrides, FACINS: 0.01 },
    edge_overrides: { ...b8.edge_overrides, case_right_side: { top: false, bottom: false, left: false, right: false } },
    part_comments: { ...b8.part_comments, case_right_side: 'GLUE UP WITH BC-09 PANEL BEFORE ASSEMBLY - EDGE AS ONE 33' },
    notes: 'Study open corner shelf under the 45 end of the desk. Open 45 face flush with the drawer front at the gable, 40 filler (flush) at the wall end, Boston Oak all over, 2 fixed shelves, on a kick. Right gable glued to BC-09 = 33.' })
  // BC-09: its panel part (copy of BC-02's, depth = cab.d so it matches the gable)
  const b9 = C('BC-09'), b2 = C('BC-02')
  const { data: cp2 } = await sb.from('cabinet_custom_parts').select('*').eq('cabinet_instance_id', b2.id).single()
  await sb.from('cabinet_custom_parts').delete().eq('cabinet_instance_id', b9.id)
  const { id: _i, created_at: _c, updated_at: _u, ...cp } = cp2
  const ins = await sb.from('cabinet_custom_parts').insert({ ...cp, cabinet_instance_id: b9.id, dx: D, expressions: { ...cp.expressions, dx: 'cab.d' },
    edge_top: false, edge_bottom: false, edge_left: false, edge_right: false }).select('id').single()
  chk('BC-09 panel', { data: [ins.data], error: ins.error })
  await upd(b9, { dz: D, part_comments: { [`custom_${ins.data.id}`]: 'GLUE UP WITH BC-08 RIGHT GABLE - EDGE AS ONE 33' },
    notes: 'Study end panel glued to the corner shelf gable (gable + panel = 33, edged as one), to the floor, covers the kick end' })

  // 4. drawer box down 16.5
  const b3 = C('BC-03')
  await upd(b3, { face_grid: { ...b3.face_grid, zones: b3.face_grid.zones.map(z => z.face_type === 'drawer_face' ? { ...z, box_raise: -16.5 } : z) } })

  // 3. the other 16.5 pairs: halves untaped + commented
  const pair = async (room, a, b) => {
    const list = room === R ? study : await cabs(room)
    for (const [x, y] of [[a, b], [b, a]]) {
      const c = list.find(q => q.label === x)
      const { data: ps } = await sb.from('cabinet_custom_parts').select('id').eq('cabinet_instance_id', c.id)
      chk(`${x} edges`, await sb.from('cabinet_custom_parts').update({ edge_top: false, edge_bottom: false, edge_left: false, edge_right: false }).eq('cabinet_instance_id', c.id).select('id'))
      chk(`${x} comment`, await sb.from('cabinet_instance' + 's').update({ part_comments: { ...(c.part_comments ?? {}), ...Object.fromEntries(ps.map(p => [`custom_${p.id}`, `GLUE UP WITH ${y} - EDGE AS ONE 33`])) } }).eq('id', c.id).select('id'))
    }
  }
  await pair(R, 'BC-01', 'BC-02'); await pair(R, 'TC-01', 'TC-02')
  await pair(KIT, 'TC-03', 'TC-04'); await pair(KIT, 'TC-05', 'TC-06')

  // 2. robe up, bulkhead 150
  chk('room', await sb.from('rooms').update({ wall_cabinet_top: 2330 }).eq('id', R).select('id'))
  const UP = 235
  for (const l of ['TC-01', 'TC-02']) await upd(C(l), { dy: C(l).dy + UP })
  for (const l of ['TC-03', 'TC-04', 'TC-05', 'WC-01', 'WC-03']) await upd(C(l), { dy: C(l).dy + UP,
    ...(C(l).notes ? { notes: C(l).notes.replace('1460-2093', '1460-2328').replace('up to 2095', 'up to 2330') } : {}) })
  await upd(C('WC-02'), { dy: 150, notes: C('WC-02').notes.replace('2095-2480', '2330-2480') })
  chk('ann', await sb.from('room_annotations').update({ text: '150MM BULKHEAD', geom: { at: { x: 2425.581314213632, y: -2420 }, width: 33 } })
    .eq('id', '994df48a-9ee6-446d-b8ab-9b50942334d5').select('id'))
}

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], protocolTimeout: 900000 })
const sleep = ms => new Promise(r => setTimeout(r, ms))
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 90000 }); await sleep(4000)
  const st = await page.evaluate(() => window.__canvasApi.getState())
  for (const c of st.cabinets.filter(c => c.label !== 'KICK 1')) {
    await page.evaluate(([id, dz]) => window.__canvasApi.updateCabinet(id, { dz }), [c.id, c.dz]); await sleep(1500)
  }
  await sleep(2000)
  const issues = await page.evaluate(() => window.__canvasApi.getIssues())
  for (const c of issues) for (const e of [...c.errors, ...c.warnings]) console.log(`  ${c.label} ${e.code}: ${e.message}`)
} finally { await browser.close() }
const after = await cabs(R)
for (const l of ['BC-08', 'BC-09', 'TC-01', 'TC-03', 'WC-01', 'WC-02']) { const c = after.find(x => x.label === l); console.log(l, 'dy', c.dy, 'dz', c.dz) }
const { data: cp } = await sb.from('cabinet_custom_parts').select('cabinet_instance_id,dx,dy').in('cabinet_instance_id', after.filter(c => /^(BC-0[129]|TC-0[12])$/.test(c.label)).map(c => c.id))
console.log('panels', JSON.stringify(cp.map(p => [after.find(c => c.id === p.cabinet_instance_id).label, p.dx, p.dy])))
const { data: ds } = await sb.from('drawer_box_parts').select('part_type,pos_y').eq('cabinet_instance_id', C('BC-03').id)
console.log('BC-03 box', JSON.stringify(ds))
const { data: g } = await sb.from('case_parts').select('part_key,dx,dy').eq('cabinet_instance_id', C('BC-08').id)
console.log('BC-08', JSON.stringify(g))
