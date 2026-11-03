// RHK6542 Danny's Robe rev1: 0.5 offsets, fillers flush, uppers empty, flap whiteboard, BH untaped, shoe shelf = bottom + front, TV false panel.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '830e087b-d817-4843-b766-5fbdd8ee6c4a', WB = 'd081b2a1-38a8-472c-a415-f179699a1347'
const row = async l => chk(l, await sb.from('cabinet_instances').select('*').eq('room_id', R).eq('label', l).single())
const upd = async (l, patch) => chk('upd ' + l, await sb.from('cabinet_instances').update(patch).eq('room_id', R).eq('label', l))
const sleep = ms => new Promise(r => setTimeout(r, ms))
for (const l of ['WC-01', 'WC-02', 'WC-03']) await upd(l, { internal_grid: { tree: { type: 'open', fittings: [] } } })
await upd('TC-03', { material_overrides: { door_face: WB } })
await upd('WC-04', { edge_overrides: { 'case_bh:fascia': { top: false, bottom: false, left: false, right: false } } })
const tc03 = await row('TC-03')
const have = chk('cp', await sb.from('cabinet_custom_parts').select('id').eq('cabinet_instance_id', tc03.id).eq('name', 'TV False Panel'))
if (!have.length) chk('tv panel', await sb.from('cabinet_custom_parts').insert({
  cabinet_instance_id: tc03.id, part_library_id: '22020486-5fb4-4f23-a6e1-2bfead88ad1d', name: 'TV False Panel',
  x: 16.5, y: 698, z: 283.5, dx: 1102, dy: 1215.5, dz: 16.5, expressions: {}, orientation: 'front',
  material_id: WB, material_override_id: WB, edge_top: false, edge_bottom: false, edge_left: false, edge_right: false,
  visible: true, show_in_room: true, sort_order: 20, hide_views: [], grain_across: false }))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500) }
  const api = (fn, ...a) => page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a])
  await open()
  // Shoe pull-out = shelf + front: remove the box sides + back.
  const r2 = await api('getResolved', 'TC-02')
  const hide = Object.fromEntries(r2.internal_parts.filter(p => p.part_type === 'inner_drawer_side' || p.part_type === 'inner_drawer_back').map(p => [`int_${p.part_type}_${p.sort_order}`, ['plan', 'elevation', '3d']]))
  console.log('hide', JSON.stringify(Object.keys(hide)))
  await upd('TC-02', { part_hide_views: { ...(await row('TC-02')).part_hide_views, ...hide } })
  await open()
  for (const [l, p] of [['TC-01', { dz: 578 }], ['TC-05', { dz: 578 }], ['TC-02', { dz: 580 }], ['TC-03', { dz: 580 }], ['TC-04', { dz: 580 }], ['WC-01', { dz: 580 }], ['WC-02', { dz: 580 }], ['WC-03', { dz: 580 }], ['WC-04', { dz: 580 }]]) { await api('updateCabinet', l, p); await sleep(1500) }
  await open()
  const st = await api('getState')
  for (const c of st.cabinets) console.log(c.label, c.offset, c.dx, c.dy, c.dz)
  const db = chk('db', await sb.from('cabinet_instances').select('label,pos_x,dx,dy,dz,pos_z').eq('room_id', R).order('label'))
  console.log(JSON.stringify(db))
  for (const l of ['TC-01', 'TC-02', 'TC-03', 'WC-04']) {
    const rp = await api('getResolved', l)
    console.log('==', l, JSON.stringify((rp.custom_parts ?? []).map(p => [p.name, p.X ?? p.x, p.Y ?? p.y, p.Z ?? p.z, p.DX ?? p.dx, p.DY ?? p.dy, p.DZ ?? p.dz, p.material_id?.slice(0, 8)])),
      JSON.stringify(rp.case_parts.filter(p => p.part_key?.startsWith('bh')).map(p => [p.part_key, JSON.stringify(p.edge_band)])))
    if (rp.face_zones?.length) console.log('   zones', JSON.stringify(rp.face_zones.map(z => [z.face_type, z.Y, z.DY, z.DX, z.DZ, z.material_id?.slice(0, 8), z.hinges])))
  }
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('errors', issues.reduce((a, c) => a + c.errors.length, 0), 'issues', n)
} finally { await browser.close() }
