// RHK6478 WIP: re-place the 180-degree fixtures (x / y is the pivot corner when turned 180).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'cb47d462-90eb-4ba0-8e6e-ca4d978628ae'
const { data: fx } = await sb.from('room_fixtures').select('id,name,x,y,width,depth,rotation').eq('room_id', R)
const want = { Abey: [1631, 2102], 'V&B': [1394.5, 2182], Bosch: [2320, 2182] }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  for (const f of fx) {
    const k = Object.keys(want).find(k => f.name.startsWith(k)); if (!k) continue
    await page.evaluate(([id, x, y]) => window.__canvasApi.updateFixture(id, { x, y, rotation: 180 }), [f.id, ...want[k]]); await sleep(1000)
  }
  const st = await page.evaluate(() => window.__canvasApi.getState())
  for (const f of st.fixtures ?? []) console.log(f.name.slice(0, 30), JSON.stringify({ x: f.x, y: f.y, rot: f.rotation, cab: f.cabinet, clash: f.clash }))
} finally { await browser.close() }
