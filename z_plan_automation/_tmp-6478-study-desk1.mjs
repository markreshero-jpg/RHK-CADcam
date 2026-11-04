// RHK6478 Study (Mark 2026-11-04): desk top as ONE assembly. WC-21 becomes "Desk top" 3022 x 62.5 x 600 at 697.5 holding
// 10 custom parts (5 parts x 2 pieces, joint 1250); WC-22..WC-30 deleted. Steel + glass rebates re-pointed at the new parts.
// Cabinet frame: x along the wall from offset 0, y up from 697.5, z from the wall.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = 'a04663c7-1402-4344-be00-3ad4ce3aeae9', T110 = '12163452-ea8f-407e-85a9-340204dc0e5f', TEAK = '67ecbeff-98ac-41e1-9b1a-618a5bf6a96b'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const L = 3022, J = 1250, D = 600
const labels = ['WC-21', 'WC-22', 'WC-23', 'WC-24', 'WC-25', 'WC-26', 'WC-27', 'WC-28', 'WC-29', 'WC-30']
const cabs = chk('cabs', await sb.from('cabinet_instances').select('id,label,rule_overrides').eq('room_id', R).in('label', labels))
const C = l => cabs.find(c => c.label === l)
if (cabs.length !== 10 && cabs.length !== 1) throw new Error('expected 10 desk parts, got ' + cabs.map(c => c.label))
const tmpl = chk('tmpl', await sb.from('cabinet_custom_parts').select('*').eq('cabinet_instance_id', C('WC-21').id))[0]

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('dialog', d => { console.log('dialog', d.message()); d.dismiss() })
const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
const api = async (fn, ...a) => { const r = await Promise.race([page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message), sleep(60000).then(() => 'TIMEOUT')]); await sleep(1500); return r }
try {
  // 1. old pieces out (ops + parts + cabinets), keep WC-21
  for (const c of cabs) chk('ops', await sb.from('part_operations').delete().eq('source_cabinet_id', c.id))
  for (const c of cabs.filter(c => c.label !== 'WC-21')) {
    chk('cp', await sb.from('cabinet_custom_parts').delete().eq('cabinet_instance_id', c.id))
    chk('del', await sb.from('cabinet_instances').delete().eq('id', c.id))
  }
  const ro = { ...(C('WC-21').rule_overrides ?? {}), UNDER_PANEL: true }   // keeps the WUP at its own pos_z
  chk('wc21', await sb.from('cabinet_instances').update({ rule_overrides: ro, notes: 'DESK TOP assembly, 600 deep, glass top 760 (glass 510 deep + 40x40 steel by RHK, not modelled). All Sublime Teak 16.5 except the 10 cover strip (hand cut). Parts in 2 pieces, joint 1250 (mid BC-07)' }).eq('id', C('WC-21').id))
  await open()
  console.log(JSON.stringify(await api('updateCabinet', 'WC-21', { dx: L, dy: 62.5, dz: D, pos_z: 697.5 })))

  // 2. the 10 parts (literal sizes, no expressions)
  const { id: _i, created_at: _c, updated_at: _u, ...base } = tmpl
  const rows = []
  for (const [x, len, n] of [[0, J, 1], [J, L - J, 2]]) {
    const p = (name, orientation, pos, size, extra = {}) => rows.push({ ...base, name: `${name} ${n}/2`, orientation, x: pos[0], y: pos[1], z: pos[2], dx: size[0], dy: size[1], dz: size[2],
      expressions: {}, material_id: TEAK, material_override_id: null, edge_top: false, edge_bottom: false, edge_left: false, edge_right: false, no_cnc: false, sort_order: rows.length, ...extra })
    p('Desk underside', 'flat', [x, 0, 0], [D - 16.5, len, 16.5], { edge_top: true })
    p('Desk front strip', 'front', [x, 0, D - 16.5], [len, 56.5, 16.5], { edge_top: true, edge_bottom: true })
    p('Desk back rail', 'front', [x, 16.5, 0], [len, 29.5, 16.5])
    p('Desk back strip', 'flat', [x, 46, 0], [100, len, 16.5], { edge_top: true })
    p('Desk cover strip (hand cut)', 'flat', [x, 46.5, D - 116.5], [100, len, 10], { no_cnc: true })
  }
  const ins = chk('ins', await sb.from('cabinet_custom_parts').insert(rows).select('id,name,dx,dy'))
  chk('old part', await sb.from('cabinet_custom_parts').delete().eq('id', tmpl.id))

  // 3. ops: steel rebate (underside top face, front edge, 40 x 10) + glass rebate (back strip top front edge, 10 x 6)
  const op = (part, pos_x, size_dx, depth, len, note) => ({ source_table: 'custom_parts', source_cabinet_id: C('WC-21').id, source_part_key: 'custom_' + part.id,
    operation_type: 'route', operation_action: 'pocket', operation_role: 'local', plane_kind: 'face_front',
    pos_x, pos_y: len / 2, size_dx, size_dy: len + 12, size_dz: depth, depth,
    router_tool_id: T110, auto_tool: false, output_to_cnc: true, fill_strategy: 'raster', raster_angle_deg: 90, raster_stepover_pct: 40,
    angle_ax: 0, angle_ay: 0, angle_az: 0, repeat_count: 1, sort_order: 0, parameters: { note } })
  const ops = []
  for (const p of ins.filter(p => p.name.startsWith('Desk underside'))) ops.push(op(p, (D - 16.5) - 40 + 23, 46, 10, p.dy, '40 x 10 rebate for the 40x40 steel along the front edge (top face), 6 past the front edge and both ends'))
  for (const p of ins.filter(p => p.name.startsWith('Desk back strip'))) ops.push(op(p, 100 - 10 + 8, 16, 6, p.dy, 'Glass rebate 10 wide x 6 deep along the top front edge (6 past the front edge and both ends)'))
  chk('ops ins', await sb.from('part_operations').insert(ops))

  await open()
  console.log(JSON.stringify(await api('updateCabinet', 'WC-21', { dz: D })))
  await open()
  const rp = await api('getResolved', 'WC-21')
  for (const p of rp.custom_parts ?? []) console.log(' ', p.name, p.orientation, p.x, p.y, p.z, p.dx, p.dy, p.dz, p.no_cnc ? 'NO CNC' : '')
  const st = await api('getState')
  console.log(JSON.stringify(st.cabinets.filter(c => /^WC-(2\d|30)$/.test(c.label))))
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
