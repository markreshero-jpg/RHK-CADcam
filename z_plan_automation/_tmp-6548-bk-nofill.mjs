// RHK6548 Back Kitchen (Mark 2026-11-27): fillers off, TC-01 back to 665 hard to both walls. Height stays 2320.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const BK = 'e8b3c950-5be5-4e4a-9117-451395e9d2a1'
const cabs = chk('cabs', await sb.from('cabinet_instances').select('id,label,dx,dy,dz,notes').eq('room_id', BK))
console.log('before', JSON.stringify(cabs))
const notes = chk('ann', await sb.from('room_annotations').select('id,kind,geom,view').eq('room_id', BK))
for (const n of notes) { const t = JSON.stringify(n.geom); if (/fill/i.test(t)) console.log('NOTE mentions filler', n.id, t) }
if (process.argv[2] !== 'go') process.exit(0)
for (const c of cabs.filter(c => c.label !== 'TC-01')) chk('del ' + c.label, await sb.from('cabinet_instances').delete().eq('id', c.id))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  await page.goto(`http://localhost:3001/canvas/${BK}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  console.log(JSON.stringify(await page.evaluate(() => window.__canvasApi.updateCabinet('TC-01', { dx: 665, offset: 0 })))); await sleep(5000)
  for (const ci of await page.evaluate(() => window.__canvasApi.getIssues())) console.log(ci.label, ci.dims, JSON.stringify([...ci.errors, ...ci.warnings].map(e => e.code + ' ' + e.message)))
  console.log(JSON.stringify((await page.evaluate(() => window.__canvasApi.getState())).cabinets.map(c => [c.label, c.offset, c.dx, c.dy, c.dz])))
} finally { await browser.close() }
const fz = chk('fz', await sb.from('face_zones').select('face_type,x,y,dx,dy').eq('cabinet_instance_id', cabs.find(c => c.label === 'TC-01').id))
console.log('doors', JSON.stringify(fz))
process.exit(0)
