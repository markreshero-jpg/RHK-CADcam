// RHK6339 J07 (Mark 2026-11-12): WC-02 80 pelmet -> full-depth 33 veneer Blackbutt top over the whole J07 wall
// (window wall to the end of TC-03), underside 735 + 1492 = 2227 FFL, 80 past the door faces (305 + 80 = 385 deep).
// TC-01 / TC-02 / WC-01 go up 80 to the top's underside (dy 1412 -> 1492). TC-02 hinges + pulls follow.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '3bd26e44-cc9a-4c6f-bbae-a4fa0d59aeef', V33 = 'fca041dc-30b7-469e-9e14-d8d3aae38a57'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const PULL_TOP = 1220, LEN = 3697, DEPTH = 385, UNDER = 2227
const cabsOf = async () => chk('cabs', await sb.from('cabinet_instances').select('id,label,pos_z,dy,dz,face_grid,bulkhead,rule_overrides').eq('room_id', R))
const walls = Object.fromEntries(chk('w', await sb.from('walls').select('id,name').eq('room_id', R)).map(w => [w.name, w.id]))

let cabs = await cabsOf()
const bh = cabs.find(c => c.label === 'WC-02' && c.bulkhead)
if (bh) { chk('del ops', await sb.from('part_operations').delete().eq('source_cabinet_id', bh.id)); chk('del', await sb.from('cabinet_instances').delete().eq('id', bh.id)); console.log('WC-02 pelmet removed') }

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('dialog', d => { console.log('dialog', d.message()); d.dismiss() })
const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
const api = async (fn, ...a) => { const r = await Promise.race([page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message), sleep(60000).then(() => 'TIMEOUT')]); await sleep(1500); return r }
try {
  await open()
  // 1. cabinets under the top up 80 to 2227
  for (const l of ['TC-01', 'TC-02', 'WC-01']) console.log(l, JSON.stringify(await api('updateCabinet', l, { dy: 1492 })))
  // 2. the top: one WUP, own pos_z
  cabs = await cabsOf()
  let top = cabs.find(c => c.label === 'WC-02')
  if (!top) {
    const before = new Set(cabs.map(c => c.id))
    console.log('place', JSON.stringify(await api('placeCabinet', { def: 'WUP', wall: walls['Wall 3'], offset: 0, dx: LEN })))
    cabs = await cabsOf(); top = cabs.find(c => !before.has(c.id))
  }
  chk('top', await sb.from('cabinet_instances').update({
    rule_overrides: { ...(top.rule_overrides ?? {}), UNDER_PANEL: true },
    material_overrides: { exposed: V33, interior: V33, bottom: V33 },
    notes: 'J07 top: 33 veneer Blackbutt, full depth 385 (80 past the door faces + open shelves), window wall to the end of TC-03. Underside 2227 FFL (735 + 1492). LED route in the underside of the 80 overhang.',
  }).eq('id', top.id))
  await open()
  console.log(top.label, JSON.stringify(await api('updateCabinet', top.label, { dx: LEN, dy: 33, dz: DEPTH, pos_z: UNDER, offset: 0 })))
  // 3. pulls stay 770-1220 AFF; TC-02 top hinge 100 from the door top
  cabs = await cabsOf()
  for (const label of ['TC-02', 'TC-03']) {
    const cab = cabs.find(c => c.label === label)
    const fz = chk('fz', await sb.from('face_zones').select('col_index,y,dy').eq('cabinet_instance_id', cab.id))
    const zones = cab.face_grid.zones.map(z => {
      const f = fz.find(q => q.col_index === z.col_index)
      const out = { ...z, handle_inset: Math.round((Number(cab.pos_z) + Number(f.y) + Number(f.dy) - PULL_TOP) * 10) / 10 }
      if (label === 'TC-02') out.hinges = [100, 800, Math.round(Number(f.dy) - 100)]
      return out
    })
    console.log(label, 'pos_z', cab.pos_z, 'dy', cab.dy, JSON.stringify(zones.map(z => [z.handle_inset, z.hinges])))
    chk('fg', await sb.from('cabinet_instances').update({ face_grid: { ...cab.face_grid, zones } }).eq('id', cab.id))
    await api('updateCabinet', label, { dz: 286 })
  }
  const st = await api('getState')
  for (const c of st.cabinets) console.log(c.label, 'off', c.offset, 'dx', c.dx, 'dy', c.dy, 'dz', c.dz, 'z', c.pos_z)
  const rp = await api('getResolved', top.label)
  console.log(JSON.stringify(rp?.case_parts?.map(p => ({ k: p.part_key, DX: p.DX, DY: p.DY, DZ: p.DZ, m: p.material_name ?? p.material_id, e: [p.edge_top, p.edge_bottom, p.edge_left, p.edge_right] }))))
  console.log(JSON.stringify(rp?.custom_parts?.map(p => ({ id: p.id, n: p.name, o: p.orientation, DX: p.DX ?? p.dx, DY: p.DY ?? p.dy, DZ: p.DZ ?? p.dz, m: p.material_id }))))
  for (const ci of await api('getIssues')) for (const e of [...ci.errors, ...ci.warnings]) console.log(' ', ci.label, e.code, e.message)
} finally { await browser.close() }
