// RHK6468 Wall Panelling (room 00e46b73) - Mark 2026-11-16. Site measure (Mark's plan sketch) + Blake 7.07 / 7.08 Rev B.
// Entry wall (W1, 7.08): 4550 (CH 2704, 4 panels, garage door 925 x 2345 by others in bay 4) | 2220 media cavity slider
// (ours, inset 60, 19x38 RHS alu core + 9 veneer both faces) | 3400 (CH 2386, 3 panels). Lounge (W2, 7.07): 4910,
// 600 nibs 250 deep each end (17 front + 33 gable to the recess), middle plaster, 2386 to the bulkhead.
// Panels 17 American Oak veneer with 3 gaps at joints; 33 x 25 cover strips (33 AO ripped 25) glued ON the face over
// each joint, with a 3mm joiner strip on the back locating in the gap (joiner not modelled - board TBC).
// Each wall section = one TEPF carrier holding literal custom parts (x along the wall, y up, z out from the wall).
// Orientation front: dx width, dy height, dz thickness. side: dx depth, dy height, dz thickness (along x).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const ROOM = '00e46b73-13de-4df3-9235-871505d4ee81'
const V17 = '8afde358-4ab0-4a2e-bb3c-4bbc89de9c9e', V33 = 'a8ec07f1-50df-4440-9157-686efefa56c2'
const X0 = -3130, Y0 = 2000            // external corner of the media room = Mark's sketched corner
const L1 = 10170                       // 4550 + 2220 + 3400
const HA = 2690                        // 2704 ceiling, but 2700 sheet less 5 + 5 trim = 2690 max
const HD = 2345, HB = 2386

// ── 1. Veneer 9mm board (parent + American Oak colour row) ─────────────────
let V9 = chk('v9', await sb.from('materials').select('id').eq('name', 'Veneer 9mm – American Oak')).at(0)?.id
if (!V9) {
  const strip = r => { const { id, created_at, updated_at, ...rest } = r; return rest }
  const p17 = chk('p17', await sb.from('materials').select('*').eq('id', '0e14088b-0649-4756-91ea-cd8d8704e57c').single())
  const c17 = chk('c17', await sb.from('materials').select('*').eq('id', V17).single())
  const parent = chk('p9', await sb.from('materials').insert({ ...strip(p17), name: 'Veneer 9mm', dz: 9,
    notes: '9mm timber veneer board, 2700 x 1205 (size TBC). RHK6468 sliding door skins (Mark 2026-11-16). Species = colour rows.' }).select('id').single())
  V9 = chk('c9', await sb.from('materials').insert({ ...strip(c17), name: 'Veneer 9mm – American Oak', dz: 9, parent_id: parent.id,
    notes: 'RHK6468 media slider skins' }).select('id').single()).id
  console.log('created Veneer 9mm', parent.id, 'American Oak', V9)
}

// ── 2. Walls ────────────────────────────────────────────────────────────────
if (chk('walls?', await sb.from('walls').select('id').eq('room_id', ROOM)).length) throw new Error('room already has walls')
chk('room', await sb.from('rooms').update({ room_dy: 2704 }).eq('id', ROOM))
const wallDefs = [
  { name: 'Wall 1', x: X0, y: Y0 - L1, angle: 90, length: L1, height: 2704 },             // entry, face west (hall)
  { name: 'Wall 2', x: X0, y: Y0 - 233, angle: 0, length: 4910, height: 2706 },           // lounge recess face, face lounge
  { name: 'Wall 3', x: X0 + 99, y: Y0 - L1 + 4500, angle: 90, length: 1300, height: 2704 }, // slider back-face line
]
const W = {}
for (const [i, w] of wallDefs.entries()) {
  W[w.name] = chk('wall', await sb.from('walls').insert({ room_id: ROOM, name: w.name, sort_order: i, length: w.length, angle: w.angle,
    pos_x: w.x, pos_y: w.y, thickness: 0, height: w.height, wall_type: 'island' }).select('id').single()).id
}
console.log('walls', W)

