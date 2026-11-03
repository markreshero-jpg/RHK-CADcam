import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '443a1553-14c4-4b8d-bd1f-2e5890b827e7'
const hinges = JSON.parse(process.argv[2])
const c = (await sb.from('cabinet_instances').select('id,face_grid').eq('room_id', R).eq('label', 'WC-01').single()).data
const fg = c.face_grid; fg.zones = fg.zones.map(z => ({ ...z, hinges }))
console.log((await sb.from('cabinet_instances').update({ face_grid: fg }).eq('id', c.id)).error?.message ?? 'fg ok')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' }); page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  await page.evaluate(() => window.__canvasApi.updateCabinet('WC-01', { dz: 380 })); await sleep(2000)
  const rp = await page.evaluate(() => window.__canvasApi.getResolved('WC-01'))
  console.log('hinges', JSON.stringify(rp.hinge_instances.map(h => h.y_position_mm)))
  const issues = await page.evaluate(() => window.__canvasApi.getIssues()); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
