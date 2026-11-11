// RHK6339 J05 rev 1: half-mm widths (BC-02 692.5, BC-03 at 2037.5 x 792.5), re-resolve, join kick, check member kick parts.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'ab417075-b6e2-4189-93c5-c281e1f05f9b'
const fix = { 'BC-02': { pos_x: 1345, dx: 692.5 }, 'BC-03': { pos_x: 2037.5, dx: 792.5 } }
for (const [l, v] of Object.entries(fix)) { const r = await sb.from('cabinet_instances').update(v).eq('room_id', R).eq('label', l); console.log(l, r.error?.message ?? 'ok') }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const open = async page => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  await open(page)
  for (const l of ['BC-02', 'BC-03']) { console.log(JSON.stringify(await page.evaluate(l => window.__canvasApi.updateCabinet(l, { dz: 676 }), l))); await sleep(1500) }
  console.log('join', JSON.stringify(await page.evaluate(() => window.__canvasApi.joinKicks('BC-01')))); await sleep(4000)
  await open(page)
  const issues = await page.evaluate(() => window.__canvasApi.getIssues())
  for (const ci of issues) console.log(ci.label, ci.dims, [...ci.errors, ...ci.warnings].map(e => e.code).join(',') || 'ok')
} finally { await browser.close() }
const { data: cabs } = await sb.from('cabinet_instances').select('id,label,pos_x,pos_z,dx,dy,has_toekick,is_kick_assembly').eq('room_id', R).order('label')
for (const c of cabs) {
  const { count } = await sb.from('toekick_parts').select('id', { count: 'exact', head: true }).eq('cabinet_instance_id', c.id)
  console.log(c.label, 'x', c.pos_x, 'z', c.pos_z, c.dx, 'x', c.dy, 'kick', c.has_toekick, 'kickParts', count)
}
