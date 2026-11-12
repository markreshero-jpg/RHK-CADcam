// RHK6339 J07 (Mark 2026-11-12): the top's right end butts a door jamb. Wall 4 = 305 return (frame to back of jamb)
// at the end of Wall 3, 220 thick; door jamb 31 x 220 on its end, same as J04 BC-04 (BUP + one custom part,
// "Timber Jamb 31mm (existing, by others)", display only / No CNC), 305-336 off Wall 3, floor to 2260
// (door leaf top = beam U/S 2227 per WD 75, jamb runs past the 33 top - height TBC).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) throw new Error(t + ': ' + r.error.message); return r.data }
const R = '3bd26e44-cc9a-4c6f-bbae-a4fa0d59aeef', J4 = 'b2252689-fdc9-4fd7-be9a-f29853f0391e', H = 2260
const tmpl = chk('bc04', await sb.from('cabinet_instances').select('id,notes').eq('room_id', J4).eq('label', 'BC-04').single())
const tpart = chk('bc04 part', await sb.from('cabinet_custom_parts').select('*').eq('cabinet_instance_id', tmpl.id).single())
const cab = async l => (await sb.from('cabinet_instances').select('*').eq('room_id', R).eq('label', l).maybeSingle()).data
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('dialog', d => d.dismiss())
const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
const api = async (fn, ...a) => { const r = await page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message); await sleep(2500); return r }
try {
  await open()
  let walls = chk('w', await sb.from('walls').select('id,name').eq('room_id', R))
  if (!walls.some(w => w.name === 'Wall 4')) console.log('wall', JSON.stringify(await api('drawWall', { x: 4496, y: 3697, length: 305, angle: 180, thickness: 220, height: 2700 })))
  walls = chk('w', await sb.from('walls').select('id,name,thickness').eq('room_id', R)); console.log(JSON.stringify(walls))
  const W3 = walls.find(w => w.name === 'Wall 3').id
  let jc = (await sb.from('cabinet_instances').select('id,label').eq('room_id', R).ilike('notes', 'DOOR JAMB%').maybeSingle()).data
  if (!jc) {
    const before = new Set((await api('getState')).cabinets.map(c => c.label))
    console.log(JSON.stringify(await api('placeCabinet', { def: 'BUP', wall: W3, offset: 2000 })))
    const lbl = (await api('getState')).cabinets.map(c => c.label).find(l => !before.has(l))
    jc = await cab(lbl)
  }
  console.log('jamb cabinet', jc.label)
  await open()   // let the app's post-place save land first (J04 rev 6 gotcha)
  chk('jamb row', await sb.from('cabinet_instances').update({ dx: 220, dy: H, dz: 31, pos_x: 4496 - 305, pos_y: 3697, pos_z: 0, rotation: 90, no_cnc: true,
    has_carcass: false, has_internal: false, has_face: false, has_toekick: false, rule_overrides: { UNDER_PANEL: true },
    notes: 'DOOR JAMB 31 x 220 timber - existing, fitted on site (by others). Display only, No CNC. On the end of the 305 return (Wall 4), 305-336 off the J07 frame. Floor to 2260 TBC (door leaf top = beam U/S 2227). The J07 33 top butts it.' }).eq('id', jc.id))
  const { id: _i, cabinet_instance_id: _c, created_at: _a, updated_at: _u, ...part } = tpart
  const cps = chk('parts', await sb.from('cabinet_custom_parts').select('id').eq('cabinet_instance_id', jc.id))
  const row = { ...part, dy: H }
  if (cps.length) { chk('upd', await sb.from('cabinet_custom_parts').update(row).eq('id', cps[0].id)); for (const p of cps.slice(1)) chk('del', await sb.from('cabinet_custom_parts').delete().eq('id', p.id)) }
  else chk('ins', await sb.from('cabinet_custom_parts').insert({ ...row, cabinet_instance_id: jc.id }))
  await open()
  console.log(JSON.stringify(await api('updateCabinet', jc.label, { dz: 31 })))
  await open()
  for (const c of (await api('getState')).cabinets) console.log(' ', c.label, c.wall, 'off', c.offset, 'dx', c.dx, 'dy', c.dy, 'dz', c.dz)
  for (const ci of await api('getIssues')) for (const e of [...ci.errors, ...ci.warnings]) console.log('  !', ci.label, e.code, e.message)
  const j = await cab(jc.label); console.log('row', j.pos_x, j.pos_y, j.pos_z, j.rotation, j.dx, j.dy, j.dz, j.no_cnc)
  console.log(JSON.stringify(chk('p', await sb.from('cabinet_custom_parts').select('name,dx,dy,dz,material_override_id').eq('cabinet_instance_id', jc.id))))
} finally { await browser.close() }
