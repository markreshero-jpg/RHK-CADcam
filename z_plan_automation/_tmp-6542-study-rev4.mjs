// RHK6542 Study rev 4 (Mark 2026-11-03):
//  WC-03 no handles + under panel set back 20; BC-02 BEPF on its right (cleat shortened);
//  TC-07 split into 3 open cupboards (own 16.5 gables); TC-06 912 handle centred on the door;
//  bulkheads set back 18 (front = carcase), raw MDF 18 untaped; WC-05 stops 16 short of WC-04's end;
//  WC-06 bottom return 200 mitre.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = 'a81555f3-22f3-4efd-947b-4e083bf49c94'
const MDF18 = '3b486c8f-ee1c-494d-b462-2dd206e3999d', H912 = 'aec08746-44c3-4008-a23b-17422d266ca1'
const row = async l => chk(l, await sb.from('cabinet_instances').select('*').eq('room_id', R).eq('label', l).single())
const upd = async (l, patch) => chk('upd ' + l, await sb.from('cabinet_instances').update(patch).eq('room_id', R).eq('label', l))
const fs0 = (...keys) => Object.fromEntries(keys.map(k => [`case_${k}`, { top: false, bottom: false, left: false, right: false }]))
const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── DB edits ────────────────────────────────────────────────────────────────
{ const c = await row('WC-03'); await upd('WC-03', { face_grid: { ...c.face_grid, zones: c.face_grid.zones.map(z => ({ ...z, handle_id: 'none' })) } }) }
await upd('BC-02', { material_overrides: {} })
{ const c = await row('WC-01'); chk('cleat', await sb.from('cabinet_custom_parts').update({ x: 733, dx: 1934 }).eq('cabinet_instance_id', c.id).eq('name', 'Wall Cleat')) }
{ const c = await row('TC-06'); await upd('TC-06', { face_grid: { ...c.face_grid, zones: c.face_grid.zones.map(z => ({ ...z, handle_id: H912, handle_offset: 1170, handle_drill: false })) } }) }
const bh = (b, patch) => ({ ...b, front: 'carcase', ...patch })
{ const c = await row('WC-05'); await upd('WC-05', { dx: 2684, dz: 332.5, material_overrides: { exposed: MDF18 }, edge_overrides: fs0('bh:fascia', 'bh:ret_r'),
  bulkhead: bh(c.bulkhead, { right: { on: true, depth: 332.5, joint: 'mitre' } }) }) }
{ const c = await row('WC-06'); await upd('WC-06', { dz: 582, material_overrides: { exposed: MDF18 }, edge_overrides: fs0('bh:fascia', 'bh:ret_l', 'bh:ret_r', 'bh:ret_b'),
  bulkhead: bh(c.bulkhead, { left: { on: true, depth: 200, joint: 'mitre' }, right: { on: true, depth: 582, joint: 'mitre' }, bottom: { on: true, depth: 200, joint: 'mitre' } }) }) }
{ const c = await row('WC-07'); await upd('WC-07', { dz: 317.5, material_overrides: { exposed: MDF18 }, edge_overrides: fs0('bh:fascia', 'bh:ret_l'),
  bulkhead: bh(c.bulkhead, { left: { on: true, depth: 317.5, joint: 'mitre' } }) }) }
// TC-07: keep bay 1 only; bays 2 / 3 become their own cupboards.
const tc07 = await row('TC-07')
const bays = tc07.internal_grid.tree.type === 'vsplit' ? tc07.internal_grid.tree.children.map(ch => ch.section) : null
if (bays) await upd('TC-07', { internal_grid: { tree: bays[0] } })

