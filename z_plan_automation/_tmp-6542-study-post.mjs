// RHK6542 White Study: half-mm widths, WEP front filler, 200 robe N panel at the front, join kicks (desk pedestal, robe), re-resolve + report.
// node z_plan_automation/_tmp-6542-study-post.mjs setup | check
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = 'a81555f3-22f3-4efd-947b-4e083bf49c94'
const mode = process.argv[2] ?? 'check'
const cabId = async l => chk(l, await sb.from('cabinet_instances').select('id').eq('room_id', R).eq('label', l).single()).id
if (mode === 'setup') {
  for (const [l, dx] of [['BC-01', 16.5], ['WC-02', 16.5], ['TC-01', 16.5], ['TC-04', 16.5], ['TC-05', 16.5], ['TC-08', 16.5], ['TC-02', 891.5], ['TC-03', 891.5], ['WC-04', 1983.5]])
    chk('dx ' + l, await sb.from('cabinet_instances').update({ dx }).eq('id', await cabId(l)))
  // Overhead filler at the wall: Applied Panel -> front filler in the door plane.
  chk('wep', await sb.from('cabinet_custom_parts').update({ orientation: 'front', name: 'Front Filler', expressions: { z: 'cab.d + 2', dx: 'cab.w', dy: 'cab.h', dz: 't.exposed' } }).eq('cabinet_instance_id', await cabId('WC-02')))
  // Robe N panel: 200 deep, front flush with the 600 end panel.
  chk('n panel', await sb.from('cabinet_custom_parts').update({ expressions: { z: 'cab.d + t.door + 2 - 200', dx: '200', dy: 'cab.h', dz: 't.exposed' } }).eq('cabinet_instance_id', await cabId('TC-01')))
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  let st = await page.evaluate(() => window.__canvasApi.getState())
  if (mode !== 'check') for (const c of st.cabinets) { await page.evaluate(([l, dz]) => window.__canvasApi.updateCabinet(l, { dz }), [c.label, c.dz]); await sleep(900) }
  if (mode === 'setup') {
    if (0) for (const c of st.cabinets) { await page.evaluate(([l, dz]) => window.__canvasApi.updateCabinet(l, { dz }), [c.label, c.dz]); await sleep(900) }
    for (const l of ['BC-02', 'TC-02']) { console.log('join', l, JSON.stringify(await page.evaluate(l => window.__canvasApi.joinKicks(l), l))); await sleep(3000) }
  }
  st = await page.evaluate(() => window.__canvasApi.getState())
  for (const c of st.cabinets) console.log(c.label, c.wall, c.offset, c.dx, c.dy, c.dz, 'pos_z', c.pos_z)
  for (const l of ['BC-01', 'BC-02', 'BC-03', 'WC-01', 'WC-02', 'WC-03', 'WC-04', 'TC-01', 'TC-02', 'TC-05', 'TC-06', 'TC-07', 'WC-06', 'WC-05', 'KICK 1', 'KICK 2']) {
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    if (!rp) { console.log(l, 'no resolved'); continue }
    console.log(l, JSON.stringify([...rp.case_parts.map(p => [p.part_key, p.X, p.Y, p.Z, p.DX, p.DY, p.DZ, p.material_id?.slice(0, 8)]), ...(rp.internal_parts ?? []).map(p => [p.part_key, p.Y, p.DX, p.DY, p.DZ, p.material_id?.slice(0, 8)]), ...rp.custom_parts.map(p => [p.name, p.X ?? p.x, p.Z ?? p.z, p.DX ?? p.dx, p.DY ?? p.dy, p.DZ ?? p.dz, p.material_id?.slice(0, 8)])]))
    if (rp.face_zones?.length) console.log(l, 'zones', JSON.stringify(rp.face_zones.map(z => [z.face_type, z.Y, z.DX, z.DY, z.material_id?.slice(0, 8), z.handle?.grip_kind, z.handle?.handle_id?.slice(0, 8), z.hinges])))
  }
  const issues = await page.evaluate(() => window.__canvasApi.getIssues()); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
