// RHK6339 J06 + J07 (Mark 2026-11-12): kick join, TC-02 hinge off the shelf holes, 80 pelmet (BH) to the window
// wall, timber pulls 770-1220 AFF, J06 desk top (2 pieces, centre join) + J07 bench, 35 solid timber Blackbutt.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '3bd26e44-cc9a-4c6f-bbae-a4fa0d59aeef'
const SCH = 'cadefc6c-ca21-4de4-b7ac-55b044a1bd15', METH = '58155ef3-dfc2-4ab1-96bd-a8b1c0400f73'
const walls = Object.fromEntries((await sb.from('walls').select('id,name').eq('room_id', R)).data.map(w => [w.name, w.id]))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const cabsOf = async () => (await sb.from('cabinet_instances').select('id,label,pos_z,dy,dz,face_grid,bulkhead,kick_run_id').eq('room_id', R)).data
const PULL_TOP = 1220 // pull 770-1220 AFF (scaled off the J07 elevation)

// Tops (height = carcass top 700 -> 735 FFL).
const top = async (label, P, edges, wall, notes) => {
  const { data: old } = await sb.from('benchtop_instances').select('id').eq('room_id', R).eq('label', label)
  if (old?.length) return console.log(label, 'exists')
  const segments = P.map((p0, i) => ({ type: 'line', p0, p1: P[(i + 1) % P.length], edge: { wall: edges[i] } }))
  const r = await sb.from('benchtop_instances').insert({
    room_id: R, label, polygon: P, segments, edge_tags: edges.map((w, i) => ({ type: w ? 'wall' : 'exposed', edge_index: i })),
    join_types: [], joins: [], arc_segments: [], cutout_polygons: [], wall_id: walls[wall], wall_side: 'face', height_mm: 700,
    benchtop_schedule_id: SCH, benchtop_build_method_id: METH, notes,
  }).select('id').single()
  console.log(label, r.error?.message ?? r.data.id)
}
const deskNote = 'J06 desk: 35 solid timber Blackbutt, clear matt lacquer, made by hand. 830 deep in front of the 130 trough (trough + steel outriggers BY OTHERS). Top 735 FFL. 50 recessed solid timber trim under the front edge (ours). '
await top('Desk A', [{ x: 0, y: 130 }, { x: 2248, y: 130 }, { x: 2248, y: 960 }, { x: 0, y: 960 }], [false, true, false, true], 'Wall 2',
  deskNote + 'Left half: W17 wall to the centre JOIN at 2248.')
await top('Desk B', [{ x: 2248, y: 130 }, { x: 4496, y: 130 }, { x: 4496, y: 960 }, { x: 2248, y: 960 }], [false, true, false, true], 'Wall 2',
  deskNote + 'Right half: centre JOIN at 2248 to the J07 wall, runs under the J07 left cupboard (TC-02, no bottom).')
await top('Bench', [{ x: 4496, y: 960 }, { x: 4496, y: 2977 }, { x: 4186, y: 2977 }, { x: 4186, y: 960 }], [true, true, false, true], 'Wall 3',
  'J07 bench: 35 solid timber Blackbutt, clear matt lacquer, made by hand. 310 deep (5 over the doors), 735 FFL, lines up with the J06 desk. Butts the desk front edge and TC-03.')

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  const api = (fn, ...a) => page.evaluate((fn, a) => window.__canvasApi[fn](...a), fn, a)
  let cabs = await cabsOf()
  if (!cabs.some(c => c.label.startsWith('KICK'))) { console.log('join', JSON.stringify(await api('joinKicks', 'BC-01'))); await sleep(5000) }
  cabs = await cabsOf()
  // Pelmet: BH 80 at 2147-2227 over TC-01 / TC-02 / WC-01, flush with the door faces.
  let bh = cabs.find(c => c.bulkhead)
  if (!bh) {
    const before = new Set(cabs.map(c => c.id))
    console.log('place BH', JSON.stringify(await api('placeCabinet', { def: 'BH', wall: walls['Wall 3'], offset: 0, dx: 2977 }))); await sleep(3000)
    cabs = await cabsOf(); bh = cabs.find(c => !before.has(c.id))
  }
  const off = { on: false, depth: 286, joint: 'mitre' }
  await sb.from('cabinet_instances').update({ bulkhead: { left: off, right: off, bottom: off, cleat: false, front: 'doors', auto_h: false, h_adjust: 2227 - 2700 },
    notes: 'J07 80 timber pelmet, 2147-2227 FFL (beam underside), over the window filler, left cupboard and open shelving to the window wall. LF-9 LED TBC.' }).eq('id', bh.id)
  console.log('BH', bh.label, JSON.stringify(await api('updateCabinet', bh.label, { dx: 2977, dy: 80, dz: 286, offset: 0 }))); await sleep(3000)

  // Pull insets (door top AFF - 1220) + TC-02 hinges off the shelf holes.
  cabs = await cabsOf()
  for (const label of ['TC-02', 'TC-03']) {
    const cab = cabs.find(c => c.label === label)
    const { data: fz } = await sb.from('face_zones').select('col_index,y,dy').eq('cabinet_instance_id', cab.id)
    const zones = cab.face_grid.zones.map(z => {
      const f = fz.find(q => q.col_index === z.col_index)
      const out = { ...z, handle_inset: Math.round((Number(cab.pos_z) + Number(f.y) + Number(f.dy) - PULL_TOP) * 10) / 10 }
      if (label === 'TC-02') out.hinges = [100, 800, Math.round(Number(f.dy) - 100)]
      return out
    })
    console.log(label, 'pos_z', cab.pos_z, JSON.stringify(zones.map(z => [z.handle_inset, z.hinges])))
    await sb.from('cabinet_instances').update({ face_grid: { ...cab.face_grid, zones } }).eq('id', cab.id)
    console.log(' ', JSON.stringify(await api('updateCabinet', label, { dz: 286 }))); await sleep(3000)
  }
  for (const ci of await api('getIssues')) for (const e of [...ci.errors, ...ci.warnings]) console.log(' ', ci.label, e.code, e.message)
} finally { await browser.close() }
console.log(JSON.stringify((await cabsOf()).map(c => [c.label, c.pos_z, c.dy, c.dz, c.kick_run_id?.slice(0, 6)])))
