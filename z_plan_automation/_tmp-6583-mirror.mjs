// RHK6583 Piggott TC-02: put the inset mirror profile on both doors (keeps their 2pac
// style + colour), re-resolve, report the face zones' panes + issues.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '33e64c8a-ebf9-498f-86d1-9879b1ccba0d'
const PROFILE = '23055a2d-e149-4e38-8d11-c8ee80c4bd1f'   // Mirror inset — 60 sides, 100 bottom, 420 top
const sleep = ms => new Promise(r => setTimeout(r, ms))

const c = (await sb.from('cabinet_instances').select('id,face_grid,dy').eq('room_id', R).eq('label', 'TC-02').single()).data
const fg = c.face_grid
fg.zones = fg.zones.map(z => z.face_type === 'door' ? { ...z, door_profile_id: PROFILE } : z)
const up = await sb.from('cabinet_instances').update({ face_grid: fg }).eq('id', c.id)
if (up.error) throw up.error

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 180000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 240000 }); await sleep(4000)
  await page.evaluate((dy) => window.__canvasApi.updateCabinet('TC-02', { dy }), c.dy); await sleep(5000)
  const issues = await page.evaluate(() => window.__canvasApi.getIssues())
  console.log('issues', JSON.stringify(issues.filter(ci => ci.label === 'TC-02').flatMap(ci => [...ci.errors, ...ci.warnings].map(e => `${e.code}: ${e.message}`))))
} finally { await browser.close() }

const zs = (await sb.from('face_zones').select('row_index,col_index,dx,dy,door_profile').eq('cabinet_instance_id', c.id)).data
for (const z of zs) console.log(z.col_index, z.dx, z.dy, JSON.stringify(z.door_profile?.ops?.map(o => ({ t: o.offset_top_mm, b: o.offset_bottom_mm, l: o.offset_left_mm, r: o.offset_right_mm, pane: o.pane }))))