// ── Bridge ──────────────────────────────────────────────────────────────────
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500) }
  const api = (fn, ...a) => page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a])
  await open()
  await api('updateCabinet', 'TC-07', { dx: 770 }); await sleep(1500)
  const before = new Set((await api('getState')).cabinets.map(c => c.label))
  // New cabinets.
  console.log('bepf', JSON.stringify(await api('placeCabinet', { def: 'BEPF', wall: 'Wall 1', offset: 716.5, dx: 16.5 }))); await sleep(800)
  if (bays) {
    console.log('t2', JSON.stringify(await api('placeCabinet', { def: 'T2D', wall: 'Wall 5', offset: 1523.5, dx: 770 }))); await sleep(800)
    console.log('t3', JSON.stringify(await api('placeCabinet', { def: 'T2D', wall: 'Wall 5', offset: 2293.5, dx: 770 }))); await sleep(800)
  }
  let st = await api('getState')
  const added = st.cabinets.filter(c => !before.has(c.label))
  console.log('added', added.map(c => `${c.label} ${c.wall} ${c.offset} ${c.dx}`).join(' | '))
  const bepf = added.find(c => c.wall === 'Wall 1')
  const opens = added.filter(c => c.wall === 'Wall 5').sort((a, b) => a.offset - b.offset)
  chk('bepf dx', await sb.from('cabinet_instances').update({ dx: 16.5, notes: 'Pedestal seen end (kneehole side), walnut, under the desk top' }).eq('id', bepf.id))
  const openCols = { has_face: false, top_type: tc07.top_type, exposed_interior: true, material_overrides: tc07.material_overrides }
  for (const [i, c] of opens.entries())
    chk('open ' + c.label, await sb.from('cabinet_instances').update({ ...openCols, internal_grid: { tree: bays[i + 1] }, notes: tc07.notes }).eq('id', c.id))
  await open()
  // Sizes + re-resolves.
  await api('updateCabinet', bepf.label, { dy: 699, dz: 662 }); await sleep(1200)
  for (const c of opens) { await api('updateCabinet', c.label, { dy: 2420, dz: 335 }); await sleep(1500) }
  for (const [l, dz] of [['WC-01', 700], ['BC-02', 662], ['TC-06', 317], ['WC-03', 332], ['WC-05', 332.5], ['WC-06', 582], ['WC-07', 317.5]]) { await api('updateCabinet', l, { dz }); await sleep(1200) }
  // Under panel under WC-03, set back 20 from the carcass front.
  const pre = new Set((await api('getState')).cabinets.map(c => c.label))
  console.log('under panel', JSON.stringify(await api('addUnderPanel', ['WC-03']))); await sleep(2500)
  st = await api('getState')
  const wup = st.cabinets.find(c => !pre.has(c.label))
  console.log('wup', wup?.label, wup?.offset, wup?.dx, wup?.dz)
  if (wup) { await api('updateCabinet', wup.label, { dz: 312 }); await sleep(1500) }

  st = await api('getState')
  for (const c of st.cabinets) console.log(c.label, c.wall, c.offset, c.dx, c.dy, c.dz)
  for (const l of ['WC-03', wup?.label, 'TC-06', 'WC-05', 'WC-06', 'WC-07', 'TC-07', ...opens.map(c => c.label), bepf.label].filter(Boolean)) {
    const rp = await api('getResolved', l)
    if (!rp) { console.log(l, 'no resolved'); continue }
    console.log(l, JSON.stringify([...rp.case_parts.map(p => [p.part_key, p.X, p.Y, p.Z, p.DX, p.DY, p.DZ, p.material_id?.slice(0, 8), Object.values(p.edge_band ?? {}).filter(v => v === true).length]),
      ...rp.custom_parts.map(p => [p.name, p.X ?? p.x, p.Z ?? p.z, p.DX ?? p.dx, p.DY ?? p.dy, p.DZ ?? p.dz, p.material_id?.slice(0, 8)])]))
    if (rp.internal_parts?.length) console.log(l, 'int', JSON.stringify(rp.internal_parts.map(p => [p.part_type, p.X, p.Y, p.DY, p.DZ])))
    if (rp.face_zones?.length) console.log(l, 'zones', JSON.stringify(rp.face_zones.map(z => [z.face_type, z.Y, z.DY, z.handle?.name ?? null, z.handle?.x, z.handle?.y])))
  }
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('errors', issues.reduce((a, c) => a + c.errors.length, 0), 'issues', n)
} finally { await browser.close() }
