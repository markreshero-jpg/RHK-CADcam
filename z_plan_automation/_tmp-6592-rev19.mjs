// RHK6592 rev 19 (Mark 2026-11-05): Shaker route on the kitchen island end panel BC-12 + the island back panel
// BC-01 (3 pieces, one route each), 60 in all round like the doors: rule_overrides.PANEL_PROFILE (DOOR_SYSTEM_SPEC
// §Panel profiles). BC-12 seen face = +X (east end of the island run), BC-01 = front (its outer face).
// Then dumps both resolved cabinets to z_plan_automation/_tmp-6592-rev19-rp.json for the route check.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const KIT = 'dc7a22f3-ed0b-4771-a42e-4548fc4de1e1'
for (const [label, face] of [['BC-12', 'right'], ['BC-01', 'front']]) {
  const { data: c, error } = await sb.from('cabinet_instances').select('id,rule_overrides').eq('room_id', KIT).eq('label', label).single()
  if (error) throw error
  const u = await sb.from('cabinet_instances').update({ rule_overrides: { ...(c.rule_overrides ?? {}), PANEL_PROFILE: face } }).eq('id', c.id)
  if (u.error) throw u.error
  console.log('ok', label, face)
}
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); page.on('dialog', d => d.dismiss()); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${KIT}`, { waitUntil: 'networkidle2', timeout: 90000 }); await page.waitForFunction('!!window.__canvasApi'); await new Promise(r => setTimeout(r, 1500))
  const out = {}
  for (const l of ['BC-12', 'BC-01']) out[l] = await page.evaluate(async l => await window.__canvasApi.getResolved(l), l)
  fs.writeFileSync('z_plan_automation/_tmp-6592-rev19-rp.json', JSON.stringify(out))
  for (const [l, rp] of Object.entries(out)) console.log(l, 'panel_profile', JSON.stringify(rp.panel_profile)?.slice(0, 120), 'custom', (rp.custom_parts ?? []).length, 'ibp', rp.case_parts.filter(p => p.part_key.startsWith('ibp:')).length)
  for (const x of await page.evaluate(() => window.__canvasApi.getIssues())) if (x.errors.length || x.warnings.length) console.log(x.label, JSON.stringify([...x.errors, ...x.warnings].map(e => e.code + ' ' + e.message)))
  console.log('issues done')
} finally { await browser.close() }
