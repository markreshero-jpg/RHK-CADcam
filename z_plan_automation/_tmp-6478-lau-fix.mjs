// RHK6478 Laundry: join the open bay + filler kick, re-link the PDR basin (rotation 0).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'fc12bc7d-53ee-46ee-a302-3411f5129bcc'
const { data: b } = await sb.from('room_fixtures').select('id,x,y').eq('room_id', R).ilike('name', 'PDR basin%').single()
await sb.from('room_fixtures').update({ rotation: 0 }).eq('id', b.id)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => { console.log('dialog', d.message()); d.dismiss() })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(2500)
  console.log('join', JSON.stringify(await page.evaluate(() => window.__canvasApi.joinKicks('BC-04')))); await sleep(3000)
  await page.evaluate(([id, x, y]) => window.__canvasApi.updateFixture(id, { x: x + 1, y }), [b.id, Number(b.x), Number(b.y)]); await sleep(900)
  await page.evaluate(([id, x, y]) => window.__canvasApi.updateFixture(id, { x, y }), [b.id, Number(b.x), Number(b.y)]); await sleep(900)
  const st = await page.evaluate(() => window.__canvasApi.getState())
  for (const c of st.cabinets.filter(c => /KICK|BC-0[2-6]/.test(c.label))) console.log(c.label, c.offset, c.dx, c.dy)
  for (const f of st.fixtures ?? []) console.log('fixture', f.name, JSON.stringify({ x: f.x, y: f.y, cab: f.cabinet }))
  const issues = await page.evaluate(() => window.__canvasApi.getIssues()); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
