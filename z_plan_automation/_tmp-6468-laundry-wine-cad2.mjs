// Rev 4 CAD fix-up: the geometry moves (un-awaited in -wine-cad) + TC-02 to 16.5.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) throw new Error(t + ': ' + r.error.message); return r.data }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const R = '874fed25-8e1b-4bbf-b1ff-3090361b5dad', D = 666.5
const rows = chk('a', await sb.from('room_annotations').select('*').eq('room_id', R))
const one = p => { const r = rows.filter(r => r.id.startsWith(p)); if (r.length !== 1) throw new Error('row ' + p); return r[0] }
const mv = async (r, g) => chk(r.id, await sb.from('room_annotations').update({ geom: g }).eq('id', r.id))
const e1 = one('17631483'), p1 = one('f42a5db0'), pt = one('94351c80'), et = one('d36a63c8')
if (e1.geom.a.x === 40) {
  await mv(e1, { a: { x: e1.geom.a.x + D - 30, y: e1.geom.a.y }, b: { x: e1.geom.b.x + D, y: e1.geom.b.y } })
  await mv(p1, { a: { x: p1.geom.a.x + D - 30, y: p1.geom.a.y }, b: { x: p1.geom.b.x + D, y: p1.geom.b.y } })
  await mv(pt, { ...pt.geom, at: { x: pt.geom.at.x + D, y: pt.geom.at.y } })
  await mv(et, { ...et.geom, at: { x: et.geom.at.x + D, y: et.geom.at.y } })
  const cl = one('c197ab87'); await mv(cl, { pts: cl.geom.pts.map(p => (p.x === 640 ? { ...p, x: 1306 } : p)) })
  const tb = one('36633af9'); await mv(tb, { ...tb.geom, leader: [{ x: 1712, y: -870 }, tb.geom.leader[1]] })
}
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' }); page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 240000 }); await page.waitForFunction(() => window.__canvasApi, { timeout: 240000 }); await sleep(4000)
  console.log(JSON.stringify(await page.evaluate(() => window.__canvasApi.updateCabinet('TC-02', { dx: 16.5, offset: 1316.5 })))); await sleep(2500)
  const issues = await page.evaluate(() => window.__canvasApi.getIssues()); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
console.log(JSON.stringify(chk('tc', await sb.from('cabinet_instances').select('label,dx,pos_x').eq('room_id', R).eq('label', 'TC-02'))))
for (const r of chk('a2', await sb.from('room_annotations').select('id,geom,text').eq('room_id', R).in('id', [e1.id, p1.id, pt.id, et.id]))) console.log(r.id.slice(0, 8), JSON.stringify(r.geom).slice(0, 100))
