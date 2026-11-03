// RHK6542 Danny's Robe rev6 (Mark's updated site measure 2026-11-03): 2984 f/p wide, 716 o/a return,
// CH 2554 off slab to finished plaster (no deduction) -> robe stays 2400, bulkhead 154.
// 30 fillers kept, middle bay kept 1135 (TV), outer bays 902.5 -> 894.5.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '830e087b-d817-4843-b766-5fbdd8ee6c4a', sleep = ms => new Promise(r => setTimeout(r, ms))
const W = 2984, RET = 716, CH = 2554, F = 30, MID = 1135, OUT = (W - 2 * F - MID) / 2   // 894.5
const x2 = F + OUT, x3 = x2 + MID                                                        // 924.5, 2059.5
chk('room', await sb.from('rooms').update({ room_dy: CH }).eq('id', R))
const wall = async (n, p) => chk(n, await sb.from('walls').update({ ...p, height: CH }).eq('room_id', R).eq('name', n))
await wall('Wall 1', { pos_x: 0, pos_y: RET, length: RET })
await wall('Wall 2', { pos_x: 0, pos_y: 0, length: W })
await wall('Wall 3', { pos_x: W, pos_y: 0, length: RET })
const cab = async (l, p) => chk(l, await sb.from('cabinet_instances').update(p).eq('room_id', R).eq('label', l))
await cab('TC-01', { pos_x: 0 }); await cab('TC-05', { pos_x: W - F })
for (const [l, x, dx] of [['TC-02', F, OUT], ['WC-01', F, OUT], ['TC-03', x2, MID], ['WC-02', x2, MID], ['TC-04', x3, OUT], ['WC-03', x3, OUT]]) await cab(l, { pos_x: x, dx })
await cab('WC-04', { pos_x: 0, dx: W, dy: CH - 2400 })
await cab('KICK 1', { pos_x: 0, dx: W })
// Notes: bay 2 notes -8, bay 3 -16, rails on the bay centres, site notes text.
const notes = chk('notes', await sb.from('room_annotations').select('id,text,geom').eq('room_id', R))
for (const a of notes) {
  let g = a.geom, text = a.text
  if (a.text === 'HANGING RAIL') g = { ...g, at: { ...g.at, x: g.at.x < 1000 ? F + OUT / 2 - 165 : x3 + OUT / 2 - 165 } }
  else if (a.text.startsWith('SHOE')) g = { ...g, width: (OUT - 60) / 20 }
  else if (/^(COB|TV|FLAP)/.test(a.text)) g = { ...g, at: { ...g.at, x: x2 + 30 } }
  else if (a.text.startsWith('SLIDING')) g = { ...g, at: { ...g.at, x: x3 + 30 }, width: (OUT - 60) / 20 }
  else if (a.text.startsWith('MDF')) g = { ...g, width: (W - 60) / 20 }
  else if (a.text.startsWith('SITE NOTES')) text = 'SITE NOTES\nCeiling 2554 off slab to finished plaster (no deduction), robe 2400, 154 bulkhead\nRobe 2984 f/p wall to wall, 716 o/a return wall, 30 fillers each end\nCarcass 580 deep, 125 sliding door zone in front\nNo LV wire coming through the wall - TV cables run behind the false panel\nSliding doors - to come'
  else if (a.text.startsWith('SPEC')) continue
  chk('note', await sb.from('room_annotations').update({ geom: g, text }).eq('id', a.id))
}
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' }); page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  for (const l of ['TC-01', 'TC-02', 'TC-03', 'TC-04', 'TC-05', 'WC-01', 'WC-02', 'WC-03', 'WC-04', 'KICK 1']) {
    const dz = l === 'TC-01' || l === 'TC-05' ? 578 : 580
    await page.evaluate(([l, dz]) => window.__canvasApi.updateCabinet(l, { dz }), [l, dz]); await sleep(1800)
  }
  const db = chk('db', await sb.from('cabinet_instances').select('label,pos_x,pos_z,dx,dy,dz').eq('room_id', R).order('label'))
  for (const c of db) console.log(c.label, c.pos_x, c.pos_z, c.dx, c.dy, c.dz)
  for (const l of ['TC-02', 'TC-04', 'WC-04', 'KICK 1']) {
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    console.log('==', l, JSON.stringify([...rp.case_parts, ...rp.toekick_parts].slice(0, 4).map(p => [p.part_key ?? p.part_type, p.DX, p.DY, p.DZ])),
      JSON.stringify(rp.internal_parts.filter(p => /front|accessory/.test(p.part_type)).map(p => [p.part_type, p.Y, p.DY])))
  }
  const issues = await page.evaluate(() => window.__canvasApi.getIssues()); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('errors', issues.reduce((a, c) => a + c.errors.length, 0), 'issues', n)
} finally { await browser.close() }
