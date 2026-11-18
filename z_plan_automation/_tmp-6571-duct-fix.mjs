// RHK6571 WC-03: put the duct-out-the-back setting back (dropped by an app tab on the pre-R13 code); shelf_h left as found.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '5a1ef0f2-d86e-4c67-8b0e-df4a80dd09c3'
const w3 = (await sb.from('cabinet_instances').select('id,rangehood').eq('room_id', R).eq('label', 'WC-03').single()).data
console.log('found', JSON.stringify(w3.rangehood))
const u = await sb.from('cabinet_instances').update({ rangehood: { ...w3.rangehood, duct: { out: 'back', dia: 200, h: 380 } } }).eq('id', w3.id)
if (u.error) throw u.error
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 600000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 180000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await new Promise(r => setTimeout(r, 5000))
  await page.evaluate(() => window.__canvasApi.updateCabinet('WC-03', { dy: 680 })); await new Promise(r => setTimeout(r, 3000))
  const r3 = await page.evaluate(() => window.__canvasApi.getResolved('WC-03'))
  console.log('back', JSON.stringify(r3.case_parts.filter(p => p.part_key === 'back').map(p => [p.DX, JSON.stringify(p.cutouts)])), 'rh parts', r3.case_parts.filter(p => p.part_key.startsWith('rh:')).length, 'shelves', JSON.stringify(r3.internal_parts.map(p => [p.part_type, p.Y])), 'warn', JSON.stringify(r3.warnings.map(w => w.message)))
} finally { await browser.close() }
