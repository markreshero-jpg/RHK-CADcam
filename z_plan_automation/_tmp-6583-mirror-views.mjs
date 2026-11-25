// RHK6583 Piggott TC-02: re-resolve so the doors carry the insert (z_faced_doors F9),
// then screenshot the cabinet edit modal views and click the mirror in each.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '33e64c8a-ebf9-498f-86d1-9879b1ccba0d'
const OUT = process.argv[2]
const sleep = ms => new Promise(r => setTimeout(r, ms))
const c = (await sb.from('cabinet_instances').select('id,dy').eq('room_id', R).eq('label', 'TC-02').single()).data
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--window-size=1900,1200'], defaultViewport: { width: 1900, height: 1200 }, protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('pageerror', e.message.slice(0, 300)))
  page.on('console', m => { if (m.type() === 'error') console.log('console.error', m.text().slice(0, 300)) })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 300000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 300000 }); await sleep(4000)
  await page.evaluate((dy) => window.__canvasApi.updateCabinet('TC-02', { dy }), c.dy); await sleep(6000)
  await page.evaluate(() => window.__canvasApi.openCabinet('TC-02')); await sleep(6000)
  const click = async t => { await page.evaluate(t => { const b = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === t).pop(); b?.click() }, t); await sleep(3000) }
  // Elevation: click the mirror, pick it from the list -> info panel
  await click('Elevation')
  const el = await page.evaluate(() => { const b = document.querySelector('[data-part-id^="hw_insert"]').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } })
  await page.mouse.click(el.x, el.y); await sleep(1200)
  await page.evaluate(() => { const r = [...document.querySelectorAll('button, div')].filter(e => e.children.length <= 3 && /4mm Mirror — bought in/.test(e.textContent)).pop(); r?.click() }); await sleep(1500)
  await page.screenshot({ path: `${OUT}/pick-Elevation.png` })
  // 3D: right-click the left mirror -> info panel
  await click('3D'); await sleep(5000)
  await page.mouse.click(718, 700, { button: 'right' }); await sleep(2000)
  await page.screenshot({ path: `${OUT}/pick-3D.png` })
} finally { await browser.close() }
const zs = (await sb.from('face_zones').select('col_index,door_profile').eq('cabinet_instance_id', c.id)).data
for (const z of zs) console.log(z.col_index, JSON.stringify(z.door_profile?.ops?.map(o => o.pane)))
