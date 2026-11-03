// RHK6478 Study post-draw (Mark Q&A 2026-11-04): 16.5 desk panels, 33 Teak bench, 2pac splash (upright), WEP front fillers,
// overhead doors no handles, kick joined, printer shelf 450, under panels set back 20 + LED routes, shaped leg BC-10.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = 'a04663c7-1402-4344-be00-3ad4ce3aeae9'
const TEAK33 = '8fae4f9c-02aa-4799-a46d-52be445d247d', PAC_BOARD = 'b07a7e40-facd-4cdf-8856-60712e940b44', T110 = '12163452-ea8f-407e-85a9-340204dc0e5f'
const mode = process.argv[2] ?? 'all'
const cabsNow = async () => chk('cabs', await sb.from('cabinet_instances').select('id,label,face_grid,internal_grid,rule_overrides,dx,dy,dz,pos_z').eq('room_id', R))
const by = async l => { const c = (await cabsNow()).find(c => c.label === l); if (!c) throw new Error('no ' + l); return c }
const upd = async (l, patch) => { const c = await by(l); chk(l, await sb.from('cabinet_instances').update(patch).eq('id', c.id)); return c }
const parts = async l => chk('cp ' + l, await sb.from('cabinet_custom_parts').select('id,name,orientation,expressions,x,z,dx,dy,dz').eq('cabinet_instance_id', (await by(l)).id))
const sleep = ms => new Promise(r => setTimeout(r, ms))

