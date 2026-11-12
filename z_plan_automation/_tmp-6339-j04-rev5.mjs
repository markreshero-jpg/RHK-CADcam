// RHK6339 J04 rev 5 (Mark 2026-11-12):
//  - BC-03 sink cupboard: one adjustable shelf (native internal grid fitting).
//  - 10 shadowline on top of WC-03: 10 high PT Black Matt 16.5 strip on edge, front set back 20 (face at 680),
//    from the left wall (x 0) to WC-04's left edge (1107) - a custom part in WC-03's assembly.
//  - 31 x 220 timber door jamb (existing, fitted on site, by others): caps the front end of Wall 1, 31 thick in
//    front of the 700 line (700-731), 220 across from the recess side - display-only board, No CNC.
//    Native cabinet: BUP on Wall 2, From left end -206 (face flush with the 14 lining = "sticks out 14"),
//    Off wall 700, one custom part 220 x H x 31. Height 2212 + position from Mark's markup rects.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'b2252689-fdc9-4fd7-be9a-f29853f0391e'
const BLACK = '6e802ddb'   // PT Colour Matt 16mm - Black Matt (prefix, resolved below)
const JAMB_H = 2212   // Mark's markup (mark up for ai layer) 2026-11-12
const chk = (t, r) => { if (r.error) throw new Error(t + ': ' + r.error.message); return r.data }
const cab = async l => (await sb.from('cabinet_instances').select('*').eq('room_id', R).eq('label', l).maybeSingle()).data

const black = chk('black', await sb.from('materials').select('id,name,dz').ilike('name', 'PT Colour Matt 16mm – Black Matt').single())
if (!black.id.startsWith(BLACK)) throw new Error('black board ' + black.id)

// Jamb board (display only), made once.
let jamb = (await sb.from('materials').select('id').eq('name', 'Timber Jamb 31mm (existing, by others)').maybeSingle()).data
if (!jamb) {
  const { id, created_at, updated_at, ...lining } = chk('lining', await sb.from('materials').select('*').eq('id', '3f6b71d6-8aa0-49eb-a4b7-38dd983037b9').single())
  jamb = chk('jamb mat', await sb.from('materials').insert({ ...lining, name: 'Timber Jamb 31mm (existing, by others)', dz: 31,
    notes: 'Display only: timber door jambs already fitted on site, by others. Drawn No CNC (RHK6339 J04).' }).select('id').single())
}
console.log('jamb board', jamb.id)

// 1. BC-03 shelf.
const bc3 = await cab('BC-03')
chk('bc03', await sb.from('cabinet_instances').update({ internal_grid: { tree: { type: 'open', fittings: [{ type: 'adj_shelf', y_locked: false }] } } }).eq('id', bc3.id))

// 2. Shadowline strip on WC-03 (cabinet frame: x from WC-03's left = offset 14, y up from its bottom, z from the wall).
const wc3 = await cab('WC-03'), wc4 = await cab('WC-04')
const strip = { cabinet_instance_id: wc3.id, part_library_id: 'ecd95bb2-900b-4341-ab42-d6b98412f2e0', name: 'Shadowline strip 10 (PT Black Matt, set back 20)', orientation: 'front',
  x: -14, y: wc3.dy, z: 700 - 20 - black.dz, dx: 1107, dy: 10, dz: black.dz, expressions: {},
  material_id: black.id, material_override_id: black.id, edge_top: false, edge_bottom: false, edge_left: false, edge_right: false,
  no_cnc: false, visible: true, sort_order: 0 }
const old = chk('old strip', await sb.from('cabinet_custom_parts').select('id').eq('cabinet_instance_id', wc3.id).ilike('name', 'Shadowline strip%'))
if (old.length) chk('strip upd', await sb.from('cabinet_custom_parts').update(strip).eq('id', old[0].id))
else chk('strip ins', await sb.from('cabinet_custom_parts').insert(strip))
console.log('strip', wc4 ? `to WC-04 left ${wc4.pos_x}` : '')

const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('dialog', d => d.dismiss())
const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
const api = async (fn, ...a) => { const r = await page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message); await sleep(2500); return r }
try {
  await open()
  console.log(JSON.stringify(await api('updateCabinet', 'BC-03', { dz: 676 })))
  console.log(JSON.stringify(await api('updateCabinet', 'WC-03', { dz: 510 })))

  // 3. Jamb.
  const before = new Set((await api('getState')).cabinets.map(c => c.label))
  let jc = (await sb.from('cabinet_instances').select('id,label').eq('room_id', R).ilike('notes', 'DOOR JAMB%').maybeSingle()).data
  if (!jc) {
    console.log(JSON.stringify(await api('placeCabinet', { def: 'BUP', wall: 'Wall 2', offset: 600 })))
    const lbl = (await api('getState')).cabinets.map(c => c.label).find(l => !before.has(l))
    jc = await cab(lbl)
    chk('jamb cab', await sb.from('cabinet_instances').update({ notes: 'DOOR JAMB 31 x 220 timber - existing, fitted on site (by others). Display only, No CNC. 2212 high (Mark markup).', no_cnc: true }).eq('id', jc.id))
    await open()
  }
  console.log('jamb cabinet', jc.label)
  console.log(JSON.stringify(await api('updateCabinet', jc.label, { dx: 220, dy: JAMB_H, dz: 31, pos_z: 0 })))
  chk('jamb pos', await sb.from('cabinet_instances').update({ pos_x: -206, pos_y: 700 }).eq('id', jc.id))
  const cps = chk('jamb parts', await sb.from('cabinet_custom_parts').select('*').eq('cabinet_instance_id', jc.id))
  const part = { part_library_id: '0b364a0a-9018-4852-8ef5-172ab05dac32', name: 'Door jamb 31 x 220 (existing, by others)', orientation: 'front', x: 0, y: 0, z: 0, dx: 220, dy: JAMB_H, dz: 31, expressions: {},
    material_id: jamb.id, material_override_id: jamb.id, edge_top: false, edge_bottom: false, edge_left: false, edge_right: false, no_cnc: true, visible: true, sort_order: 0 }
  if (cps.length) { chk('jp upd', await sb.from('cabinet_custom_parts').update(part).eq('id', cps[0].id)); for (const p of cps.slice(1)) chk('jp del', await sb.from('cabinet_custom_parts').delete().eq('id', p.id)) }
  else chk('jp ins', await sb.from('cabinet_custom_parts').insert({ ...part, cabinet_instance_id: jc.id }))
  await open()
  console.log(JSON.stringify(await api('updateCabinet', jc.label, { dz: 31 })))
  await open()
  const st = await api('getState')
  for (const c of st.cabinets) console.log(' ', c.label, 'off', c.offset, 'dx', c.dx, 'dy', c.dy, 'dz', c.dz)
  for (const ci of await api('getIssues')) for (const e of [...ci.errors, ...ci.warnings]) console.log('  !', ci.label, e.code, e.message)
  const j = await cab(jc.label)
  console.log('jamb row', j.pos_x, j.pos_y, j.pos_z, j.dx, j.dy, j.dz)
} finally { await browser.close() }

const { data: ip } = await sb.from('internal_parts').select('*').eq('cabinet_instance_id', bc3.id)
for (const p of ip ?? []) console.log('BC-03', p.part_type ?? p.type, p.dx, p.dy, p.dz)
