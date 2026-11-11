// RHK6595 rev 5 (Flavio check measure 10/11/2026, Mark's answers 11/11):
//  1. Wall 2 = 2770 (was 2780): east end comes in 10. BC-05/06 711 -> 706, overheads 3 x 672 -> 668.5 / 669 / 668.5,
//     WUP 2016 -> 2006, bulkhead WC-09 -> 2042.5, KICK 1 -> 2112, Benchtop 2 -> 2770. West end (DW 608.5) unchanged.
//  2. WC-10 right bay: 1 adj shelf (standard pin cluster).
//  3. BC-11: oven 600 to the top, drawer under (no false panels).
//  4. WC-10 480 deep external, front kept where it was (pos_y +210); WF-L fillers WC-15/16 the same.
//  5. Job rule HANDLE_DRILL false (installer drills).
// Before-state -> _tmp-6595-r5-before.json. Run: node z_plan_automation/_tmp-6595-r5.mjs [db|resolve]
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'd113bd53-5e4a-4ded-9592-cc1f7bc0eecb', W1 = '0d747e63-63fa-4bda-ac27-6ff28ab97f0f', W2 = 'c1be3640-632d-4a30-94be-117287719f6d'
const BT2 = '71df84bb-d8a8-4974-b57a-2bb5a1a13196', OVEN = 'f407f777-600c-46b7-b7ac-d110e7dbb7f1', Q = '2a2501f1'
const BEFORE = 'z_plan_automation/_tmp-6595-r5-before.json'
const mode = process.argv[2] ?? 'db'
const ok = (what, r) => console.log(what, r.error?.message ?? 'ok')
// Wall 2 run (rot 180, pos_x = wall start x - offset). New start x 2770.
const W2CABS = { // label: [new pos_x, new dx | null]
  'BC-04': [2770, null], 'BC-05': [2753.5, 706], 'BC-06': [2047.5, 706], 'KICK 1': [2753.5, 2112],
  'WC-01': [2770, null], 'WC-02': [2753.5, null], 'WC-14': [2753.5, null], 'WC-03': [2042.5, null],
  'WC-04': [2024.5, 668.5], 'WC-05': [1356, 669], 'WC-06': [687, 668.5],
  'WC-08': [2770, null], 'WC-09': [2042.5, 2042.5], 'WC-12': [2024.5, 2006],
}
const DEEP = { 'WC-10': 480, 'WC-15': 480, 'WC-16': 480 } // pos_y 204 -> 414
if (mode === 'db') {
  if (fs.existsSync(BEFORE)) throw new Error('before-state exists: already applied?')
  const cabs = (await sb.from('cabinet_instances').select('*').eq('room_id', R)).data
  const byL = Object.fromEntries(cabs.map(c => [c.label, c]))
  const rm = (await sb.from('rooms').select('project_id').eq('id', R)).data[0]
  const allAnn = (await sb.from('room_annotations').select('*').eq('room_id', R)).data
  const before = {
    walls: (await sb.from('walls').select('*').in('id', [W1, W2])).data,
    bt2: (await sb.from('benchtop_instances').select('*').eq('id', BT2)).data[0],
    cabs: cabs.filter(c => W2CABS[c.label] || DEEP[c.label] || c.label === 'BC-11'),
    annots: allAnn.filter(a => a.wall_id === W2 || a.id.startsWith(Q)),
    project: (await sb.from('projects').select('id,rule_overrides').eq('id', rm.project_id)).data[0],
    oven: (await sb.from('room_fixtures').select('*').eq('id', OVEN)).data[0],
  }
  fs.writeFileSync(BEFORE, JSON.stringify(before, null, 1))
  // 1. walls
  ok('Wall 1', await sb.from('walls').update({ pos_x: 2770 }).eq('id', W1))
  ok('Wall 2', await sb.from('walls').update({ pos_x: 2770, length: 2770 }).eq('id', W2))
  for (const [l, [x, dx]] of Object.entries(W2CABS)) {
    const c = byL[l]; if (!c) { console.log(l, 'MISSING'); continue }
    ok(`${l} pos_x ${c.pos_x}->${x}${dx ? ` dx ${c.dx}->${dx}` : ''}`, await sb.from('cabinet_instances').update(dx ? { pos_x: x, dx } : { pos_x: x }).eq('id', c.id))
  }
  // Benchtop 2: east edge x 2780 -> 2770
  const mv = p => (Math.abs(p.x - 2780) < 0.01 ? { ...p, x: 2770 } : p)
  const bt = before.bt2
  ok('Benchtop 2', await sb.from('benchtop_instances').update({
    polygon: bt.polygon.map(mv), segments: bt.segments.map(s => ({ ...s, p0: mv(s.p0), p1: mv(s.p1) })),
  }).eq('id', BT2))
  // Wall 2 elevation markup: x = offset from the east start; the DW end is 10 nearer now, cloud ends at 2770.
  for (const a of before.annots.filter(a => a.wall_id === W2)) {
    const g = structuredClone(a.geom)
    const sh = p => ({ ...p, x: p.x - 10 })
    if (a.id.startsWith('74a8ac3a')) { g.a = sh(g.a); g.b = sh(g.b) }                      // DW dashed box
    else if (a.id.startsWith('7abf847f')) g.at = sh(g.at)                                 // DW text
    else if (a.id.startsWith('0e5b34e1')) g.pts = g.pts.map(p => (p.x === 2780 ? { ...p, x: 2770 } : p)) // bulkhead cloud
    else continue
    ok(`annot ${a.id.slice(0, 8)}`, await sb.from('room_annotations').update({ geom: g }).eq('id', a.id))
  }
  // Mark's wine-rack question -> answered (edited in place)
  const q = before.annots.find(a => a.id.startsWith(Q))
  ok('wine q', await sb.from('room_annotations').update({ text: 'WINE RACK SHELVES 460 DEEP - BOX 480 EXTERNAL (FLAVIO 10/11)' }).eq('id', q.id))
  // 2 + 4. WC-10 / fillers 480, front kept: back 210 off Wall 4
  for (const l of Object.keys(DEEP)) ok(`${l} pos_y`, await sb.from('cabinet_instances').update({ pos_y: 414 }).eq('id', byL[l].id))
  const g = structuredClone(byL['WC-10'].internal_grid)
  g.tree.children[1].section.fittings = [{ type: 'adj_shelf', y_locked: false }]
  ok('WC-10 adj shelf', await sb.from('cabinet_instances').update({ internal_grid: g, notes: 'Open box over the fridge: 3 x 3 half-checked wine cubbies on the left, open bay right with 1 adj shelf. 480 deep external (wine shelves 460), front flush, back 210 off the closure. Carcass as panel' }).eq('id', byL['WC-10'].id))
  // 3. BC-11 oven up, drawer under
  const fg = structuredClone(byL['BC-11'].face_grid)
  fg.rows = [{ row_index: 0, height_locked: false }, { row_index: 1, height: 600, height_locked: true }]
  fg.zones = [{ col_index: 0, face_type: 'drawer_face', row_index: 0 }, { col_index: 0, face_type: 'open', row_index: 1 }]
  ok('BC-11 face', await sb.from('cabinet_instances').update({ face_grid: fg, notes: 'Under-bench oven: Westinghouse WVEP6716SD at the top (cut-out 600), 1 drawer under (CKC 10/11)' }).eq('id', byL['BC-11'].id))
  // 5. no handle holes on this job
  ok('HANDLE_DRILL', await sb.from('projects').update({ rule_overrides: { ...(before.project.rule_overrides ?? {}), HANDLE_DRILL: false } }).eq('id', before.project.id))
} else {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 600000 })
  const sleep = ms => new Promise(r => setTimeout(r, ms))
  try {
    const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
    page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
    await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 180000 })
    await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(5000)
    const cabs = (await page.evaluate(() => window.__canvasApi.getState())).cabinets
    for (const l of [...Object.keys(W2CABS), ...Object.keys(DEEP), 'BC-11']) {
      const c = cabs.find(x => x.label === l)
      const patch = DEEP[l] ? { dz: DEEP[l] } : { dy: c.dy }
      await page.evaluate(([l, p]) => window.__canvasApi.updateCabinet(l, p), [l, patch]); await sleep(2500)
      const s = (await page.evaluate(() => window.__canvasApi.getState())).cabinets.find(x => x.label === l)
      console.log(l, 'off', s.offset, 'dx', s.dx, 'dy', s.dy, 'dz', s.dz)
    }
    const rp = await page.evaluate(() => window.__canvasApi.getResolved('BC-11'))
    for (const z of rp.face_zones ?? []) console.log('BC-11 zone', z.row_index, z.face_type, 'Y', z.Y, 'DY', z.DY, 'handle', z.handle?.name ?? 'none')
    const open = (rp.face_zones ?? []).find(z => z.face_type === 'open')
    if (open) { await page.evaluate(([id, z]) => window.__canvasApi.updateFixture(id, { z }), [OVEN, 100 + open.Y]); await sleep(2000); console.log('oven z ->', 100 + open.Y) }
    const issues = await page.evaluate(() => window.__canvasApi.getIssues())
    console.log('ISSUES', JSON.stringify(issues).slice(0, 3000))
  } finally { await browser.close() }
}
