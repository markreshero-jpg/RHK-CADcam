// RHK6478 Kitchen: re-pose the fixtures through the Fixture panel path so each links to the cabinet under it.
import puppeteer from 'puppeteer-core'
const R = 'dd6c9440-6664-4e87-8ea9-4d88b7a9b1b6'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  const st = await page.evaluate(() => window.__canvasApi.getState())
  for (const f of st.fixtures) {
    if (f.cabinet || process.argv[2] === "mw") continue
    const y = /Microwave/.test(f.name) ? 0 : f.y
    await page.evaluate(([id, x, y, r]) => window.__canvasApi.updateFixture(id, { x, y, rotation: r }), [f.id, f.x, y, f.rotation]); await sleep(1500)
  }
  await sleep(2000)
  const s2 = await page.evaluate(() => window.__canvasApi.getState())
  console.log(JSON.stringify(s2.fixtures.map(f => [f.name.slice(0, 24), f.x, f.y, f.cabinet, f.clash])))
} finally { await browser.close() }
// microwave -> TC-07 (pocket unit, rot 0, origin (666, 0), x (1,0), perp (0,1)); centre (906 + 260, 0 + 200)
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { data: tc07 } = await sb.from('cabinet_instances').select('id,pos_x,pos_y').eq('room_id', R).eq('label', 'TC-07').single()
const { data: mw } = await sb.from('room_fixtures').select('id,x,y,width,depth').eq('room_id', R).ilike('name', 'Microwave%').single()
const u = await sb.from('room_fixtures').update({ cabinet_id: tc07.id, link_x: mw.x + mw.width / 2 - tc07.pos_x, link_z: mw.y + mw.depth / 2 - tc07.pos_y, link_rot: 0 }).eq('id', mw.id)
if (u.error) throw u.error
console.log('microwave linked to TC-07', tc07.pos_x, tc07.pos_y)
