// RHK6478 WIP rev 2 (Mark 2026-11-05):
// 1. BC-01 drawers back to the D3-SLL standard: library face grid (2 equal larges + 170 shallow top), top drawer keeps
//    finger_gap 60 (clears the apron); boxes auto (D25 rail clearance in the resolver).
// 2. Recessed LED strip routes 18.5 x 9, 60 in from the back, 6 past both ends, in the underside of WC-02 (open shelf unit
//    bottom) and WC-11 (under panel) - same op as the other jobs (face_back, T110 raster). Elevation note at each (prints).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const R = 'cb47d462-90eb-4ba0-8e6e-ca4d978628ae', T110 = '12163452-ea8f-407e-85a9-340204dc0e5f', IN = 60, W = 18.5
const NOTE = `Recessed LED strip route ${W} x 9, ${IN} in from the back, 6 past both ends`

const C = l => sb.from('cabinet_instances').select('id,label,wall_id,pos_x,pos_z,dx,dy,dz,face_grid,cabinet_definition_id').eq('room_id', R).eq('label', l).single()
const bc01 = chk('bc01', await C('BC-01'))
const def = chk('def', await sb.from('cabinet_definitions').select('name,face_grid').eq('id', bc01.cabinet_definition_id).single())
if (def.name !== 'D3-SLL') throw new Error('BC-01 is ' + def.name)
const fg = structuredClone(def.face_grid)
const top = Math.max(...fg.rows.map(r => r.row_index))
fg.zones = fg.zones.map(z => z.row_index === top ? { ...z, finger_gap: 60 } : z)
chk('fg', await sb.from('cabinet_instances').update({ face_grid: fg }).eq('id', bc01.id))

// routes
const ops = []
const wc02 = chk('wc02', await C('WC-02')), wc11 = chk('wc11', await C('WC-11'))
const bottom = chk('bot', await sb.from('case_parts').select('dx,dy').eq('cabinet_instance_id', wc02.id).eq('part_key', 'bottom').single())
const up = chk('up', await sb.from('cabinet_custom_parts').select('id,dx,dy').eq('cabinet_instance_id', wc11.id).single())
const op = (cab, table, key, len) => ({ source_table: table, source_cabinet_id: cab.id, source_part_key: key, operation_type: 'route', operation_action: 'pocket',
  operation_role: 'local', plane_kind: 'face_back', pos_x: IN + W / 2, pos_y: len / 2, size_dx: W, size_dy: len + 12, size_dz: 9, depth: 9,
  router_tool_id: T110, auto_tool: false, output_to_cnc: true, fill_strategy: 'raster', raster_angle_deg: 90, raster_stepover_pct: 40,
  angle_ax: 0, angle_ay: 0, angle_az: 0, repeat_count: 1, sort_order: 0, parameters: { note: NOTE } })
for (const [cab, table, key, len] of [[wc02, 'case_parts', 'case_bottom', bottom.dy], [wc11, 'custom_parts', 'custom_' + up.id, up.dy]]) {
  chk('old', await sb.from('part_operations').delete().eq('source_cabinet_id', cab.id).eq('source_part_key', key).contains('parameters', { note: NOTE }))
  ops.push(op(cab, table, key, len))
}
chk('ops', await sb.from('part_operations').insert(ops))

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('dialog', d => { console.log('dialog', d.message()); d.dismiss() })
const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
const api = async (fn, ...a) => { const r = await Promise.race([page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message), sleep(60000).then(() => 'TIMEOUT')]); await sleep(1500); return r }
try {
  await open()
  for (const l of ['BC-01', 'WC-02', 'WC-11']) await api('updateCabinet', l, { dz: (await C(l)).data.dz })
  await open()
  const st = await api('getState')
  // elevation notes (insert only), under each part, x along the elevation = cabinet offset
  const rows = []
  for (const l of ['WC-02', 'WC-11']) {
    const c = st.cabinets.find(x => x.label === l), db = l === 'WC-02' ? wc02 : wc11
    const text = `LED STRIP under ${l} - recessed ${W} x 9 route, ${IN} in from the back`
    const dup = chk('dup', await sb.from('room_annotations').select('id').eq('room_id', R).eq('text', text))
    if (!dup.length) rows.push({ room_id: R, view: 'elevation', wall_id: db.wall_id, wall_side: 'face', kind: 'text', geom: { at: { x: c.offset + 60, y: -(db.pos_z - 25) }, width: 60 }, text, style: { size: 2.5 }, sort_order: 60 })
    console.log(l, 'offset', c.offset, 'underside', db.pos_z)
  }
  if (rows.length) chk('ann', await sb.from('room_annotations').insert(rows))
  const after = chk('after', await sb.from('cabinet_instances').select('label,resolved_drawer_hw').eq('room_id', R).eq('label', 'BC-01').single())
  console.log('BC-01 boxes', JSON.stringify((after.resolved_drawer_hw?.drawer_stacks ?? []).map(s => [s.face_zone_row, s.box_height, s.box_Y])))
  const fz = chk('fz', await sb.from('face_zones').select('row_index,dy').eq('cabinet_instance_id', bc01.id).order('row_index'))
  console.log('BC-01 fronts', JSON.stringify(fz))
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
