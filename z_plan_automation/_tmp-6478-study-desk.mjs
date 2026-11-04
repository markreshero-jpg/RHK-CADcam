// RHK6478 Study desk top (Mark 2026-11-04, section on the "Notes for Ai" CAD layer + answers):
// 600 deep, glass top 760 AFF. Down from the top: 6 glass (500 deep, front) | 10 cover strip 100 wide on the steel (hand cut, no CNC)
// | 40x40 steel behind the front strip, rebated 10 into the underside | 16.5 underside 46-62.5 down (697.5-714 AFF), wall to the
// front strip | front strip 16.5 x 56.5 (E2L) 6-62.5 down | back strip 100 x 16.5 at the wall, top flush with the glass |
// back rail 16.5 x 29.5 under it (714-743.5). Panels + file drawer unit 600 o/a, to 697.5. All Sublime Teak 16.5.
// Long parts in 2 pieces, joint mid BC-07 (1250.25). Glass + steel not modelled (no materials) - CAD notes.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = 'a04663c7-1402-4344-be00-3ad4ce3aeae9', T110 = '12163452-ea8f-407e-85a9-340204dc0e5f'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const TOP = 760, UND = 697.5, D = 600, L = 3022, J = 1250.25
const cabsNow = async () => chk('cabs', await sb.from('cabinet_instances').select('id,label,pos_x,pos_z,dx,dy,dz,notes,rule_overrides').eq('room_id', R))
const by = async l => (await cabsNow()).find(c => c.label === l)
const partOf = async id => chk('cp', await sb.from('cabinet_custom_parts').select('*').eq('cabinet_instance_id', id))[0]
console.log('steel/glass materials', JSON.stringify(chk('mat', await sb.from('materials').select('id,name').or('name.ilike.%steel%,name.ilike.%glass%'))))

// desk top parts: [key, orientation, cab dy, cab dz, pos_z, part patch, notes]
const PARTS = [
  ['UNDERSIDE', 'flat', 16.5, D - 16.5, UND, {}, 'Desk top underside 16.5 Sublime Teak, wall to the front strip, 40 x 10 rebate for the 40x40 steel along the front'],
  ['FRONT STRIP', 'front', 56.5, D, UND, { expressions: { z: 'cab.d - t.exposed', dx: 'cab.w', dy: 'cab.h', dz: 't.exposed' }, edge_top: true, edge_bottom: true, edge_left: false, edge_right: false }, 'Desk front strip 16.5 x 56.5 Sublime Teak, E2L, under the glass'],
  ['BACK STRIP', 'flat', 16.5, 100, TOP - 16.5, {}, 'Desk back strip 100 x 16.5 Sublime Teak at the wall, top flush with the glass'],
  ['BACK RAIL', 'front', TOP - 16.5 - (UND + 16.5), 16.5, UND + 16.5, { expressions: { z: '0', dx: 'cab.w', dy: 'cab.h', dz: 't.exposed' } }, 'Desk back rail 16.5 x 29.5 Sublime Teak at the wall, under the back strip'],
  ['COVER STRIP', 'flat', 10, D - 16.5, TOP - 6 - 10, { expressions: { z: 'cab.d - 100', dx: '100', dy: 'cab.w', dz: '10' }, no_cnc: true }, 'Glass cover strip 10 x 100 Sublime Teak on the steel - CUT BY HAND (not CNC)'],
]

