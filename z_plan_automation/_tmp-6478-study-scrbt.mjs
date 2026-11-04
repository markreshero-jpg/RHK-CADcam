// RHK6478 Study (Mark 2026-11-04): overhead bottom scribes. Door cabinets SCRBT = under panel 16.5 (addUnderPanel had
// put back 18); open boxes SCRBT 0 so their bottoms line up with the under panels' underside (1500).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = 'a04663c7-1402-4344-be00-3ad4ce3aeae9'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const cabs = chk('cabs', await sb.from('cabinet_instances').select('id,label,rule_overrides,dz').eq('room_id', R).in('label', ['WC-11', 'WC-12', 'WC-13', 'WC-14', 'WC-15']))
const want = { 'WC-11': 16.5, 'WC-13': 16.5, 'WC-15': 16.5, 'WC-12': 0, 'WC-14': 0 }
for (const c of cabs) chk(c.label, await sb.from('cabinet_instances').update({ rule_overrides: { ...(c.rule_overrides ?? {}), SCRBT: want[c.label] } }).eq('id', c.id))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
try {
  await open()
  for (const c of cabs) { await page.evaluate(([l, dz]) => window.__canvasApi.updateCabinet(l, { dz }), [c.label, c.dz]); await sleep(1500) }
  await open()
  for (const c of cabs.sort((a, b) => a.label.localeCompare(b.label))) {
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), c.label)
    console.log(c.label, JSON.stringify([...rp.case_parts.map(p => [p.part_key, p.DY, p.Y]), ...rp.face_zones.map(z => ['face', z.DY, z.Y])]))
  }
  const issues = await page.evaluate(() => window.__canvasApi.getIssues()); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
