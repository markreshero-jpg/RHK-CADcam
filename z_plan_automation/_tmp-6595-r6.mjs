// RHK6595 rev 6 (Liam's reply 10/11 + Mark 11/11):
//  1. LED recess in the overhead under panel WC-12: pocket 18.5 x 9 (T110), back edge 30 off the back wall, full length + 6 past both ends.
//  2. WC-07 WEP front filler -> WF-L L-shaped filler (side-on 18 teak, 70 legs), in place (same label / position).
//  3. Overheads 350 overall incl doors: carcass 320 -> 330 (+2 bumper gap + 18 door = 350). WC-04/05/06 dz 330,
//     bulkhead WC-09 320 -> 330, under panel WC-12 300 -> 310 (20 set back kept), WC-07 WF-L dz 350 (to the door face).
//  4. WC-10 full wine rack: right bay = a second 3 x 3 half-checked cubby block (6 x 3 squares 121.3), adj shelf out.
//  5. Bulkheads WC-08 / 09 / 11 Sublime Teak 18 (Liam: match the overheads); TBC notes answered in place.
// Before-state -> _tmp-6595-r6-before.json. Run: node z_plan_automation/_tmp-6595-r6.mjs db | resolve
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'd113bd53-5e4a-4ded-9592-cc1f7bc0eecb', TEAK18 = 'd67d85b0-b12b-4b03-be3c-8bdbbf23cd11'
const WFL = 'cf3eea4b-dd70-4f69-bb01-742a6732b1d0', T110 = '12163452-ea8f-407e-85a9-340204dc0e5f'
const WC07_CP = '9cfd30a4-1e9a-4f71-9024-cfcbedf22f85', WC12_CP = 'f0863887-cf5e-4c66-a2ba-1356b37a1c1e'
const BEFORE = 'z_plan_automation/_tmp-6595-r6-before.json'
const ok = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); console.log('ok', what) }
const DZ = { 'WC-04': 330, 'WC-05': 330, 'WC-06': 330, 'WC-09': 330, 'WC-12': 310, 'WC-07': 350 }
const mode = process.argv[2]
if (mode === 'db') {
  if (fs.existsSync(BEFORE)) throw new Error('before-state exists: already applied?')
  const cabs = (await sb.from('cabinet_instances').select('*').eq('room_id', R)).data
  const byL = Object.fromEntries(cabs.map(c => [c.label, c]))
  const ann = (await sb.from('room_annotations').select('*').eq('room_id', R)).data
  const before = {
    cabs: cabs.filter(c => ['WC-04', 'WC-05', 'WC-06', 'WC-07', 'WC-08', 'WC-09', 'WC-10', 'WC-11', 'WC-12'].includes(c.label)),
    customParts: (await sb.from('cabinet_custom_parts').select('*').in('id', [WC07_CP, WC12_CP])).data,
    annots: ann.filter(a => ['ec2e0972', 'b08162ee'].some(p => a.id.startsWith(p))),
  }
  fs.writeFileSync(BEFORE, JSON.stringify(before, null, 1))
  // 1. LED pocket on the under panel (frame as RHK6586 WC-09: pos_x = depth from the back, pos_y = centre along the length)
  const have = (await sb.from('part_operations').select('id').eq('source_cabinet_id', byL['WC-12'].id).in('operation_type', ['route', 'groove'])).data
  if (have.length) throw new Error('WC-12 already has routes')
  const W = 18.5, D = 9, OFF = 30, len = 2006
  ok('WC-12 LED pocket', await sb.from('part_operations').insert({
    source_table: 'custom_parts', source_cabinet_id: byL['WC-12'].id, source_part_key: `custom_${WC12_CP}`,
    operation_type: 'route', operation_action: 'pocket', operation_role: 'local', plane_kind: 'face_back',
    pos_x: OFF + W / 2, pos_y: len / 2, size_dx: W, size_dy: len + 12, depth: D, size_dz: D, angle_az: 0, angle_ax: 0, angle_ay: 0,
    router_tool_id: T110, auto_tool: false, output_to_cnc: true, repeat_count: 1, is_master: false, sort_order: 0,
    fill_strategy: 'raster', raster_angle_deg: 90, raster_stepover_pct: 40,
    parameters: { note: 'Recessed LED strip route 18.5 x 9, 30 off the back wall, full length + 6 past both ends (Mark 2026-11-11)' },
  }))
  // 2. WC-07 -> WF-L in place
  const def = (await sb.from('cabinet_definitions').select('custom_parts').eq('id', WFL)).data[0].custom_parts[0]
  ok('WC-07 def', await sb.from('cabinet_instances').update({ cabinet_definition_id: WFL, material_overrides: { exposed: TEAK18 }, dz: 350,
    notes: 'L-shaped wall filler (WF-L) at the west wall, 18 Sublime Teak to the door face (Mark 2026-11-11, was a WEP front filler)' }).eq('id', byL['WC-07'].id))
  ok('WC-07 part', await sb.from('cabinet_custom_parts').update({
    name: def.name, orientation: def.orientation, x: 0, y: 0, z: 0, dx: 350, dy: byL['WC-07'].dy, dz: 18, expressions: def.expressions,
    part_cutouts: def.part_cutouts, edge_top: def.edge_top, edge_bottom: def.edge_bottom, edge_left: def.edge_left, edge_right: def.edge_right, outline: null,
  }).eq('id', WC07_CP))
  // 4. WC-10 full wine rack
  const g = structuredClone(byL['WC-10'].internal_grid)
  g.tree.children[1] = { section: structuredClone(g.tree.children[0].section) }
  ok('WC-10 6 x 3', await sb.from('cabinet_instances').update({ internal_grid: g,
    notes: 'Wine rack over the fridge: 6 x 3 half-checked square cubbies 121.3 (client 10/11: all wine). 480 deep external (shelves 460), front flush, back 210 off the closure. Carcass as panel' }).eq('id', byL['WC-10'].id))
  // 5. Bulkheads teak
  for (const l of ['WC-08', 'WC-09', 'WC-11'])
    ok(`${l} teak`, await sb.from('cabinet_instances').update({ material_overrides: { ...(byL[l].material_overrides ?? {}), exposed: TEAK18 } }).eq('id', byL[l].id))
  for (const [p, text] of [['ec2e0972', 'BULKHEADS SUBLIME TEAK 18 - MATCH THE OVERHEADS (LIAM 10/11)'], ['b08162ee', 'BULKHEAD SUBLIME TEAK 18']]) {
    const a = before.annots.find(a => a.id.startsWith(p)); ok(`note ${p}`, await sb.from('room_annotations').update({ text }).eq('id', a.id))
  }
} else if (mode === 'resolve') {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 600000 })
  const sleep = ms => new Promise(r => setTimeout(r, ms))
  try {
    const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
    page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
    await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 300000 })
    await page.waitForFunction('!!window.__canvasApi', { timeout: 300000 }); await sleep(6000)
    for (const l of [...Object.keys(DZ), 'WC-08', 'WC-11', 'WC-10']) {
      const c = (await page.evaluate(() => window.__canvasApi.getState())).cabinets.find(x => x.label === l)
      await page.evaluate(([l, p]) => window.__canvasApi.updateCabinet(l, p), [l, DZ[l] ? { dz: DZ[l] } : { dy: c.dy }]); await sleep(2500)
      const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
      const s = (await page.evaluate(() => window.__canvasApi.getState())).cabinets.find(x => x.label === l)
      const mats = [...new Set([...(rp.case_parts ?? []), ...(rp.custom_parts ?? [])].map(p => p.material_id?.slice(0, 8)))]
      console.log(l, 'dims', s.dx, s.dy, s.dz, 'parts', (rp.case_parts ?? []).length + (rp.custom_parts ?? []).length, 'int', (rp.internal_parts ?? []).length, 'mats', mats.join(','),
        'err', JSON.stringify([...(rp.errors ?? []), ...(rp.warnings ?? [])].map(e => e.code)))
    }
    for (const i of await page.evaluate(() => window.__canvasApi.getIssues())) if (i.errors.length || i.warnings.length) console.log('ISSUE', i.label, JSON.stringify([...i.errors, ...i.warnings].map(e => e.code + ': ' + e.message)))
  } finally { await browser.close() }
}
