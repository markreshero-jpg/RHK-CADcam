// RHK6478 Laundry rev 3 (Mark 2026-11-02): WC-09 / WC-11 shadowlines + WC-01 washer top in 2pac board (material_overrides.exposed),
// WC-09 right return 400 deep; WC-03 hinged right.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = 'fc12bc7d-53ee-46ee-a302-3411f5129bcc', PAC_BOARD = 'b07a7e40-facd-4cdf-8856-60712e940b44'
const cabs = chk('cabs', await sb.from('cabinet_instances').select('id,label,material_overrides,bulkhead,face_grid').eq('room_id', R).in('label', ['WC-01', 'WC-03', 'WC-09', 'WC-11']))
const by = l => cabs.find(c => c.label === l)
for (const l of ['WC-01', 'WC-09', 'WC-11']) chk(l, await sb.from('cabinet_instances').update({ material_overrides: { ...(by(l).material_overrides ?? {}), exposed: PAC_BOARD } }).eq('id', by(l).id))
const b = by('WC-09').bulkhead
chk('WC-09 ret', await sb.from('cabinet_instances').update({ bulkhead: { ...b, right: { on: true, depth: 400, joint: 'mitre' } }, notes: '18 2pac shadowline over the tower, 2679-2697, right return 400' }).eq('id', by('WC-09').id))
const fg = by('WC-03').face_grid
chk('WC-03', await sb.from('cabinet_instances').update({ face_grid: { ...fg, zones: fg.zones.map(z => z.face_type === 'door' ? { ...z, hinge_side: 'right' } : z) }, notes: 'Overhead single door, hinged right, 2 adj shelves' }).eq('id', by('WC-03').id))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  const st = await page.evaluate(() => window.__canvasApi.getState())
  for (const l of ['WC-01', 'WC-03', 'WC-09', 'WC-11']) {
    const c = st.cabinets.find(x => x.label === l)
    await page.evaluate(([l, dz]) => window.__canvasApi.updateCabinet(l, { dz }), [l, c.dz]); await sleep(1200)
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    console.log(l, JSON.stringify([...rp.case_parts.map(p => [p.part_key, p.DX, p.DY, p.DZ, p.material_id?.slice(0, 8)]), ...rp.custom_parts.map(p => [p.name, p.dz, p.material_id?.slice(0, 8)]), ...rp.face_zones.map(z => ['door', z.hinge_side])]))
  }
  const issues = await page.evaluate(() => window.__canvasApi.getIssues()); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