// ── 3. Parts per carrier ────────────────────────────────────────────────────
const panel = (name, x, w, y, h, z = 0) => ({ name, orientation: 'front', x, y, z, dx: w, dy: h, dz: 17, mat: V17, edges: [1, 1, 1, 1] })
const strip = (name, x, h, y = 0) => ({ name, orientation: 'side', x, y, z: 17, dx: 25, dy: h, dz: 33, mat: V33, edges: [0, 0, 0, 1] })
const C = [
  { key: 'A', wall: 'Wall 1', offset: 0, dx: 4550, dy: HA, dz: 42,
    note: 'ENTRY WALL PANELS 4550 (Blake 7.08 "split into four equal panels"). 17 American Oak veneer, 3 gaps at the joints, 33x25 cover strips (33 AO ripped 25, front edge taped) glued on the face over each joint + 3mm joiner strip on the back in the gap (not modelled). Panels 2690 high = 2700 sheet limit (ceiling 2704). Bay 4 = garage door 925 x 2345 (by others, position TBC) + panel over + 211 nib (Blake draws over-door + nib as one L piece).',
    parts: [panel('Panel A1', 0, 1136, 0, HA), panel('Panel A2', 1139, 1134.5, 0, HA), panel('Panel A3', 2276.5, 1136, 0, HA),
      panel('Panel over garage door', 3412.5, 1136, HD, HA - HD), panel('Nib panel beside garage door', 4337.5, 211, 0, HD),
      strip('Cover strip A0 (start)', 0, HA), strip('Cover strip A1', 1121, HA), strip('Cover strip A2', 2258.5, HA),
      strip('Cover strip at garage door', 3379.5, HA), strip('Cover strip A/B (slider jamb)', 4533.5, HA)] },
  { key: 'B', wall: 'Wall 1', offset: 4550, dx: 2220, dy: HA, dz: 42,
    note: 'MEDIA CAVITY SLIDER 2220 (Blake 7.08 "split into two equal panels"): 1110 opening on the left, door slides right into the cavity behind the pocket panel. Panel over the opening from the 2345 head to 2690; pocket panel to the 2386 bulkhead. Jamb linings not modelled (TBC).',
    parts: [panel('Panel over slider opening', 1.5, 1107, HD, HA - HD), panel('Slider pocket panel', 1111.5, 1107, 0, HB),
      strip('Cover strip at slider centre', 1093.5, HB), strip('Cover strip B/C', 2203.5, HB)] },
  { key: 'C', wall: 'Wall 1', offset: 6770, dx: 3400, dy: HB, dz: 42,
    note: 'ENTRY WALL PANELS 3400 to the lounge corner (Blake 3550 "split into three equal panels", site 3400 - Mark use 3400). 2386 to the bulkhead. Last panel + end strip run 17 past the corner to cover the lounge nib panel edge (corner detail TBC).',
    parts: [panel('Panel C1', 1.5, 1130.5, 0, HB), panel('Panel C2', 1135, 1130.5, 0, HB), panel('Panel C3 (to corner +17)', 2268.5, 1148.5, 0, HB),
      strip('Cover strip C1', 1117, HB), strip('Cover strip C2', 2250.5, HB), strip('Cover strip C end (corner)', 3384, HB)] },
  { key: 'LN1', wall: 'Wall 2', offset: 0, dx: 600, dy: HB, dz: 250,
    note: 'LOUNGE NIB (corner end), Blake 7.07: 600 x 250 deep framed nib by builder. 17 AO front panel + 33 AO gable on the recess side, gable front flush with the bulkhead. 2386 high to the bulkhead. Middle 3710 = plaster (Mark).',
    parts: [panel('Nib front panel', 0, 567, 0, HB, 233), { name: 'Nib gable (recess side)', orientation: 'side', x: 567, y: 0, z: 0, dx: 250, dy: HB, dz: 33, mat: V33, edges: [0, 0, 0, 1] }] },
  { key: 'LN2', wall: 'Wall 2', offset: 4310, dx: 600, dy: HB, dz: 250,
    note: 'LOUNGE NIB (far end), Blake 7.07: 600 x 250 deep framed nib by builder. 33 AO gable on the recess side + 17 AO front panel, gable front flush with the bulkhead. 2386 high.',
    parts: [{ name: 'Nib gable (recess side)', orientation: 'side', x: 0, y: 0, z: 0, dx: 250, dy: HB, dz: 33, mat: V33, edges: [0, 0, 0, 1] }, panel('Nib front panel', 33, 567, 0, HB, 233)] },
  { key: 'DOOR', wall: 'Wall 3', offset: 50, dx: 1140, dy: HD, dz: 56,
    note: 'MEDIA CAVITY SLIDING DOOR (Mark 2026-11-16): core = aluminium frame 19x38 RHS (not modelled), lined both faces in 9mm American Oak veneer = 56 thick. Face inset 60 behind the panel face. Leaf 1140 x 2335 (1110 opening + 30 into the pocket, 10 off the floor) - size to suit the track TBC. Edges TBC.',
    parts: [{ name: 'Slider skin - hall face', orientation: 'front', x: 0, y: 10, z: 47, dx: 1140, dy: 2335, dz: 9, mat: V9, edges: [0, 0, 0, 0] },
      { name: 'Slider skin - media face', orientation: 'front', x: 0, y: 10, z: 0, dx: 1140, dy: 2335, dz: 9, mat: V9, edges: [0, 0, 0, 0] }] },
]

