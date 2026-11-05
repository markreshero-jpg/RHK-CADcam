// RHK6592 rev 8 (Mark 2026-11-05) — canvas phase (run after _tmp-6592-rev8db.mjs).
// Sink cupboard 750 -> 810; broom cupboard 450 (PT matt door, RH hinge, 300 OA) + TEPF after TC-04; floating shelf
// 2540 x 36 (2pac double) 600 above the bench on the south wall; kicks re-joined; sink + tap re-linked.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const BUT = '1c00eb19-09c1-41b8-8c7c-a6441ee0263d'
const PT = 'fcfa8ede-490a-4dfc-bee9-42923d1e9c0f', FLAT16 = 'b12d551b-3c18-47a3-ae33-f5fd7ea4eb48', CWM = '7917b996-9833-42a7-8910-a2b3f1c02c81'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage()
  page.on('dialog', d => d.dismiss())
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  const open = async () => { await page.goto(`http://localhost:3001/canvas/${BUT}`, { waitUntil: 'networkidle2', timeout: 90000 }); await page.waitForFunction('!!window.__canvasApi'); await sleep(1500) }
  const api = async (fn, ...args) => { const r = await page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, args]); console.log(fn, JSON.stringify(args), JSON.stringify(r)?.slice(0, 200)); await sleep(700); return r }
  const st = async () => (await page.evaluate(() => window.__canvasApi.getState()))
  const cabBy = async label => (await st()).cabinets.find(c => c.label === label)
  const db = async (label, patch) => { const r = await sb.from('cabinet_instances').update(patch).eq('room_id', BUT).eq('label', label); if (r.error) throw new Error(label + ' ' + r.error.message); console.log('db', label, Object.keys(patch).join(',')) }

  await open()
  let s = await st()
  const wall = n => s.walls.find(w => w.name === n).id
  console.log('walls', JSON.stringify(s.walls.map(w => [w.name, w.length])))
  const before = new Set(s.cabinets.map(c => c.label))

  // 1. sink cupboard 810, re-join the west kick
  await api('updateCabinet', 'BC-02', { dx: 810 })
  await api('joinKicks', 'BC-02')

  // 2. broom cupboard + end panel, south wall run of Wall 2
  await api('placeCabinet', { def: 'T2D', wall: wall('Wall 2'), offset: 2559, dx: 450 })
  await api('placeCabinet', { def: 'TEPF', wall: wall('Wall 2'), offset: 3009, dx: 17 })
  // 3. floating shelf on Wall 4 (E->W): x 0..2540 = offset 1375..3915
  await api('placeCabinet', { def: 'FLSHLF', wall: wall('Wall 4'), offset: 1375, dx: 2540 })
  s = await st()
  const added = s.cabinets.filter(c => !before.has(c.label)).map(c => [c.label, c.cabinet_definition_id, c.dx, c.assembly_class])
  console.log('added', JSON.stringify(added))
  const broom = added.find(a => a[2] === 450)[0], tepf = added.find(a => a[2] === 17)[0], shelf = added.find(a => a[2] === 2540)[0]

  await db(broom, {
    notes: 'Broom cupboard 450 x 2200, single PT 16 Classic White Matt door, RH hinge, 300 OA incl the door (Flavio 2026-11-04)',
    face_grid: { cols: [{ col_index: 0, width_locked: false }], rows: [{ row_index: 0, height_locked: false }],
      zones: [{ col_index: 0, row_index: 0, face_type: 'door', hinge_side: 'right', door_style_id: FLAT16, door_colour_id: CWM }] },
    material_overrides: { door_face: PT },
    internal_grid: { tree: { type: 'open', fittings: [] } },
  })
  await db(tepf, { notes: 'PT 16 Classic White Matt seen end of the broom cupboard, floor to 2200, 300 OA', material_overrides: { exposed: PT } })
  const fsRow = (await sb.from('cabinet_instances').select('float_shelf').eq('room_id', BUT).eq('label', shelf).single()).data
  await db(shelf, { notes: 'Floating shelf over the D/W / washer / dryer: 2pac double build (2 x 18 satin = 36), 2540 = the top incl the 20 waterfall, underside 600 above the 900 bench. No LED.',
    float_shelf: { ...(fsRow.float_shelf ?? {}), build: 'double', seen_left: true, seen_right: false } })

  await open()
  await api('updateCabinet', broom, { offset: 2558.5, dy: 2200, dz: 281.5 })
  await api('updateCabinet', tepf, { offset: 3008.5, dx: 16.5, dy: 2200, dz: 280 })
  await api('joinKicks', 'TC-02')
  await api('updateCabinet', shelf, { pos_z: 1500 })

  // 4. re-resolve everything else (walls moved), re-link the sink + tap on the 810 cupboard (centre y 1265)
  await open()
  for (const c of (await st()).cabinets) if (!c.is_kick_assembly && ![broom, tepf, shelf].includes(c.label)) await api('updateCabinet', c.label, { dy: Number(c.dy) })
  for (const f of (await st()).fixtures) {
    if (f.name === 'Undermount sink') await api('updateFixture', f.id, { x: 80, y: 1565 })
    if ((f.name ?? '').includes('Mixer')) await api('updateFixture', f.id, { x: 15, y: 1323.5 })
  }
  await open()
  s = await st()
  console.log(JSON.stringify(s.cabinets.map(c => [c.label, s.walls.find(w => w.id === c.wall_id)?.name, c.offset, c.dx, c.dy, c.dz, c.pos_z])))
  console.log(JSON.stringify(s.fixtures.map(f => ({ n: f.name, x: f.x, y: f.y, cab: f.cabinet, clash: f.clash }))))
  for (const c of await page.evaluate(() => window.__canvasApi.getIssues())) if (c.errors.length || c.warnings.length) console.log(c.label, JSON.stringify([...c.errors, ...c.warnings].map(e => e.code + ' ' + e.message)))
  console.log('done')
} finally { await browser.close() }
