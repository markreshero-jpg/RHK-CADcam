// RHK6548 BK TC-01 (Mark 2026-11-27): hinges re-set after the 665 widen - stale locked rows had the top hinge at 1650.
// Manual hinges on both doors: 4, 100 from top + bottom, middles clear of the shelf-hole banks (Mark).  node _tmp-6548-bk-hinges.mjs "100,880,1420,2220"
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const BK = 'e8b3c950-5be5-4e4a-9117-451395e9d2a1'
const H = (process.argv[2] ?? "100,880,1420,2220").split(',').map(Number)
const c = chk('c', await sb.from('cabinet_instances').select('id,face_grid').eq('room_id', BK).eq('label', 'TC-01').single())
const fg = structuredClone(c.face_grid); fg.zones = fg.zones.map(z => z.face_type === 'door' ? { ...z, hinges: H } : z)
chk('fg', await sb.from('cabinet_instances').update({ face_grid: fg }).eq('id', c.id))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  await page.goto(`http://localhost:3001/canvas/${BK}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  console.log(JSON.stringify(await page.evaluate(() => window.__canvasApi.updateCabinet('TC-01', { dz: 490 })))); await sleep(5000)
  for (const ci of await page.evaluate(() => window.__canvasApi.getIssues())) console.log(ci.label, JSON.stringify([...ci.errors, ...ci.warnings].map(e => e.code + ' ' + e.message)))
} finally { await browser.close() }
console.log(JSON.stringify(chk('h', await sb.from('hinge_instances').select('col_index,sort_order,y_position_mm,y_locked').eq('cabinet_instance_id', c.id).order('col_index').order('sort_order'))))
process.exit(0)
