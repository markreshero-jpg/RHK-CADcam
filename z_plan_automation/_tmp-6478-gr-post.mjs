// RHK6478 Guest Robe post: end panels 16.5 x 200 Teak 16 (side Filler part, pos_y 400), TC-03 duct box-out footprint 300 (R->L) x 200 (back->front) full height
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '19f84132-6ed5-49b5-a0da-0f916966dcbb', T16 = '67ecbeff-98ac-41e1-9b1a-618a5bf6a96b'
const cabs = chk('cabs', await sb.from('cabinet_instances').select('id,label').eq('room_id', R))
const id = Object.fromEntries(cabs.map(c => [c.label, c.id]))
for (const l of ['TC-01', 'TC-04']) {
  chk('fill', await sb.from('cabinet_custom_parts').update({ orientation: 'side', x: 0, z: 0, material_id: T16, expressions: { dx: 'cab.d', dy: 'cab.h', dz: 't.exposed' } }).eq('cabinet_instance_id', id[l]).eq('name', 'Filler'))
  chk('mat', await sb.from('cabinet_instances').update({ material_overrides: { exposed: T16 },
    notes: `# ${l === 'TC-01' ? 1 : 4} 16.5 x 200 deep Lx Sublime Teak (16mm Chalk) end panel at the wall, between the plates, front flush with the plates (600 OA)` }).eq('id', id[l]))
}
// Duct box-out: cabinet frame x along the width (0 = left), y depth (0 = back)
const V = [
  { id: 'back',       x: '0',           y: '0',     role: 'back' },
  { id: 'duct_side',  x: 'cab.w - 300', y: '0',     role: 'side' },
  { id: 'duct_back',  x: 'cab.w - 300', y: '200',   role: 'back' },
  { id: 'right',      x: 'cab.w',       y: '200',   role: 'side' },
  { id: 'front',      x: 'cab.w',       y: 'cab.d', role: 'front' },
  { id: 'left',       x: '0',           y: 'cab.d', role: 'side' },
]
const w = 855, d = 520, ev = s => Function('cab', `return ${s.replace(/cab\.(\w)/g, 'cab.$1')}`)({ w, d })
const pts = V.map(v => ({ x: ev(v.x), y: ev(v.y) }))
const footprint = { preset: null, params: {}, from_preset: 'rectangle',
  segments: V.map((v, i) => ({ type: 'line', p0: pts[i], p1: pts[(i + 1) % V.length], p0_expr: { x: v.x, y: v.y }, edge: { id: v.id, role: v.role } })) }
chk('fp', await sb.from('cabinet_instances').update({ footprint }).eq('id', id['TC-03']))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => d.dismiss())
  const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
  const api = (fn, ...a) => page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a])
  await open()
  for (const [l, p] of [['TC-01', { dx: 16.5, dz: 200 }], ['TC-04', { offset: 1721.5, dx: 16.5, dz: 200 }]]) { console.log(JSON.stringify(await api('updateCabinet', l, p))); await sleep(1500) }
  chk('pos', await sb.from('cabinet_instances').update({ pos_y: 400 }).in('id', [id['TC-01'], id['TC-04']]))
  await open()
  for (const l of ['TC-01', 'TC-04', 'TC-03', 'BC-01']) { const c = chk('c', await sb.from('cabinet_instances').select('dz').eq('id', id[l]).single()); await api('updateCabinet', l, { dz: Number(c.dz) }); await sleep(1500) }
  const rp = await api('getResolved', 'TC-03')
  for (const p of [...rp.case_parts ?? rp.parts ?? [], ...rp.internal_parts ?? []]) console.log(' ', p.part_key ?? p.part_type, 'X', p.X, 'Y', p.Y, 'Z', p.Z, 'DX', p.DX, 'DY', p.DY, 'DZ', p.DZ, p.outline ? 'outline ' + JSON.stringify(p.outline).slice(0, 160) : '')
  const kp = await api('getResolved', 'BC-01')
  for (const p of kp.toekick_parts ?? kp.toekick ?? []) console.log(' kick', p.part_key ?? p.part_type, 'X', p.X, 'Z', p.Z, 'DX', p.DX, 'DY', p.DY, 'DZ', p.DZ)
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
for (const c of chk('after', await sb.from('cabinet_instances').select('label,pos_x,pos_y,pos_z,dx,dy,dz').eq('room_id', R).order('label'))) console.log(JSON.stringify(c))
