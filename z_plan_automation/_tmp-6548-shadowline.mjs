// RHK6548 Hard Coffee rev 3 (Mark 2026-11-27): 18 shadowline on top of the Water Station, Front Counter and
// Back Counter cabinets, full width of each run; 18 comes off the cabinet heights (overall height stays).
//  FC 755 -> 737 + 18.  BC 760 -> 742 + 18 (gable too).  WS 770 -> 752, 35 filler 752-787, shadowline 787-805.
//  Shadowline = a BFK carrier (dy 18, no kick) across the run with 2 flat 18 strips, 100 deep: front + back.
//  Front strip: FC / BC flush with the 545 carcass fronts (doors / open boxes 20 proud = 20 shadow);
//  WS set back 20 from the open box front. Front edge taped.
//  FC BC-03 door 587 (still 150 below the carcass top). FC BC-04 microwave shelf size 363 (320 clear kept).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const SL = 18, DEPTH = 100
const RUNS = {
  ws: { R: '2bed2187-0b9c-4cf3-9e3e-5d29be5538a0', wall: 'Wall 2', dx: 590, dz: 590, top: 805, setback: 20, cabs: { 'BC-01': 752 } },
  fc: { R: '09786d9b-378e-42ed-9fc7-1aed4c7b21ab', wall: 'Wall 2', dx: 2750, dz: 545, top: 755, setback: 0, cabs: { 'BC-01': 737, 'BC-02': 737, 'BC-03': 737, 'BC-04': 737, 'BC-05': 737 } },
  bc: { R: 'd3c04ade-ba07-4462-a40c-2a4bd1952d31', wall: 'Wall 1', dx: 600, dz: 545, top: 760, setback: 0, cabs: { 'BC-01': 742, 'BC-02': 742, 'BC-03': 742 } },
}
const get = async (R, label) => chk(label, await sb.from('cabinet_instances').select('*').eq('room_id', R).eq('label', label).single())

// 1. Carcass heights (and the WS filler drops to sit on the 752 box)
for (const { R, cabs } of Object.values(RUNS)) for (const [label, dy] of Object.entries(cabs)) {
  const c = await get(R, label); if (Number(c.dy) !== dy) chk(label, await sb.from('cabinet_instances').update({ dy }).eq('id', c.id))
}
{ const f = await get(RUNS.ws.R, 'BC-02'); chk('ws filler', await sb.from('cabinet_instances').update({ pos_z: 752 }).eq('id', f.id))
  chk('ws filler note', await sb.from('cabinet_instances').update({ notes: '35 filler over the water station (752-787), shadowline above to 805' }).eq('id', f.id)) }
// FC BC-03 door top 150 below the 737 carcass top; BC-04 shelf keeps 320 clear
{ const c = await get(RUNS.fc.R, 'BC-03'); const fg = structuredClone(c.face_grid); fg.rows[0].height = 587; chk('bc03', await sb.from('cabinet_instances').update({ face_grid: fg }).eq('id', c.id)) }
{ const c = await get(RUNS.fc.R, 'BC-04'); const ig = structuredClone(c.internal_grid); ig.tree.children[0].size = 363; chk('bc04', await sb.from('cabinet_instances').update({ internal_grid: ig }).eq('id', c.id)) }

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const open = async R => {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  return page
}
try {
  for (const [k, run] of Object.entries(RUNS)) {
    // 2. Carrier (once): BFK across the run
    let carrier = chk('c', await sb.from('cabinet_instances').select('id,label').eq('room_id', run.R).ilike('notes', 'SHADOWLINE%')).at(0)
    if (!carrier) {
      const before = new Set(chk('b', await sb.from('cabinet_instances').select('id').eq('room_id', run.R)).map(c => c.id))
      let page = await open(run.R)
      console.log(k, JSON.stringify(await page.evaluate(o => window.__canvasApi.placeCabinet(o), { def: 'BFK', wall: run.wall, offset: 0, dx: run.dx })))
      await sleep(5000); await page.close()
      carrier = chk('a', await sb.from('cabinet_instances').select('id,label').eq('room_id', run.R)).find(c => !before.has(c.id))
      if (!carrier) throw new Error(k + ': carrier not placed')
    }
    chk('carrier', await sb.from('cabinet_instances').update({ dx: run.dx, dy: SL, dz: run.dz, pos_z: run.top - SL, has_toekick: false, kick_run_id: null, notes: `SHADOWLINE ${SL} full width, ${run.top - SL}-${run.top}` }).eq('id', carrier.id))
    // 3. Strips: front + back, flat, 18 thick, 100 deep, full run width
    const parts = chk('p', await sb.from('cabinet_custom_parts').select('id,part_library_id,material_id').eq('cabinet_instance_id', carrier.id).order('sort_order'))
    const base = { orientation: 'flat', grain_across: false, edge_bottom: false, edge_left: false, edge_right: false, visible: true, show_in_room: true }
    const front = { ...base, name: `Shadowline ${SL} front`, edge_top: true, sort_order: 0,
      expressions: { x: '0', y: '0', z: `cab.d - ${run.setback} - ${DEPTH}`, dx: `${DEPTH}`, dy: 'cab.w', dz: 't.exposed' } }
    const back = { ...base, name: `Shadowline ${SL} back`, edge_top: false, sort_order: 1,
      expressions: { x: '0', y: '0', z: '0', dx: `${DEPTH}`, dy: 'cab.w', dz: 't.exposed' } }
    chk('front', await sb.from('cabinet_custom_parts').update(front).eq('id', parts[0].id))
    if (parts[1]) chk('back', await sb.from('cabinet_custom_parts').update(back).eq('id', parts[1].id))
    else chk('back ins', await sb.from('cabinet_custom_parts').insert({ ...back, cabinet_instance_id: carrier.id, part_library_id: parts[0].part_library_id, material_id: parts[0].material_id, dx: DEPTH, dy: run.dx, dz: 18, x: 0, y: 0, z: 0 }))
    for (const p of parts.slice(2)) chk('extra', await sb.from('cabinet_custom_parts').delete().eq('id', p.id))
    console.log(k, 'shadowline on', carrier.label)

    // 4. Re-resolve the room
    const page = await open(run.R)
    const iss = await page.evaluate(() => window.__canvasApi.getIssues())
    for (const ci of iss) { console.log(' ', k, ci.label, ci.dims); for (const e of [...ci.errors, ...ci.warnings]) console.log('     ', e.code, e.message) }
    await page.close()
  }
} finally { await browser.close() }
for (const [k, run] of Object.entries(RUNS)) {
  const cabs = chk('q', await sb.from('cabinet_instances').select('id,label,dy,pos_z,notes').eq('room_id', run.R).order('label'))
  console.log(k, JSON.stringify(cabs.map(c => [c.label, c.dy, c.pos_z])))
  const car = cabs.find(c => (c.notes ?? '').startsWith('SHADOWLINE'))
  if (car) console.log('  strips', JSON.stringify(chk('s', await sb.from('cabinet_custom_parts').select('name,orientation,x,y,z,dx,dy,dz,edge_top').eq('cabinet_instance_id', car.id))))
}
process.exit(0)
