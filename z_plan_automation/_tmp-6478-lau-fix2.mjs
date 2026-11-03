// RHK6478 Laundry: join kicks on the tub wall (tower drawer + bases), re-link the PDR basin. Each call capped at 30s.
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
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 120000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => { console.log('dialog', d.message()); d.dismiss() })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  const call = (fn, ...a) => Promise.race([page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]), sleep(30000).then(() => 'TIMEOUT')])
  for (const l of process.argv.slice(2)) { console.log('join', l, JSON.stringify(await call('joinKicks', l))); await sleep(3000) }
  await call('updateFixture', b.id, { x: Number(b.x) + 1, y: Number(b.y) }); await sleep(900)
  await call('updateFixture', b.id, { x: Number(b.x), y: Number(b.y) }); await sleep(1500)
  const st = await call('getState')
  for (const c of st.cabinets.filter(c => /KICK|BC-0|TC-0[1-5]/.test(c.label))) console.log(c.label, c.wall, c.offset, c.dx, c.dy)
  for (const f of st.fixtures ?? []) console.log('fixture', f.name, JSON.stringify({ x: f.x, y: f.y, cab: f.cabinet }))
} finally { await browser.close() }
