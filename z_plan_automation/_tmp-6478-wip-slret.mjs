// RHK6478 WIP: shadowline returns where a deep shadowline meets a shallower one (Mark 2026-11-03).
// Return depth = deep - shallow + 60 strip, so the shallow strip's end butts fully into the return (as Laundry WC-09).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'cb47d462-90eb-4ba0-8e6e-ca4d978628ae'
const want = { 'WC-07': ['right', 630 - 350 + 60], 'WC-10': ['left', 630 - 330 + 60] }
const { data: cabs, error } = await sb.from('cabinet_instances').select('id,label,bulkhead').eq('room_id', R).in('label', Object.keys(want))
if (error) throw error
for (const c of cabs) {
  const [side, depth] = want[c.label]
  const bulkhead = { ...c.bulkhead, [side]: { ...c.bulkhead[side], on: true, depth, joint: 'mitre' } }
  const u = await sb.from('cabinet_instances').update({ bulkhead }).eq('id', c.id)
  if (u.error) throw u.error
  console.log(c.label, side, depth)
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  for (const l of Object.keys(want)) { console.log(JSON.stringify(await page.evaluate(l => window.__canvasApi.updateCabinet(l, { dy: 18 }), l))); await sleep(2000) }
  for (const l of Object.keys(want)) {
    const r = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    const parts = (r?.case_parts ?? r?.parts ?? []).filter(p => String(p.part_key).startsWith('bh:'))
    console.log(l, JSON.stringify(parts.map(p => [p.part_key, p.DX, p.DY, p.DZ])))
  }
  const iss = await page.evaluate(() => window.__canvasApi.getIssues())
  console.log('issues', JSON.stringify(iss.filter(i => i.errors.length || i.warnings.length)))
} finally { await browser.close() }
