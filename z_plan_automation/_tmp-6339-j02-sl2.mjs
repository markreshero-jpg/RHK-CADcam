// RHK6339 J02: BH WC-01 = 35 fixed height, fascia flush with carcass, no cleat / returns; join kick TC-02..TC-03.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '67a27d07-1012-4537-a58d-5d3b50764221'
const { data: bh } = await sb.from('cabinet_instances').select('id,bulkhead').eq('room_id', R).eq('label', 'WC-01').single()
const off = { on: false, depth: 421, joint: 'mitre' }
const bulkhead = { ...bh.bulkhead, front: 'carcase', auto_h: false, cleat: false, left: off, right: off, bottom: off }
console.log('bh', (await sb.from('cabinet_instances').update({ bulkhead, dy: 35 }).eq('id', bh.id)).error?.message ?? 'ok', JSON.stringify(bulkhead))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  console.log(JSON.stringify(await page.evaluate(() => window.__canvasApi.updateCabinet('WC-01', { dy: 35 })))); await sleep(3000)
  console.log('join', JSON.stringify(await page.evaluate(() => window.__canvasApi.joinKicks('TC-01')))); await sleep(4000)
  for (const ci of await page.evaluate(() => window.__canvasApi.getIssues())) for (const e of [...ci.errors, ...ci.warnings]) console.log(' ', ci.label, e.code, e.message)
} finally { await browser.close() }
const { data: cabs } = await sb.from('cabinet_instances').select('id,label,pos_x,pos_y,pos_z,dx,dy,dz,kick_run_id,is_kick_assembly,has_toekick').eq('room_id', R).order('label')
console.log(JSON.stringify(cabs))
for (const c of cabs) {
  const { data: parts } = await sb.from('case_parts').select('part_key,x,y,z,dx,dy,dz,material_id').eq('cabinet_instance_id', c.id)
  console.log(c.label, JSON.stringify(parts?.map(p => [p.part_key, p.x, p.y, p.z, p.dx, p.dy, p.dz])))
}
