// RHK6592 rev 10 (Mark 2026-11-05), butlers:
// - Wall 2 kick runs full width: broom TC-05 joins KICK 2's run (602 -> 2992), its own kick removed
// - floating shelf WC-01 300 deep OA
// - BC-03 blind false panel flat (2 Pac Flat 18mm, same colour) - no shaker route
// - wall cleats 70 x 16.5 Whiteboard E1L (bottom long edge taped) under the top in the washer + dryer spaces
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (m, r) => { if (r.error) throw new Error(m + ': ' + r.error.message); console.log('ok', m); return r.data }
const BUT = '1c00eb19-09c1-41b8-8c7c-a6441ee0263d', RUN2 = 'b6faa020-059b-40d9-a812-e9eb5efa2be6'
const FLAT = 'bd2b9178-5b77-4a52-b7a1-cc3765ed4bb4', SATIN = '334dab4c-c325-45ee-9504-686510d681ac', WB = 'd081b2a1-38a8-472c-a415-f179699a1347'
const cab = async l => chk('get ' + l, await sb.from('cabinet_instances').select('*').eq('room_id', BUT).eq('label', l).single())

// DB edits
const tc05 = await cab('TC-05')
if (!tc05.kick_run_id) chk('TC-05 into run', await sb.from('cabinet_instances').update({ kick_run_id: RUN2, has_toekick: false, dy: 2090, pos_z: 110,
  rule_overrides: { ...(tc05.rule_overrides ?? {}), TOEH: 110 } }).eq('id', tc05.id))
const bc03 = await cab('BC-03')
const fg = bc03.face_grid
fg.zones = fg.zones.map(z => z.face_type === 'false_panel' ? { ...z, door_style_id: FLAT, door_colour_id: SATIN } : z)
chk('BC-03 false panel flat', await sb.from('cabinet_instances').update({ face_grid: fg }).eq('id', bc03.id))

const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage()
  page.on('dialog', d => d.dismiss())
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  const open = async () => { await page.goto(`http://localhost:3001/canvas/${BUT}`, { waitUntil: 'networkidle2', timeout: 90000 }); await page.waitForFunction('!!window.__canvasApi'); await sleep(1500) }
  const api = async (fn, ...args) => { const r = await page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, args]); console.log(fn, JSON.stringify(args), JSON.stringify(r)?.slice(0, 160)); await sleep(700); return r }
  await open()
  const st = await page.evaluate(() => window.__canvasApi.getState())
  const w4 = st.walls.find(w => w.name === 'Wall 4').id
  const before = new Set(st.cabinets.map(c => c.label))
  await api('updateCabinet', 'KICK 2', { dx: 2390 })
  await api('updateCabinet', 'TC-05', { dy: 2090 })
  await api('updateCabinet', 'WC-01', { dz: 300 })
  await api('updateCabinet', 'BC-03', { dy: 770 })
  // cleats: washer x 1264-1874 (offset 2041), dryer x 1892-2502 (offset 1413), Wall 4 runs E->W from x 3915
  await api('placeCabinet', { def: 'WUP', wall: w4, offset: 2041, dx: 610 })
  await api('placeCabinet', { def: 'WUP', wall: w4, offset: 1413, dx: 610 })
  const now = (await page.evaluate(() => window.__canvasApi.getState())).cabinets.filter(c => !before.has(c.label))
  console.log('added', JSON.stringify(now.map(c => [c.label, c.offset, c.dx])))
  for (const c of now) {
    const row = await cab(c.label)
    const space = Math.round(c.offset) === 2041 ? 'washer' : 'dryer'
    chk(c.label + ' rules', await sb.from('cabinet_instances').update({ rule_overrides: { ...(row.rule_overrides ?? {}), UNDER_PANEL: true },
      notes: `Wall cleat 70 x 16.5 Whiteboard E1L (bottom edge taped) across the ${space} space, fixed to the wall under the top` }).eq('id', row.id))
    const parts = chk('parts', await sb.from('cabinet_custom_parts').select('*').eq('cabinet_instance_id', row.id))
    const { id: _i, created_at: _c, updated_at: _u, ...base } = parts[0]
    chk('cleat part', await sb.from('cabinet_custom_parts').insert({ ...base, name: 'Wall cleat', orientation: 'front', x: 0, y: 0, z: 0, dx: 610, dy: 70, dz: 16.5,
      expressions: {}, material_id: WB, material_override_id: WB, edge_top: false, edge_bottom: true, edge_left: false, edge_right: false, no_cnc: false, sort_order: 0 }))
    for (const p of parts) chk('old part', await sb.from('cabinet_custom_parts').delete().eq('id', p.id))
  }
  await open()
  for (const c of now) await api('updateCabinet', c.label, { dx: 610, dy: 70, dz: 16.5, pos_z: 810 })
  await open()
  const s = await page.evaluate(() => window.__canvasApi.getState())
  console.log(JSON.stringify(s.cabinets.filter(c => /^(TC-0[2-6]|KICK 2|WC|BC-03)/.test(c.label)).map(c => [c.label, c.offset, c.dx, c.dy, c.dz])))
  for (const c of await page.evaluate(() => window.__canvasApi.getIssues())) if (c.errors.length || c.warnings.length) console.log(c.label, JSON.stringify([...c.errors, ...c.warnings].map(e => e.code + ' ' + e.message)))
  console.log('done')
} finally { await browser.close() }
