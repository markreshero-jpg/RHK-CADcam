// RHK6542 Danny's Robe rev3b: AV flap hinge plates on the AV shelf (locked hinges, mount 'shelf').
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '830e087b-d817-4843-b766-5fbdd8ee6c4a', sleep = ms => new Promise(r => setTimeout(r, ms))
const id = chk('cab', await sb.from('cabinet_instances').select('id').eq('room_id', R).eq('label', 'TC-03').single()).id
console.log(chk('hinges', await sb.from('hinge_instances').update({ mounting_surface: 'shelf', y_locked: true }).eq('cabinet_instance_id', id).select('sort_order,y_position_mm,mounting_surface')))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' }); page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  await page.evaluate(() => window.__canvasApi.updateCabinet('TC-03', { dz: 580 })); await sleep(3000)
  const rp = await page.evaluate(() => window.__canvasApi.getResolved('TC-03'))
  for (const h of rp.hinge_instances) console.log(h.sort_order, h.y_position_mm, h.mounting_surface, JSON.stringify(h.mount_target), 'cup', JSON.stringify(h.cup_drills.slice(0, 1).map(d => [d.x, d.y, d.z])), 'plate', JSON.stringify(h.plate_drills.map(d => [Math.round(d.x), Math.round(d.y * 10) / 10, Math.round(d.z * 10) / 10, d.axis])))
  const issues = await page.evaluate(() => window.__canvasApi.getIssues()); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('errors', issues.reduce((a, c) => a + c.errors.length, 0), 'issues', n)
} finally { await browser.close() }
