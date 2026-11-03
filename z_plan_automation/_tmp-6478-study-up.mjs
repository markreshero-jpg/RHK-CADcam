// RHK6478 Study (Mark 2026-11-04): Wall 3 under panels only under the door cabinets WC-11 / WC-13 / WC-15
// (WC-19 / WC-20 spanning the open bays deleted), LED routes in the bottoms of the open boxes WC-12 / WC-14 instead,
// WC-12 / WC-14 back joints Cabineo 12 - outside (fixings on the wall side), BC-08 kick 50.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = 'a04663c7-1402-4344-be00-3ad4ce3aeae9', T110 = '12163452-ea8f-407e-85a9-340204dc0e5f'
const CAB_OUT = 'ad0c6e3b-ed84-49e4-9a37-5a4d38f0add2'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const cabsNow = async () => chk('cabs', await sb.from('cabinet_instances').select('id,label,rule_overrides,carcase_joints,dx,dy,dz,pos_x,pos_z').eq('room_id', R))
const by = async l => (await cabsNow()).find(c => c.label === l)
const ledRow = (cabId, table, key, posX, len, note) => ({ source_table: table, source_cabinet_id: cabId, source_part_key: key,
  operation_type: 'route', operation_action: 'pocket', operation_role: 'local', plane_kind: 'face_back',
  pos_x: posX, pos_y: len / 2, size_dx: 18.5, size_dy: len + 12, size_dz: 9, depth: 9,
  router_tool_id: T110, auto_tool: false, output_to_cnc: true, fill_strategy: 'raster', raster_angle_deg: 90, raster_stepover_pct: 40,
  angle_ax: 0, angle_ay: 0, angle_az: 0, repeat_count: 1, sort_order: 0, parameters: { note } })

// 1. old spanning under panels out
for (const l of ['WC-19', 'WC-20']) {
  const c = await by(l); if (!c) continue
  chk('ops ' + l, await sb.from('part_operations').delete().eq('source_cabinet_id', c.id))
  chk('cp ' + l, await sb.from('cabinet_custom_parts').delete().eq('cabinet_instance_id', c.id))
  chk('del ' + l, await sb.from('cabinet_instances').delete().eq('id', c.id))
  console.log(l, 'deleted')
}
// 2. Cabineo outside on the open boxes' back seams; BC-08 kick 50
for (const l of ['WC-12', 'WC-14']) {
  const c = await by(l)
  chk('cj ' + l, await sb.from('cabinet_instances').update({ carcase_joints: { ...(c.carcase_joints ?? {}), 'back:left_side': CAB_OUT, 'back:right_side': CAB_OUT, 'back:bottom': CAB_OUT } }).eq('id', c.id))
}
{ const c = await by('BC-08'); chk('kick', await sb.from('cabinet_instances').update({ rule_overrides: { ...(c.rule_overrides ?? {}), TOEH: 50 } }).eq('id', c.id)) }

const before = new Set((await cabsNow()).map(c => c.label))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('dialog', d => { console.log('dialog', d.message()); d.dismiss() })
const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
const api = async (fn, ...a) => { const r = await Promise.race([page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message), sleep(60000).then(() => 'TIMEOUT')]); await sleep(1500); return r }
try {
  await open()
  for (const l of ['WC-11', 'WC-13', 'WC-15']) console.log('under', l, JSON.stringify(await api('addUnderPanel', [l])))
  await sleep(2500)
  const ups = (await cabsNow()).filter(c => !before.has(c.label) && c.rule_overrides?.UNDER_PANEL)
  console.log('new', ups.map(c => `${c.label} x${c.pos_x} ${c.dx}x${c.dy}x${c.dz}`).join(' | '))
  for (const c of ups) chk('dy', await sb.from('cabinet_instances').update({ dy: 16.5, notes: 'Under panel 16.5 Sublime Teak, set back 20 from the carcass (no handles), recessed LED route' }).eq('id', c.id))
  await open()
  for (const c of ups) console.log(c.label, JSON.stringify(await api('updateCabinet', c.label, { dz: 310 })))
  for (const l of ['WC-12', 'WC-14', 'BC-08']) console.log(l, JSON.stringify(await api('updateCabinet', l, { dz: (await by(l)).dz })))
  // LED routes: under panels (custom part) + open-box bottoms (case_bottom underside), same line 240.75 off the wall
  for (const c of ups) {
    const fresh = await by(c.label)
    const ap = chk('cp', await sb.from('cabinet_custom_parts').select('id').eq('cabinet_instance_id', c.id))[0]
    chk('led', await sb.from('part_operations').insert(ledRow(c.id, 'custom_parts', 'custom_' + ap.id, fresh.dz - 60 - 9.25, fresh.dx, 'Recessed LED strip route 18.5 x 9, 60 back from the front, 6 past both ends')))
  }
  for (const l of ['WC-12', 'WC-14']) {
    const c = await by(l)
    const bot = (await api('getResolved', l)).case_parts.find(p => p.part_key === 'bottom')
    chk('led del', await sb.from('part_operations').delete().eq('source_cabinet_id', c.id).eq('operation_type', 'route'))
    chk('led', await sb.from('part_operations').insert(ledRow(c.id, 'case_parts', 'case_bottom', 310 - 69.25, bot.DY, 'Recessed LED strip route 18.5 x 9 in the underside of the bottom, in line with the under panel routes (240.75 off the wall)')))
    console.log('led bottom', l, bot.DX, bot.DY, bot.DZ)
  }
  await open()
  for (const l of ['WC-12', 'BC-08']) {
    const rp = await api('getResolved', l)
    if (l === 'WC-12') console.log(l, JSON.stringify(rp.seam_joints.filter(s => /^back/.test(s.seam_key ?? s.key)).map(s => [s.seam_key ?? s.key, s.joint_type_name])))
    else console.log(l, JSON.stringify([...rp.case_parts.map(p => [p.part_key, p.DX, p.DY, p.Y]), ...rp.face_zones.map(z => ['face', z.DX, z.DY, z.Y])]))
  }
  const st = await api('getState')
  for (const c of st.cabinets.filter(c => c.wall === 'Wall 3' && /^WC/.test(c.label))) console.log(c.label, c.offset, c.dx, c.dy, c.dz, c.pos_z)
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
