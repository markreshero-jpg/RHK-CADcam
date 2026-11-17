// RHK6478 Buffet (Mark 2026-11-18): fillers side-on like DS Linen - a 70 strip standing between the cabinet and the wall,
// board edge to the front flush with the fronts, front edge taped only.
//  BC-04 BFK 18 2pac (on the kick): 70 x 18, front at 595 (cab.d + 2 + t.exposed).
//  WC-01 / WC-04 16.5 Teak uppers (stand on the bench, so no WF-L bottom leg): def -> WF-L, 70 x 16.5, front at 368.5 (flush with WC-03 doors).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer-core'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) { console.log('ERR', t, r.error.message); process.exit(1) } return r.data }
const R = '0df13af4-8a6f-438f-a10d-6a9b4754aa97'
const FRONT_Z = 'cab.d + 2 + t.exposed - 70'
const wfl = chk('wfl', await sb.from('cabinet_definitions').select('id').eq('name', 'WF-L').single()).id
const cabs = chk('cabs', await sb.from('cabinet_instances').select('id,label,dz').eq('room_id', R))
const by = l => cabs.find(c => c.label === l)
const plan = {
  'BC-04': { ex: { y: 'cab.kick', z: FRONT_Z, dx: '70', dy: 'cab.h - cab.kick', dz: 't.exposed' },
    note: '18 side-on filler (BFK) to Wall 3: 70 x 18 Satin Board 2pac 25W, front flush with the drawer fronts, front edge taped only (Mark 2026-11-18)' },
  'WC-01': { def: wfl, ex: { z: FRONT_Z, dx: '70', dy: 'cab.h', dz: 't.exposed' },
    note: '16.5 side-on Sublime Teak filler (WF-L, no bottom leg - stands on the bench) to Wall 1: 70 x 16.5, front flush with the doors, front edge taped only (Mark 2026-11-18)' },
  'WC-04': { def: wfl, ex: { z: FRONT_Z, dx: '70', dy: 'cab.h', dz: 't.exposed' },
    note: '16.5 side-on Sublime Teak filler (WF-L, no bottom leg - stands on the bench) to Wall 3: 70 x 16.5, front flush with the doors, front edge taped only (Mark 2026-11-18)' },
}
for (const [l, v] of Object.entries(plan)) {
  const p = chk('p', await sb.from('cabinet_custom_parts').select('id,name,orientation').eq('cabinet_instance_id', by(l).id))
  if (p.length !== 1 || p[0].orientation === 'side') { console.log(l, 'unexpected', JSON.stringify(p)); process.exit(1) }
  chk('cp', await sb.from('cabinet_custom_parts').update({ name: 'Filler', orientation: 'side', x: 0, dx: 70, expressions: v.ex,
    edge_top: false, edge_bottom: false, edge_left: false, edge_right: true }).eq('id', p[0].id))
  chk('cab', await sb.from('cabinet_instances').update({ notes: v.note, ...(v.def ? { cabinet_definition_id: v.def } : {}) }).eq('id', by(l).id))
  console.log(l, 'side-on')
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); page.on('dialog', d => d.dismiss())
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 240000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 240000 }); await sleep(4000)
  for (const l of Object.keys(plan)) { await page.evaluate(([i, z]) => window.__canvasApi.updateCabinet(i, { dz: z }), [by(l).id, by(l).dz]); await sleep(1500) }
  const iss = await page.evaluate(() => window.__canvasApi.getIssues())
  for (const x of iss) for (const e of [...x.errors, ...x.warnings]) console.log('ISSUE', x.label, e.code, e.message)
} finally { await browser.close() }
const after = chk('after', await sb.from('cabinet_custom_parts').select('cabinet_instance_id,orientation,y,z,dx,dy,dz,edge_right,edge_left,edge_top,edge_bottom').in('cabinet_instance_id', Object.keys(plan).map(l => by(l).id)))
for (const p of after) console.log(cabs.find(c => c.id === p.cabinet_instance_id).label, JSON.stringify(p).replace(/"cabinet_instance_id":"[^"]+",/, ''))
process.exit(0)
