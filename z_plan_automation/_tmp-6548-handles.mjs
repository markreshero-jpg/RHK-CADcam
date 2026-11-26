// RHK6548 Hard Coffee (Mark 2026-11-27): handles on all fronts, 128 cc bar for now (no handle in the email / plans).
// New library handle "Bar Handle 128cc (TBC)" + job schedule; doors vertical 50/50 (tall at 1000 AFF), drawers horizontal 50 from top.
// FC BC-03 'none' override cleared. False fronts / BC-05 inner drawer: no handle (Mark: pull from top edge).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const P = '31ed4cce-ffd3-4004-b8f1-d62f8dad6f5c'
const ROOMS = { ws: '2bed2187-0b9c-4cf3-9e3e-5d29be5538a0', fc: '09786d9b-378e-42ed-9fc7-1aed4c7b21ab', bc: 'd3c04ade-ba07-4462-a40c-2a4bd1952d31', bk: 'e8b3c950-5be5-4e4a-9117-451395e9d2a1' }
const NAME = 'Bar Handle 128cc (TBC)', SCHED = 'RHK6548 Hard Coffee - 128 bar (TBC)'

let h = chk('h', await sb.from('hardware_handles').select('id').eq('name', NAME)).at(0)
if (!h) h = chk('h ins', await sb.from('hardware_handles').insert({ name: NAME, brand: 'TBC', finish: 'TBC', notes: 'Placeholder 128 cc bar handle - RHK6548 Hard Coffee (Mark 27/11/26). Make/finish TBC.', active: true, grip_kind: 'hardware', handle_type: 'bar', bore_centres: 128, length: 140, holes: [], needs_finger_gap: false }).select('id').single())
let s = chk('s', await sb.from('handle_schedules').select('id').eq('name', SCHED)).at(0)
if (!s) {
  s = chk('s ins', await sb.from('handle_schedules').insert({ name: SCHED, active: true, is_default: false, description: 'Hard Coffee: 128 bar on all doors + drawers, make TBC' }).select('id').single())
  chk('e ins', await sb.from('handle_schedule_entries').insert([
    { schedule_id: s.id, role: 'door_base', handle_id: h.id, offset_from_edge_mm: 50, inset_from_side_mm: 50, orientation: 'vertical' },
    { schedule_id: s.id, role: 'door_tall', handle_id: h.id, offset_from_edge_mm: 50, inset_from_side_mm: 50, orientation: 'vertical', height_aff_mm: 1000 },
    { schedule_id: s.id, role: 'door_wall', handle_id: h.id, offset_from_edge_mm: 50, inset_from_side_mm: 50, orientation: 'vertical' },
    { schedule_id: s.id, role: 'drawer', handle_id: h.id, offset_from_edge_mm: 50, orientation: 'horizontal' },
  ]))
}
chk('job', await sb.from('projects').update({ handle_schedule_id: s.id }).eq('id', P))
const bc03 = chk('fc', await sb.from('cabinet_instances').select('id,face_grid').eq('room_id', ROOMS.fc).eq('label', 'BC-03').single())
const fg = structuredClone(bc03.face_grid); fg.zones = fg.zones.map(z => { const n = { ...z }; delete n.handle_id; return n })
chk('bc03', await sb.from('cabinet_instances').update({ face_grid: fg }).eq('id', bc03.id))
console.log('handle', h.id, 'schedule', s.id)

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  for (const [k, R] of Object.entries(ROOMS)) {
    const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
    page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
    await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
    for (const ci of await page.evaluate(() => window.__canvasApi.getIssues())) { const e = [...ci.errors, ...ci.warnings].map(x => x.code + ' ' + x.message); if (e.length) console.log(k, ci.label, JSON.stringify(e)) }
    await page.close()
  }
} finally { await browser.close() }
const ids = chk('ids', await sb.from('cabinet_instances').select('id,label,room_id').in('room_id', Object.values(ROOMS)))
for (const z of chk('fz', await sb.from('face_zones').select('cabinet_instance_id,face_type,y,dy,handle').in('cabinet_instance_id', ids.map(c => c.id)))) {
  const c = ids.find(x => x.id === z.cabinet_instance_id)
  console.log(Object.keys(ROOMS).find(k => ROOMS[k] === c.room_id), c.label, z.face_type, z.y, z.dy, JSON.stringify(z.handle && { n: z.handle.name, o: z.handle.orientation, x: z.handle.x, y: z.handle.y }))
}
process.exit(0)
