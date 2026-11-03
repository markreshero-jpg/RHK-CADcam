// RHK6542 Danny's Robe rev2 (Mark 2026-11-03): flap 25 finger gap at the top, shoe shelf on Dragon Pro 500x80, 2 TV cleats behind the false panel.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '830e087b-d817-4843-b766-5fbdd8ee6c4a', WB = 'd081b2a1-38a8-472c-a415-f179699a1347', DP80 = 'ff5c04b0-7213-45e8-8550-e541ba923267'
const row = async l => chk(l, await sb.from('cabinet_instances').select('*').eq('room_id', R).eq('label', l).single())
const upd = async (l, patch) => chk('upd ' + l, await sb.from('cabinet_instances').update(patch).eq('room_id', R).eq('label', l))
const sleep = ms => new Promise(r => setTimeout(r, ms))
// Flap: door 470.75 -> 656.5 (fixed shelf underside 681.5 - 25).
const FLAP_H = 656.5 - 470.75
{ const c = await row('TC-03'); await upd('TC-03', { face_grid: { ...c.face_grid, rows: c.face_grid.rows.map(r => r.row_index === 1 ? { ...r, height: FLAP_H, height_locked: true } : r) } })
  const cp = chk('cleats?', await sb.from('cabinet_custom_parts').select('id').eq('cabinet_instance_id', c.id).eq('name', 'TV Cleat'))
  if (!cp.length) chk('cleats', await sb.from('cabinet_custom_parts').insert([1170, 1520].map((y, i) => ({
    cabinet_instance_id: c.id, part_library_id: 'ce464194-e6d0-43bd-936d-51db9bfb56e5', name: 'TV Cleat',
    x: 16.5, y, z: 283.5 - 16.5, dx: 1102, dy: 100, dz: 16.5, expressions: {}, orientation: 'front',
    material_id: WB, material_override_id: WB, edge_top: false, edge_bottom: false, edge_left: false, edge_right: false,
    visible: true, show_in_room: true, sort_order: 21 + i, hide_views: [], grain_across: true })))) }
// Shoe shelf on Dragon Pro 500x80 Silk White.
{ const c = await row('TC-02'); const t = c.internal_grid.tree
  t.fittings = t.fittings.map(f => f.type === 'inner_drawer' ? { ...f, slide_product_id: DP80 } : f)
  await upd('TC-02', { internal_grid: { ...c.internal_grid, tree: t } }) }
// TV note mentions the cleats.
chk('note', await sb.from('room_annotations').update({ text: 'TV 48" ON FALSE PANEL AT HALF DEPTH, 2 CLEATS BEHIND (Y 1250-1350 / 1600-1700 AFF) - CABLES BEHIND PANEL (NO LV WIRE THROUGH WALL)' }).eq('room_id', R).like('text', 'TV 48%'))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' }); page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  const api = (fn, ...a) => page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a])
  for (const l of ['TC-02', 'TC-03']) { await api('updateCabinet', l, { dz: 580 }); await sleep(2000) }
  const r3 = await api('getResolved', 'TC-03')
  console.log('zones', JSON.stringify(r3.face_zones.map(z => [z.face_type, z.Y, z.DY, z.Y + z.DY])))
  console.log('custom', JSON.stringify(r3.custom_parts.map(p => [p.name, p.X ?? p.x, p.Y ?? p.y, p.Z ?? p.z, p.DX ?? p.dx, p.DY ?? p.dy])))
  const r2 = await api('getResolved', 'TC-02')
  console.log('shoe slides', JSON.stringify(r2.internal_slides.map(s => [s.side, s.Y, s.box_height, s.nominal_length, s.slide_id?.slice(0, 8)])))
  console.log('shoe parts', JSON.stringify(r2.internal_parts.filter(p => p.part_type.startsWith('inner')).map(p => [p.part_type, p.sort_order, p.Y, p.DX, p.DY])))
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('errors', issues.reduce((a, c) => a + c.errors.length, 0), 'issues', n)
} finally { await browser.close() }