const before = new Set((await cabsNow()).map(c => c.label))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('dialog', d => { console.log('dialog', d.message()); d.dismiss() })
const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
const api = async (fn, ...a) => { const r = await Promise.race([page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message), sleep(60000).then(() => 'TIMEOUT')]); await sleep(1500); return r }
try {
  await open()
  // 1. desk panels + file drawer unit: 600 o/a (carcass 581.5 + 18.5), up to the underside 697.5
  for (const l of ['BC-06', 'BC-07', 'BC-08', 'BC-09', 'BC-10']) console.log(l, JSON.stringify(await api('updateCabinet', l, { dz: D - 18.5, dy: UND })))
  // 2. desk top parts, 2 pieces each
  const made = []
  for (const [key, orient, dy, dz, pz, patch, notes] of PARTS) for (const [off, len, n] of [[0, J, 1], [J, L - J, 2]]) {
    const r = await api('placeCabinet', { def: 'WUP', wall: 'Wall 3', offset: off, dx: len })
    const label = r?.label ?? r?.placed ?? null
    const fresh = (await cabsNow()).filter(c => !before.has(c.label) && !made.some(m => m.label === c.label))
    if (fresh.length !== 1) throw new Error('place ' + key + ' ' + JSON.stringify(r) + ' ' + fresh.map(c => c.label))
    const c = fresh[0]; made.push({ label: c.label, key, n, len, orient, dy, dz, pz, patch, notes })
    console.log('placed', key, n, c.label, label)
  }
  for (const m of made) {
    const c = await by(m.label)
    chk('cab', await sb.from('cabinet_instances').update({ notes: `${m.notes} - piece ${m.n} of 2`, rule_overrides: { ...(c.rule_overrides ?? {}), UNDER_PANEL: true }, ...(m.patch.no_cnc ? { no_cnc: true } : {}) }).eq('id', c.id))
    const p = await partOf(c.id)
    chk('part', await sb.from('cabinet_custom_parts').update({ orientation: m.orient, name: 'Desk ' + m.key.toLowerCase(), ...m.patch }).eq('id', p.id))
  }
  await open()
  for (const m of made) console.log(m.label, JSON.stringify(await api('updateCabinet', m.label, { dy: m.dy, dz: m.dz, pos_z: m.pz })))
  // 3. steel rebate in the underside top face: 40 wide x 10 deep along the front edge (run 6 out past the front + both ends)
  for (const m of made.filter(m => m.key === 'UNDERSIDE')) {
    const c = await by(m.label), p = await partOf(c.id)
    chk('rb del', await sb.from('part_operations').delete().eq('source_cabinet_id', c.id))
    chk('rb', await sb.from('part_operations').insert({ source_table: 'custom_parts', source_cabinet_id: c.id, source_part_key: 'custom_' + p.id,
      operation_type: 'route', operation_action: 'pocket', operation_role: 'local', plane_kind: 'face_front',
      pos_x: (D - 16.5) - 40 + 23, pos_y: m.len / 2, size_dx: 46, size_dy: m.len + 12, size_dz: 10, depth: 10,
      router_tool_id: T110, auto_tool: false, output_to_cnc: true, fill_strategy: 'raster', raster_angle_deg: 90, raster_stepover_pct: 40,
      angle_ax: 0, angle_ay: 0, angle_az: 0, repeat_count: 1, sort_order: 0,
      parameters: { note: '40 x 10 rebate for the 40x40 steel along the front edge (top face), 6 past the front edge and both ends' } }))
  }
  // 4. shaped leg BC-10 re-shaped for 600 x 697.5: 600 top, 45 deg into R200, 200 at the floor
  { const H = UND, X = 200, r = 200, cy = D - X, tl = r * Math.tan(Math.PI / 8), s = tl / Math.SQRT2
    const a = { x: X + s, y: cy - s }, b = { x: X, y: cy + tl }
    const P = [{ x: 0, y: 0 }, { x: D, y: 0 }, a, b, { x: X, y: H }, { x: 0, y: H }]
    const segs = [{ type: 'line', p0: P[0], p1: P[1] }, { type: 'line', p0: P[1], p1: a }, { type: 'arc', p0: a, p1: b, rx: r, ry: r, largeArc: 0, sweep: 0 },
      { type: 'line', p0: b, p1: P[4] }, { type: 'line', p0: P[4], p1: P[5] }, { type: 'line', p0: P[5], p1: P[0] }]
    const cab = await by('BC-10'), ap = await partOf(cab.id), key = 'custom_' + ap.id
    chk('pso', await sb.from('part_shape_overrides').update({ segments: segs, meta: { bounds: { minX: 0, minY: 0, maxX: D, maxY: H }, closed: true, sizeSlots: { up: 'dy', across: 'dx', custom: true }, baseAtSave: { w: D, h: H }, segmentCount: segs.length } }).eq('cabinet_id', cab.id).eq('part_key', key)) }
  await open()
  for (const l of ['BC-10', 'BC-08']) console.log(l, JSON.stringify(await api('updateCabinet', l, { dz: D - 18.5 })))
  for (const l of ['BC-06', 'BC-08', 'BC-10', ...made.map(m => m.label)]) {
    const rp = await api('getResolved', l)
    console.log(l, JSON.stringify([...rp.case_parts.map(p => [p.part_key, p.DX, p.DY, p.DZ, p.Y]), ...rp.face_zones.map(z => ['face', z.DX, z.DY]), ...(rp.custom_parts ?? []).map(p => [p.name, p.orientation, p.dx ?? p.DX, p.dy ?? p.DY, p.dz ?? p.DZ, p.z ?? p.Z, p.material_id?.slice(0, 8)])]))
  }
  const st = await api('getState')
  for (const m of made) { const c = st.cabinets.find(c => c.label === m.label); console.log(m.label, m.key, m.n, c.offset, c.dx, c.dy, c.dz) }
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
