// RHK9999: right waterfall outside face at 4225 (1605 from the Wall 2 end); BC-05 / BC-06 shrink to 519 / 520.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const R = process.argv[2]
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage()
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2000)
  for (const [l, p] of [['BC-06', { offset: 3605, dx: 520 }], ['BC-05', { offset: 3086, dx: 519 }], ['KICK 2', { offset: 3086, dx: 1039 }]]) {
    console.log(l, JSON.stringify(await page.evaluate(([l, p]) => window.__canvasApi.updateCabinet(l, p), [l, p]))); await sleep(1500)
  }
} finally { await browser.close() }
// Top: right end to 4225
const { data: bt } = await sb.from('benchtop_instances').select('id,polygon,segments').eq('room_id', R).single()
const X1 = 4225
const pts = bt.polygon.map(p => ({ x: p.x > 3000 ? X1 : p.x, y: p.y }))
const segments = bt.segments.map((s, i) => ({ ...s, p0: pts[i], p1: pts[(i + 1) % pts.length] }))
const { error } = await sb.from('benchtop_instances').update({ polygon: pts, segments, notes: '20 stone + 100 mitred apron, 900 top, 670 deep (20 past the 650 fronts), 3225 long. 100 waterfall both ends (built up: face piece + return): outside faces 1000 from Wall 1 and 1605 from the Wall 2 end. Undermount sink cut-out over BC-01; runs over the 600 bar fridge opening.' }).eq('id', bt.id)
console.log('top', error?.message ?? 'ok')
const { data: c } = await sb.from('cabinet_instances').select('label,pos_x,dx,dy,pos_z').eq('room_id', R).order('pos_x')
for (const x of c) console.log(x.label, x.pos_x, x.dx, x.dy, x.pos_z)
