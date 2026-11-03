// RHK6478 DS TV Unit: wall cabinets always sit square to their own wall (geometry.ts cabinetPlanFrame), so a unit
// with a straight front against the 7.89 deg TV wall hangs off a square detached line instead: Wall 4, an island
// line (thickness 0, face south) along the right cols' backs. Left bays stand 300 off it (cabWallGap, from pos).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = '46c02367-c556-489e-9907-67785eb2cd87', Y = 212.8, SPAN = 3701
let w4 = chk('w4?', await sb.from('walls').select('id').eq('room_id', R).eq('name', 'Wall 4').maybeSingle())
if (!w4) w4 = chk('w4', await sb.from('walls').insert({ room_id: R, name: 'Wall 4', sort_order: 3, length: SPAN, angle: 0, pos_x: 0, pos_y: Y,
  thickness: 0, height: 2720, wall_type: 'island' }).select('id').single())
chk('cabs', await sb.from('cabinet_instances').update({ wall_id: w4.id }).eq('room_id', R))
chk('notes', await sb.from('room_annotations').update({ wall_id: w4.id }).eq('room_id', R).eq('view', 'elevation'))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 600000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => { console.log('dialog', d.message()); d.dismiss() })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 180000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 180000 }); await sleep(4000)
  const api = (fn, ...a) => Promise.race([page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]), sleep(90000).then(() => 'TIMEOUT')])
  const st = await api('getState')
  for (const c of st.cabinets) { await api('updateCabinet', c.label, { dz: c.dz }); await sleep(700) }
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
for (const c of chk('fin', await sb.from('cabinet_instances').select('label,pos_x,pos_y,rotation').eq('room_id', R).order('label'))) console.log(c.label, c.pos_x, c.pos_y, c.rotation)
