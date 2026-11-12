// RHK6339 J06/J07 (Mark 2026-11-12): the beam (window lintel) over the J06 desk, from the WD 75 J07 elevation
// (hatched box top left, "ALIGN PELMET TO BEAM"): runs along Wall 2 the full 4496, underside 2227 FFL (735 + 1492),
// ~150 off the wall (its face = the start of the 3547 "beam to frame"; the 150 filler runs under it), ~215 high
// scaled off the 1:20 elevation (TBC). Display only / No CNC, like the J04 jamb: BUP + one custom part, new board
// "Structural Beam (existing, by others)".
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) throw new Error(t + ': ' + r.error.message); return r.data }
const R = '3bd26e44-cc9a-4c6f-bbae-a4fa0d59aeef', JAMB_MAT = '2c5d288d-4c1b-415f-9b01-71937bfe45da', GENERAL = '9768e64f-5133-4558-8375-b293405b976c'
const L = 4496, D = 150, H = 215, US = 2227
// material (copy of the jamb board's row, grey)
let mat = (await sb.from('materials').select('id').eq('name', 'Structural Beam (existing, by others)').maybeSingle()).data
if (!mat) {
  const src = chk('jm', await sb.from('materials').select('*').eq('id', JAMB_MAT).single())
  const { id: _i, created_at: _c, updated_at: _u, ...m } = src
  mat = chk('mat', await sb.from('materials').insert({ ...m, name: 'Structural Beam (existing, by others)', finish: 'Painted', dz: D, sheet_dx: 6000, sheet_dy: 300, has_grain: false,
    face_colour: '#8c8c8c', back_colour: '#8c8c8c', edge_colour: '#6e6e6e', notes: 'Display only: structural beams / lintels already in the building, by others. Drawn No CNC (RHK6339 J06).' }).select('id').single())
}
const tpart = chk('tp', await sb.from('cabinet_custom_parts').select('*').eq('material_override_id', JAMB_MAT).limit(1).single())
const cab = async l => (await sb.from('cabinet_instances').select('*').eq('room_id', R).eq('label', l).maybeSingle()).data
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('dialog', d => d.dismiss())
const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
const api = async (fn, ...a) => { const r = await page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message); await sleep(2500); return r }
try {
  await open()
  const W2 = chk('w', await sb.from('walls').select('id').eq('room_id', R).eq('name', 'Wall 2').single()).id
  let bc = (await sb.from('cabinet_instances').select('id,label').eq('room_id', R).ilike('notes', 'BEAM%').maybeSingle()).data
  if (!bc) {
    const before = new Set((await api('getState')).cabinets.map(c => c.label))
    console.log(JSON.stringify(await api('placeCabinet', { def: 'BUP', wall: W2, offset: 1000 })))
    const lbl = (await api('getState')).cabinets.map(c => c.label).find(l => !before.has(l))
    bc = await cab(lbl)
  }
  console.log('beam cabinet', bc.label)
  await open()
  chk('row', await sb.from('cabinet_instances').update({ dx: L, dy: H, dz: D, pos_x: 0, pos_y: 0, pos_z: US, rotation: 0, no_cnc: true,
    has_carcass: false, has_internal: false, has_face: false, has_toekick: false, rule_overrides: { UNDER_PANEL: true },
    notes: 'BEAM / window lintel over the J06 desk - existing, by others. Display only, No CNC. Full length of the desk wall, underside 2227 FFL (735 + 1492, WD 75), 150 off the wall (= start of the 3547 beam to frame; the 150 filler runs under it). Size 150 x 215 scaled off the 1:20 elevation - TBC.' }).eq('id', bc.id))
  const { id: _i, cabinet_instance_id: _c, created_at: _a, updated_at: _u, ...part } = tpart
  const row = { ...part, name: 'Beam 150 x 215 (existing, by others)', orientation: 'front', x: 0, y: 0, z: 0, dx: L, dy: H, dz: D, expressions: {}, material_id: mat.id, material_override_id: mat.id, no_cnc: true, sort_order: 0 }
  const cps = chk('parts', await sb.from('cabinet_custom_parts').select('id').eq('cabinet_instance_id', bc.id))
  if (cps.length) { chk('upd', await sb.from('cabinet_custom_parts').update(row).eq('id', cps[0].id)); for (const p of cps.slice(1)) chk('del', await sb.from('cabinet_custom_parts').delete().eq('id', p.id)) }
  else chk('ins', await sb.from('cabinet_custom_parts').insert({ ...row, cabinet_instance_id: bc.id }))
  await open()
  console.log(JSON.stringify(await api('updateCabinet', bc.label, { dz: D })))
  await open()
  for (const c of (await api('getState')).cabinets) console.log(' ', c.label, c.wall, 'off', c.offset, 'dx', c.dx, 'dy', c.dy, 'dz', c.dz)
  for (const ci of await api('getIssues')) for (const e of [...ci.errors, ...ci.warnings]) console.log('  !', ci.label, e.code, e.message)
  const b = await cab(bc.label); console.log('row', b.pos_x, b.pos_y, b.pos_z, b.dx, b.dy, b.dz, b.no_cnc)
  // elevation note on Wall 2
  const ann = chk('a', await sb.from('room_annotations').select('text,sort_order').eq('room_id', R))
  if (!ann.some(a => a.text?.startsWith('BEAM'))) {
    const so = Math.max(0, ...ann.map(a => a.sort_order ?? 0)) + 1
    console.log('note', (await sb.from('room_annotations').insert({ room_id: R, view: 'elevation', wall_id: W2, wall_side: 'face', kind: 'text', cad_layer_id: GENERAL,
      text: 'BEAM 150 x 215 (EXISTING, BY OTHERS) - U/S 2227 FFL, SIZE TBC', geom: { at: { x: 1300, y: -2520 } }, style: { size: 2.5 }, sort_order: so })).error?.message ?? 'ok')
  }
} finally { await browser.close() }
