// RHK6468 Wall Panelling rev 1 (Mark 2026-11-16):
//  - garage door = flush hinged, 33 American Oak veneer, face flush with the panel face (TC-01)
//  - no 3mm joiner strips (keep the 3 gaps for movement) - notes updated
//  - rotate the whole room 90 deg to the left (walls, cabinets, Mark's plan CAD) about the media corner (-3130, 2000)
//    so it reads like the 2.01 floor plan (entry wall west -> east, lounge going north).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const ROOM = '00e46b73-13de-4df3-9235-871505d4ee81', V33 = 'a8ec07f1-50df-4440-9157-686efefa56c2'
const PX = -3130, PY = 2000
// 90 deg left on screen (y down): (dx, dy) -> (dy, -dx); angles -90
const rot = (x, y) => ({ x: PX + (y - PY), y: PY - (x - PX) })
const ang = a => (((a - 90) % 360) + 360) % 360
const DONE = process.argv[2] === 'norotate'

const cabs = chk('cabs', await sb.from('cabinet_instances').select('id,label,pos_x,pos_y,rotation,notes').eq('room_id', ROOM).order('label'))
const C = l => cabs.find(c => c.label === l)

if (!DONE) {
  // walls
  for (const w of chk('walls', await sb.from('walls').select('id,name,pos_x,pos_y,angle').eq('room_id', ROOM))) {
    const p = rot(w.pos_x, w.pos_y)
    chk('w', await sb.from('walls').update({ pos_x: p.x, pos_y: p.y, angle: ang(w.angle) }).eq('id', w.id))
    console.log(w.name, w.angle, '->', ang(w.angle), p)
  }
  // cabinets
  for (const c of cabs) {
    const p = rot(c.pos_x, c.pos_y)
    chk('c', await sb.from('cabinet_instances').update({ pos_x: p.x, pos_y: p.y, rotation: ang(c.rotation) }).eq('id', c.id))
  }
  // Mark's CAD (edited in place, nothing deleted)
  const ann = chk('ann', await sb.from('room_annotations').select('id,view,geom').eq('room_id', ROOM))
  let n = 0
  for (const a of ann) {
    if (a.view !== 'plan') continue
    const g = structuredClone(a.geom)
    if (g.pts) g.pts = g.pts.map(p => rot(p.x, p.y))
    if (g.at) g.at = rot(g.at.x, g.at.y)
    for (const k of ['a', 'b', 'p1', 'p2', 'center', 'c']) if (g[k] && typeof g[k].x === 'number') g[k] = rot(g[k].x, g[k].y)
    chk('a', await sb.from('room_annotations').update({ geom: g }).eq('id', a.id)); n++
  }
  console.log('rotated annotations', n, 'of', ann.length)
}

// notes: no joiner strips
const fixNote = s => s.replace(' + 3mm joiner strip on the back in the gap (not modelled)', '; 3 gaps left for movement (no joiner strips)')
for (const c of cabs) if (c.notes?.includes('joiner')) chk('n', await sb.from('cabinet_instances').update({ notes: fixNote(c.notes) }).eq('id', c.id))
const tc01 = C('TC-01')
chk('n1', await sb.from('cabinet_instances').update({ notes: fixNote(tc01.notes).replace('Bay 4 = garage door 925 x 2345 (by others, position TBC)',
  'Bay 4 = garage door opening 925 x 2345: FLUSH HINGED door, 33 American Oak veneer, face flush with the panels (Mark 2026-11-16), 3 gaps round it, hinges TBC') }).eq('id', tc01.id))

// garage door leaf: 33 thick, face flush with the 17 panels (z -16 .. 17), 3 gaps to the jambs / over-door panel, 10 off the floor
const parts = chk('parts', await sb.from('cabinet_custom_parts').select('*').eq('cabinet_instance_id', tc01.id))
if (!parts.some(p => p.name.startsWith('Garage door'))) {
  const { id, created_at, updated_at, ...base } = parts.find(p => p.name === 'Panel A1')
  chk('door', await sb.from('cabinet_custom_parts').insert({ ...base, name: 'Garage door leaf (flush hinged, 33)', x: 3415.5, y: 10, z: -16,
    dx: 919, dy: 2332, dz: 33, material_id: V33, material_override_id: V33, edge_top: true, edge_bottom: true, edge_left: true, edge_right: true, sort_order: parts.length }))
}

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 600000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('dialog', d => { console.log('dialog', d.message()); d.dismiss() })
const open = async () => { await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
const api = async (fn, ...a) => { const r = await Promise.race([page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message), sleep(90000).then(() => 'TIMEOUT')]); await sleep(1200); return r }
try {
  await open()
  const st = await api('getState')
  for (const c of st.cabinets) console.log('re-resolve', JSON.stringify(await api('updateCabinet', c.id, { dz: c.dz })))
  await open()
  const st2 = await api('getState')
  for (const c of st2.cabinets) console.log(c.label, c.wall, c.offset, c.dx, c.dy, c.dz)
  const rp = await api('getResolved', tc01.id)
  for (const p of rp?.custom_parts ?? []) if (/Garage/.test(p.name)) console.log('  ', p.name, p.x, p.y, p.z, '|', p.dx, p.dy, p.dz)
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