if (mode === 'all') {
  for (const l of ['BC-06', 'BC-07', 'BC-09', 'BC-10']) await upd(l, { dx: 16.5 })
  for (const l of ['WC-01', 'WC-02']) await upd(l, { material_overrides: { exposed: TEAK33 } })
  for (const l of ['WC-03', 'WC-04']) {
    await upd(l, { material_overrides: { exposed: PAC_BOARD } })
    for (const p of await parts(l)) chk(l, await sb.from('cabinet_custom_parts').update({ orientation: 'front', expressions: { ...(p.expressions ?? {}), z: '0', dx: 'cab.w', dy: 'cab.h', dz: 't.exposed' } }).eq('id', p.id))
  }
  for (const l of ['WC-05', 'WC-09', 'WC-10', 'WC-16'])
    chk(l, await sb.from('cabinet_custom_parts').update({ orientation: 'front', expressions: { z: 'cab.d + 2', dx: 'cab.w', dy: 'cab.h', dz: 't.exposed' } }).eq('cabinet_instance_id', (await by(l)).id).eq('name', 'Applied Panel'))
  for (const l of ['WC-11', 'WC-13', 'WC-15']) { const c = await by(l); const fg = structuredClone(c.face_grid); fg.zones = fg.zones.map(z => ({ ...z, handle_id: 'none' })); await upd(l, { face_grid: fg }) }

  // shaped leg BC-10: side frame x = depth from the back (0) to the front (595), y down from the top (0) to the floor (744).
  // 595 top, 45 deg down-back from the front top corner, R200 into the vertical at x 200, 200 at the floor.
  const H = 744, D = 595, X = 200, r = 200, cy = D - X
  const tl = r * Math.tan(Math.PI / 8), s = tl / Math.SQRT2
  const a = { x: X + s, y: cy - s }, b = { x: X, y: cy + tl }
  const P = [{ x: 0, y: 0 }, { x: D, y: 0 }, a, b, { x: X, y: H }, { x: 0, y: H }]
  const segs = [
    { type: 'line', p0: P[0], p1: P[1] }, { type: 'line', p0: P[1], p1: a },
    { type: 'arc', p0: a, p1: b, rx: r, ry: r, largeArc: 0, sweep: 0 },
    { type: 'line', p0: b, p1: P[4] }, { type: 'line', p0: P[4], p1: P[5] }, { type: 'line', p0: P[5], p1: P[0] },
  ]
  const cab = await by('BC-10'), ap = (await parts('BC-10')).find(p => p.name === 'Applied Panel')
  const key = 'custom_' + ap.id
  chk('pso del', await sb.from('part_shape_overrides').delete().eq('cabinet_id', cab.id).eq('part_key', key))
  chk('pso', await sb.from('part_shape_overrides').insert({ cabinet_id: cab.id, part_key: key, revision: 1, segments: segs,
    meta: { bounds: { minX: 0, minY: 0, maxX: D, maxY: H }, closed: true, sizeSlots: { up: 'dy', across: 'dx', custom: true }, baseAtSave: { w: D, h: H }, segmentCount: segs.length } }))
  console.log('leg shaped', key, JSON.stringify(ap))
}

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('dialog', d => { console.log('dialog', d.message()); d.dismiss() })
const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
const api = async (fn, ...a) => { const r = await Promise.race([page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message), sleep(60000).then(() => 'TIMEOUT')]); await sleep(1200); return r }
try {
  await open()
  if (mode === 'all') {
    console.log('join', JSON.stringify(await api('joinKicks', 'BC-02'))); await sleep(2500)
    for (const g of [['WC-11', 'WC-12'], ['WC-13', 'WC-14', 'WC-15']]) console.log('under', JSON.stringify(await api('addUnderPanel', g)))
    await sleep(2500)
    // printer cupboard: adj shelf locked 450 off the bottom (frame = carcass bottom after the join)
    await upd('BC-04', { internal_grid: { tree: { type: 'open', fittings: [{ type: 'adj_shelf', y_locked: true, y_position: 450 }] } } })
  }
  const ups = (await cabsNow()).filter(c => /^WC-/.test(c.label) && c.rule_overrides?.UNDER_PANEL && c.dy < 30 && c.dz < 400)
  console.log('wups', ups.map(c => `${c.label} ${c.dx}x${c.dy}x${c.dz}`).join(' | '))
  await open()
  for (const c of ups) {
    if (c.dz !== 310) console.log(c.label, JSON.stringify(await api('updateCabinet', c.label, { dz: 310 })))
    await upd(c.label, { notes: 'Under panel 16.5 Sublime Teak, set back 20 from the carcass (no handles), recessed LED route' })
  }
  const st = await api('getState')
  for (const c of st.cabinets) await api('updateCabinet', c.label, { dz: c.dz })
  // LED routes in the under panels: 18.5 x 9 pocket, 60 back from the front, 6 past both ends
  for (const c of ups) {
    const ap = (await parts(c.label))[0]
    const fresh = await by(c.label)
    chk('led del', await sb.from('part_operations').delete().eq('source_cabinet_id', c.id).eq('operation_type', 'route'))
    chk('led', await sb.from('part_operations').insert({ source_table: 'custom_parts', source_cabinet_id: c.id, source_part_key: 'custom_' + ap.id,
      operation_type: 'route', operation_action: 'pocket', operation_role: 'local', plane_kind: 'face_back',
      pos_x: fresh.dz - 60 - 9.25, pos_y: fresh.dx / 2, size_dx: 18.5, size_dy: fresh.dx + 12, size_dz: 9, depth: 9,
      router_tool_id: T110, auto_tool: false, output_to_cnc: true, fill_strategy: 'raster', raster_angle_deg: 90, raster_stepover_pct: 40,
      angle_ax: 0, angle_ay: 0, angle_az: 0, repeat_count: 1, sort_order: 0,
      parameters: { note: 'Recessed LED strip route 18.5 x 9, 60 back from the front, 6 past both ends' } }))
    console.log('led', c.label, fresh.dx, fresh.dz)
  }
  await open()
  const st2 = await api('getState')
  for (const c of st2.cabinets) console.log(c.label, c.wall, c.offset, c.dx, c.dy, c.dz, c.pos_z)
  for (const l of ['BC-04', 'BC-08', 'WC-01', 'WC-03', 'WC-11']) {
    const rp = await api('getResolved', l)
    console.log(l, JSON.stringify([...(rp.case_parts ?? []).map(p => [p.part_key, p.DX, p.DY, p.DZ, p.material_id?.slice(0, 8)]), ...(rp.internal_parts ?? []).map(p => [p.part_key ?? p.part_type, p.Y, p.DZ]), ...(rp.face_zones ?? []).map(z => ['face', z.DX, z.DY, z.handle?.grip_kind ?? z.handle_id]), ...(rp.custom_parts ?? []).map(p => [p.name, p.DX, p.DY, p.DZ, p.material_id?.slice(0, 8)])]))
  }
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