// ── 4. Canvas ───────────────────────────────────────────────────────────────
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 600000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('dialog', d => { console.log('dialog', d.message()); d.dismiss() })
const open = async () => { await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
const api = async (fn, ...a) => { const r = await Promise.race([page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message), sleep(90000).then(() => 'TIMEOUT')]); await sleep(1200); return r }
try {
  await open()
  for (const c of C) console.log('place', c.key, JSON.stringify(await api('placeCabinet', { def: 'TEPF', wall: W[c.wall], offset: c.offset, dx: c.dx })))
  const st = await api('getState')
  for (const c of C) {
    const p = st.cabinets.find(s => s.wall === c.wall && Math.abs(s.offset - c.offset) <= 1 && !s._used)
    if (!p) throw new Error('not placed ' + c.key + ' ' + JSON.stringify(st.cabinets.map(s => [s.label, s.wall, s.offset])))
    p._used = true; c.id = p.id; c.label = p.label
  }
  for (const c of C) {
    const tmpl = chk('tmpl', await sb.from('cabinet_custom_parts').select('*').eq('cabinet_instance_id', c.id))
    if (tmpl.length !== 1) throw new Error(c.label + ' template parts ' + tmpl.length)
    const { id: _i, created_at: _c, updated_at: _u, ...base } = tmpl[0]
    const rows = c.parts.map((p, i) => ({ ...base, name: p.name, orientation: p.orientation, x: p.x, y: p.y, z: p.z, dx: p.dx, dy: p.dy, dz: p.dz,
      expressions: {}, material_id: p.mat, material_override_id: p.mat, edge_top: !!p.edges[0], edge_bottom: !!p.edges[1], edge_left: !!p.edges[2], edge_right: !!p.edges[3],
      no_cnc: false, sort_order: i }))
    chk('ins', await sb.from('cabinet_custom_parts').insert(rows))
    chk('del', await sb.from('cabinet_custom_parts').delete().eq('id', tmpl[0].id))
    chk('note', await sb.from('cabinet_instances').update({ notes: c.note }).eq('id', c.id))
  }
  await open()
  for (const c of C) console.log('size', c.label, JSON.stringify(await api('updateCabinet', c.id, { dx: c.dx, dy: c.dy, dz: c.dz })))
  await open()
  const st2 = await api('getState')
  for (const c of C) { const s = st2.cabinets.find(x => x.id === c.id); console.log(c.key, s.label, s.wall, s.offset, s.dx, s.dy, s.dz) }
  for (const c of C) {
    const rp = await api('getResolved', c.id)
    for (const p of rp?.custom_parts ?? []) console.log('  ', c.label, p.name, p.orientation, p.x, p.y, p.z, '|', p.dx, p.dy, p.dz, p.material_id?.slice(0, 8))
  }
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
  fs.writeFileSync('C:/Users/mark/AppData/Local/Temp/claude/f01d6d5a90802ead/7f6e703f-b45d-4d1d-b7c2-0585880569a5/scratchpad/wp-carriers.json', JSON.stringify(C.map(c => ({ key: c.key, id: c.id, label: c.label })), null, 1))
} finally { await browser.close() }
