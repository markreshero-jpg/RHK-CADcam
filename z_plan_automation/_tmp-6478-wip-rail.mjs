// RHK6478 WIP: re-resolve BC-01 so its top drawer box drops under the finger-pull backing rail.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'cb47d462-90eb-4ba0-8e6e-ca4d978628ae'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => { console.log('dialog', d.message()); d.dismiss() })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  console.log(JSON.stringify(await page.evaluate(() => window.__canvasApi.updateCabinet('BC-01', { dy: 760 }))))
  await sleep(6000)
} finally { await browser.close() }
const { data } = await sb.from('cabinet_instances').select('resolved_drawer_hw').eq('room_id', R).eq('label', 'BC-01').single()
for (const s of data.resolved_drawer_hw.drawer_stacks) console.log('row', s.face_zone_row, 'box', s.box_height, 'Y', s.box_Y, 'top', s.box_Y + s.box_height)
console.log('warnings', JSON.stringify(data.resolved_drawer_hw.warnings))
