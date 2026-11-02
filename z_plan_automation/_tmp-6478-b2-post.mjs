// RHK6478 Bed 2 Robe post: drawer gaps 30, fillers out to 600 + return to the gable
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '761f434a-cdc8-4cb8-b1dc-da69ae78f12a', TEAK = '67ecbeff-98ac-41e1-9b1a-618a5bf6a96b'
const cabs = chk('cabs', await sb.from('cabinet_instances').select('id,label,internal_grid').eq('room_id', R))
const id = Object.fromEntries(cabs.map(c => [c.label, c.id]))
// TC-02: fronts 196 (178 box), 30 gaps, bottom front 2 off the bottom; fixed shelf 30 over the top front
const g = cabs.find(c => c.label === 'TC-02').internal_grid
const ch = g.tree.children
ch[0].size = 680
ch[0].section.fittings.forEach((f, i) => { f.y_position = [16.5, 242.5, 468.5][i] })
ch[1].size = 1094
chk('TC-02', await sb.from('cabinet_instances').update({ internal_grid: g }).eq('id', id['TC-02']))
// fillers: front face at 600 (dz 520 + 80), return to the gable (Teak, from the carcass front to the filler back)
for (const [l, x] of [['TC-01', 'cab.w - t.exposed'], ['TC-05', '0']]) {
  chk('filler', await sb.from('cabinet_custom_parts').update({ expressions: { z: 'cab.d + 80 - t.exposed', dx: 'cab.w', dy: 'cab.h', dz: 't.exposed' } }).eq('cabinet_instance_id', id[l]).eq('name', 'Filler'))
  chk('ret del', await sb.from('cabinet_custom_parts').delete().eq('cabinet_instance_id', id[l]).eq('name', 'Filler Return'))
  chk('ret', await sb.from('cabinet_custom_parts').insert({ cabinet_instance_id: id[l], part_library_id: 'ecd95bb2-900b-4341-ab42-d6b98412f2e0', name: 'Filler Return',
    material_id: TEAK, orientation: 'side', sort_order: 1, x: 0, y: 0, z: 520, dx: 63.5, dy: 2219.5, dz: 16.5, edge_top: false, edge_bottom: false, edge_left: false, edge_right: false, visible: true, no_cnc: false,
    expressions: { x, z: 'cab.d', dx: '80 - t.exposed', dy: 'cab.h', dz: 't.exposed' } }))
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  const api = (fn, ...a) => page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a])
  for (const l of ['TC-01', 'TC-02', 'TC-05']) { console.log(JSON.stringify(await api('updateCabinet', l, { dz: 520 }))); await sleep(1500) }
  const rp = await api('getResolved', 'TC-02')
  for (const p of rp.internal_parts) if (/front|fixed/.test(p.part_type)) console.log(p.part_type, 'Y', p.Y, 'H', p.DX, p.DZ)
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
const cp = chk('cp', await sb.from('cabinet_custom_parts').select('cabinet_instance_id,name,x,z,dx,dy,dz').in('cabinet_instance_id', [id['TC-01'], id['TC-05']]))
for (const p of cp) console.log(Object.entries(id).find(([, v]) => v === p.cabinet_instance_id)[0], JSON.stringify(p))
