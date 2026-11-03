// Temp: RHK6586 study rev 2 (Mark 2026-10-31): corner shelf BC-08 on a kick, 40 face filler at the wall end of
// its 45 face, and a 16.5 end panel on its right (gable + panel = 33 like BC-01/02); BC-03 narrows to suit.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'd4fdad8f-bcbf-4c38-a6ad-b6e0cee7ca8d'
const chk = (l, r) => { console.log(l, r.error ? 'ERR ' + r.error.message : 'ok ' + (r.data?.length ?? '')); if (r.error) process.exit(1) }
const D = 482, W = 507.5, tip = +(18 * Math.SQRT2).toFixed(2), FILL = 40, PT = 16.5
const s = FILL / Math.SQRT2, P = { x: +(tip + s).toFixed(2), y: +s.toFixed(2) }

if (!process.argv.includes('--resolve-only')) {
  const footprint = { params: {}, segments: [
    { type: 'line', p0: { x: tip, y: 0 }, p1: { x: W, y: 0 }, edge: { id: 'back', role: 'back' } },
    { type: 'line', p0: { x: W, y: 0 }, p1: { x: W, y: D }, edge: { id: 'right', role: 'side' } },
    { type: 'line', p0: { x: W, y: D }, p1: P, edge: { id: 'front', role: 'front', sub: 'open' } },
    { type: 'line', p0: P, p1: { x: tip, y: 0 }, edge: { id: 'filler', role: 'front', filler: { width: FILL, cleat: 60 } } },
  ] }
  chk('BC-08', await sb.from('cabinet_instances').update({ has_toekick: true, has_face: true, footprint,
    notes: 'Study open corner shelf under the 45 end of the desk (replaces the waterfall). Open 45 face 18 back from the stone, 40 filler at the wall end, Boston Oak all over, 2 fixed shelves, on a kick.' })
    .eq('room_id', R).eq('label', 'BC-08').select('id'))
  const { data: ep } = await sb.from('cabinet_instances').select('*').eq('room_id', R).eq('label', 'BC-02').single()
  const { id, created_at, updated_at, ...row } = ep
  await sb.from('cabinet_instances').delete().eq('room_id', R).eq('label', 'BC-09')
  chk('BC-09', await sb.from('cabinet_instances').insert({ ...row, label: 'BC-09', pos_x: W,
    notes: 'Study end panel against the corner shelf gable (gable + panel = 33 like BC-01/02), to the floor, covers the kick end' }).select('id'))
  chk('BC-03', await sb.from('cabinet_instances').update({ pos_x: W + PT, dx: +(1302 - W - PT).toFixed(1),
    notes: 'Floating desk drawer, no handle (opens from underneath), no carcass bottom. Between the 33 ends.' }).eq('room_id', R).eq('label', 'BC-03').select('id'))
}

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], protocolTimeout: 900000 })
const sleep = ms => new Promise(r => setTimeout(r, ms))
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 90000 }); await sleep(4000)
  for (const l of ['BC-08', 'BC-09', 'BC-03']) {
    const st = await page.evaluate(() => window.__canvasApi.getState())
    const cc = st.cabinets.find(x => x.label === l)
    if (!cc) { console.log('missing', l); continue }
    await page.evaluate(([id, dz]) => window.__canvasApi.updateCabinet(id, { dz }), [cc.id, cc.dz]); await sleep(2000)
  }
  const issues = await page.evaluate(() => window.__canvasApi.getIssues())
  for (const c of issues) for (const e of [...c.errors, ...c.warnings]) console.log(`  ${c.label} ${e.code}: ${e.message}`)
} finally { await browser.close() }
const { data: c8 } = await sb.from('cabinet_instances').select('id,has_toekick,has_face').eq('room_id', R).eq('label', 'BC-08').single()
console.log('BC-08', JSON.stringify(c8))
for (const t of ['case_parts', 'face_zones', 'toekick_parts']) {
  const { data, error } = await sb.from(t).select('*').eq('cabinet_instance_id', c8.id)
  if (error) { console.log(t, error.message); continue }
  for (const p of data) console.log(t, p.part_key, p.dx ?? p.DX, p.dy ?? p.DY, p.dz ?? p.DZ, 'x', p.pos_x ?? p.x, 'z', p.pos_z ?? p.z, 'ay', p.angle_y ?? p.ay ?? '')
}
