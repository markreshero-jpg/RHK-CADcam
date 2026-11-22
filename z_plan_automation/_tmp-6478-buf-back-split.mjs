// RHK6478 Buffet WC-02 (Mark 2026-11-22): open-unit mirror back 1439 x 1213 is 2 wider than the 1211 sheet
// (came back unplaced in the nest) -> cut in half across its width (z_cabinet_split S6 split.back_x):
// back runs x 33..1246, cut at 639.5 -> 2 x 606.5 x 1439, "JOIN TOGETHER" behind the mirrors.
// Run: node z_plan_automation/_tmp-6478-buf-back-split.mjs go
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer-core'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '0df13af4-8a6f-438f-a10d-6a9b4754aa97', WC02 = 'b2a41d06-aebc-45af-ab76-8c4da4d2c7fc'
if (process.argv[2] !== 'go') process.exit(0)
const c = (await sb.from('cabinet_instances').select('split,dz').eq('id', WC02).single()).data
if (c.split) { console.log('already split', JSON.stringify(c.split)); process.exit(1) }
const u = await sb.from('cabinet_instances').update({ split: { at: [], back_x: [639.5] } }).eq('id', WC02)
if (u.error) { console.log(u.error.message); process.exit(1) }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); page.on('dialog', d => d.dismiss())
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 240000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 240000 }); await sleep(4000)
  await page.evaluate(([i, z]) => window.__canvasApi.updateCabinet(i, { dz: z }), [WC02, c.dz]); await sleep(2500)
  const iss = await page.evaluate(() => window.__canvasApi.getIssues())
  for (const x of iss) for (const e of x.errors) console.log('ERROR', x.label, e.code, e.message)
} finally { await browser.close() }
const p = (await sb.from('case_parts').select('part_key,x,dx,dy').eq('cabinet_instance_id', WC02).like('part_key', '%back%')).data
console.log(JSON.stringify(p))
process.exit(0)
