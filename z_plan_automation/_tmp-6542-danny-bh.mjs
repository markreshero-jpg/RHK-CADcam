// RHK6542 Danny's Robe: WC-04 bulkhead out 100 (dz 680, clear of the sliding doors) + 200 bottom return, mitred.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const R = '830e087b-d817-4843-b766-5fbdd8ee6c4a'
const c = (await sb.from('cabinet_instances').select('id,bulkhead,edge_overrides').eq('room_id', R).eq('label', 'WC-04').single()).data
const off = { top: false, left: false, right: false, bottom: false }
const upd = await sb.from('cabinet_instances').update({
  bulkhead: { ...c.bulkhead, bottom: { on: true, depth: 200, joint: 'mitre' } },
  edge_overrides: { ...c.edge_overrides, 'case_bh:ret_b': off },
}).eq('id', c.id)
console.log(upd.error?.message ?? 'bh ok')
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' }); page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  await page.evaluate(() => window.__canvasApi.updateCabinet('WC-04', { dz: 680 })); await sleep(2500)
  console.log(JSON.stringify((await sb.from('cabinet_instances').select('pos_x,pos_y,pos_z,dx,dy,dz,bulkhead').eq('id', c.id).single()).data))
  const rp = await page.evaluate(() => window.__canvasApi.getResolved('WC-04'))
  for (const p of rp.case_parts) console.log(p.part_key, 'X', p.X, 'Y', p.Y, 'Z', p.Z, 'DX', p.DX, 'DY', p.DY, 'DZ', p.DZ, p.bevel_lo ?? '', p.bevel_hi ?? '')
  const issues = await page.evaluate(() => window.__canvasApi.getIssues())
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) console.log(`  ${ci.label} ${e.code}: ${e.message}`)
  console.log('errors', issues.reduce((a, c) => a + c.errors.length, 0))
} finally { await browser.close() }
