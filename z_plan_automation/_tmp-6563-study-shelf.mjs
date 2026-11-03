// RHK6563 Study: open shelf boxes bottom at 1400 AFF (Mark 2026-11-02): bottom 1400-1433, back 1433-1737, top 1737-1770.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '443a1553-14c4-4b8d-bd1f-2e5890b827e7'
const Z = { 'WC-05': 1400, 'WC-08': 1400, 'WC-07': 1433, 'WC-10': 1433, 'WC-06': 1737, 'WC-09': 1737 }
for (const [l, z] of Object.entries(Z)) { const r = await sb.from('cabinet_instances').update({ pos_z: z }).eq('room_id', R).eq('label', l); console.log(l, r.error?.message ?? z) }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' }); page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  for (const l of Object.keys(Z)) { const dz = l === 'WC-07' || l === 'WC-10' ? 33 : 300; await page.evaluate(([l, dz]) => window.__canvasApi.updateCabinet(l, { dz }), [l, dz]); await sleep(1000) }
  const issues = await page.evaluate(() => window.__canvasApi.getIssues()); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
