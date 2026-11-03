import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'e2a2d342-8475-4967-b1be-8387919acd1c'
for (const l of ['BC-01', 'BC-04']) {
  const r = await sb.from('cabinet_instances').update({ dy: 300, dz: 495, notes: 'Open shelf bay 200: front flush with the drawer fronts (495 = carcass 476.5 + front 16.5 + 2), 460-760 AFF up to the apron underside' }).eq('room_id', R).eq('label', l).select('label,dy,dz,pos_z')
  console.log(JSON.stringify(r.data ?? r.error))
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(2500)
  for (const l of ['BC-01', 'BC-04']) { await page.evaluate(l => window.__canvasApi.updateCabinet(l, { dz: 495 }), l); await sleep(1500) }
  const st = await page.evaluate(() => window.__canvasApi.getState())
  for (const c of st.cabinets) console.log(c.label, c.offset, c.dx, c.dy, c.dz, c.pos_z)
  const rp = await page.evaluate(() => window.__canvasApi.getResolved('BC-01'))
  console.log(JSON.stringify(rp.case_parts.map(p => [p.part_key, p.Y, p.Z, p.DX, p.DY, p.DZ])))
  const rz = await page.evaluate(() => window.__canvasApi.getResolved('BC-02'))
  console.log('BC-02 zone', JSON.stringify(rz.face_zones.map(z => [z.Y, z.DY, z.Z])))
  const issues = await page.evaluate(() => window.__canvasApi.getIssues()); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
