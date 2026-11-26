// RHK6478 Master WIR (Mark 2026-11-26): split the 2554 talls in height 3 under a fixed shelf top (split tool rule)
// so the sides + back fit the 2415 Teak sheet. Hanging TC-08/09/10/12/13/17: fixed shelf top 2116.5 -> 2113.5.
// TC-14 cubes: top fixed shelf top 2236.8 -> 2233.8. Cut ends untaped (default). Run: node ... go
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'e58340a6-4b68-4543-a1ca-a686b515a647'
const CUT = { 'TC-08': 2113.5, 'TC-09': 2113.5, 'TC-10': 2113.5, 'TC-12': 2113.5, 'TC-13': 2113.5, 'TC-17': 2113.5, 'TC-14': 2233.8 }
const { data: cabs, error } = await sb.from('cabinet_instances').select('id,label,dy,dz,split').eq('room_id', R).in('label', Object.keys(CUT))
if (error) throw error
for (const c of cabs) console.log(c.label, c.dy, JSON.stringify(c.split), '->', CUT[c.label])
if (process.argv[2] !== 'go') { console.log('dry run - pass go'); process.exit(0) }
if (cabs.length !== 7 || cabs.some(c => c.dy !== 2554 || c.split)) { console.log('changed since query'); process.exit(1) }
for (const c of cabs) {
  const { error: e } = await sb.from('cabinet_instances').update({ split: { at: [CUT[c.label]] } }).eq('id', c.id)
  console.log(c.label, e?.message ?? 'split saved')
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); page.on('dialog', d => d.dismiss()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)))
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 240000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 240000 }); await sleep(6000)
  for (const c of cabs) { await page.evaluate(([i, z]) => window.__canvasApi.updateCabinet(i, { dz: z }), [c.id, c.dz]); await sleep(2000) }
  await sleep(3000)
  const iss = await page.evaluate(() => window.__canvasApi.getIssues())
  for (const x of iss) for (const e of [...x.errors, ...x.warnings]) console.log('ISSUE', x.label, e.code, e.message)
} finally { await browser.close() }
for (const c of cabs) {
  const { data: parts } = await sb.from('case_parts').select('part_key,dx,dy').eq('cabinet_instance_id', c.id)
  console.log(c.label, (parts ?? []).filter(p => /side|back/.test(p.part_key)).map(p => `${p.part_key} ${p.dx}x${p.dy}`).join('; '))
}
process.exit(0)
