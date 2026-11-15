// RHK6468 WIR rev 1 (Mark 2026-11-15):
//  - WC-03 top shelf over the bench seat / bench: not needed -> deleted.
//  - Open drawer cupboards (BC-01/02/03/08): fronts INSET between the gables (FACINS 16, side / bottom reveals
//    = gable + 2, top = top + 25 finger gap, 25 between drawers); carcass 550 so the gables line up with the doors.
//  - Mirror frame = one cabinet (gables / top / bottom, 32 deep, no back, no face) + a "Mirror" custom part;
//    replaces the 4 TEPK stiles (TC-12..15). TC-16 120 face rail stays as the kick face under it.
//  - TC-03 / TC-10: bottom inner drawer at the bottom, hinge in the gap above it.
//  - 2700-sheet TBC removed (PT Matt comes in 3100).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) throw new Error(t + ': ' + r.error.message); return r.data }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const R = 'dfa682a3-020b-4704-8661-3dbbd6cdf224', MIRROR = '8870b896-fcc0-4928-9b81-dd9a849c97c6'
const cab = async l => chk(l, await sb.from('cabinet_instances').select('*').eq('room_id', R).eq('label', l)).at(0)

// 1. deletes (Mark asked: WC-03; stiles replaced by the frame cabinet)
for (const l of ['WC-03', 'TC-12', 'TC-13', 'TC-14', 'TC-15']) { const c = await cab(l); if (c) chk('del ' + l, await sb.from('cabinet_instances').delete().eq('id', c.id)) }
// 2. inset drawer fronts
const INSET = { FACINS: 16, REVSL: 18.5, REVSR: 18.5, REVB: 18.5, REVT: 41.5, GAPR: 25 }
for (const l of ['BC-01', 'BC-02', 'BC-03', 'BC-08']) {
  const c = await cab(l)
  chk(l, await sb.from('cabinet_instances').update({ dz: 550, rule_overrides: { ...(c.rule_overrides ?? {}), ...INSET },
    notes: (c.notes ?? '').replace(/ \(inset.*$/, '') + ' (inset drawer fronts between the gables, 25 finger gaps)' }).eq('id', c.id))
}
// 3. inner drawers: bottom one at the bottom, hinges in the gaps
for (const l of ['TC-03', 'TC-10']) {
  const c = await cab(l)
  const g = structuredClone(c.internal_grid)
  g.tree.children[0].section.fittings = [16.5, 264, 511.5, 759].map(y => ({ type: 'inner_drawer', height: 127, y_locked: true, y_position: y }))
  const fg = structuredClone(c.face_grid); for (const z of fg.zones) z.hinges = [213, 708, 1055, 1700, 2440]
  chk(l, await sb.from('cabinet_instances').update({ internal_grid: g, face_grid: fg }).eq('id', c.id))
}
// 4. CAD: drop the 2700-sheet question + its cloud (my own rows)
const ann = chk('ann', await sb.from('room_annotations').select('*').eq('room_id', R))
const drop = ann.filter(a => !a.user_edited_at && ((a.text ?? '').includes('2700') || (a.kind === 'cloud' && a.geom?.pts?.[0]?.x === 3170)))
if (drop.length) chk('ann del', await sb.from('room_annotations').delete().in('id', drop.map(a => a.id)))
console.log('annotations removed', drop.length)

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' }); page.on('dialog', d => d.dismiss())
  const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 240000 }); await page.waitForFunction(() => window.__canvasApi, { timeout: 240000 }); await sleep(4000) }
  const api = async (m, ...a) => { const r = await page.evaluate((m, a) => window.__canvasApi[m](...a), m, a); await sleep(1500); return r }
  await open()
  let st = await api('getState')
  let frame = st.cabinets.find(c => c.wall === 'Wall 6' && c.dx === 1757 && c.dy > 1000)
  if (!frame) {
    const before = new Set(st.cabinets.map(c => c.id))
    console.log(JSON.stringify(await api('placeCabinet', { def: 'T2D', wall: 'Wall 6', offset: 0, dx: 1757 })))
    frame = (await api('getState')).cabinets.find(c => !before.has(c.id))
    chk('frame', await sb.from('cabinet_instances').update({ pos_z: 120, has_toekick: false, has_face: false, exposed_interior: true, top_type: 'full_top',
      face_grid: { cols: [{ col_index: 0, width_locked: false }], rows: [{ row_index: 0, height_locked: false }], zones: [{ col_index: 0, row_index: 0, face_type: 'open' }] },
      internal_grid: { tree: { type: 'open', fittings: [] } },
      part_hide_views: { case_back: ['plan', 'elevation', '3d'] },
      notes: 'MIRROR FRAME: 32 deep box (gables / top / bottom), no back, mirror by others (Mirror part)' }).eq('id', frame.id))
    await open()
  }
  if (!chk('mp', await sb.from('cabinet_custom_parts').select('id').eq('cabinet_instance_id', frame.id)).length) {
    chk('mirror', await sb.from('cabinet_custom_parts').insert({ cabinet_instance_id: frame.id, part_library_id: '0b364a0a-9018-4852-8ef5-172ab05dac32', name: 'Mirror (by others)', material_id: MIRROR,
      orientation: 'front', x: 16.5, y: 16.5, z: 0, dx: 1724, dy: 2510, dz: 4, no_cnc: true, visible: true, show_in_room: true, sort_order: 0,
      edge_top: false, edge_bottom: false, edge_left: false, edge_right: false,
      expressions: { x: 't.exposed', y: 't.exposed', z: '0', dx: 'cab.w - 2 * t.exposed', dy: 'cab.h - 2 * t.exposed', dz: '4' } }))
    await open()
  }
  console.log(frame.label, JSON.stringify(await api('updateCabinet', frame.label, { dy: 2543, dz: 32 })))
  for (const l of ['BC-01', 'BC-02', 'BC-03', 'BC-08', 'TC-03', 'TC-10']) { const c = (await api('getState')).cabinets.find(x => x.label === l); console.log(l, JSON.stringify(await api('updateCabinet', l, { dy: c.dy }))) }
  const issues = await page.evaluate(() => window.__canvasApi.getIssues())
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) console.log(`  ${ci.label} ${e.code}: ${e.message}`)
  console.log('issues done', issues.length)
} finally { await browser.close() }
