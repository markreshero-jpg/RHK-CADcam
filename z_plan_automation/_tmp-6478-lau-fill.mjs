// RHK6478 Laundry (Mark 2026-11-16): no 30 fillers - 2pac fillers 18 wide, Sublime Teak fillers 16.5; overhead filler = WF-L (L-shaped).
//  Wall 2: TC-01 30->18 (tower box 620->632: TC-04 / WC-01 / BC-01); BC-06 30->18 (BC-05 drawers + TC-13 back 952->964);
//          WC-05 30 Teak face filler -> WF-L 16.5 (converted in place), WC-03 / WC-04 485 -> 491.75.
//  Wall 4: TC-09 28->18 (talls TC-07/08 + uppers WC-07/08 888->893); PDR TC-10 / TC-11 30->16.5 Teak (BC-07 920->947, basin stays centred).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'fc12bc7d-53ee-46ee-a302-3411f5129bcc', TEAK = '67ecbeff-98ac-41e1-9b1a-618a5bf6a96b', WFL = 'cf3eea4b-dd70-4f69-bb01-742a6732b1d0'
const chk = (w, r) => { if (r.error) { console.log('ERR', w, r.error.message); process.exit(1) } }
const { data: cabs } = await sb.from('cabinet_instances').select('id,label,notes').eq('room_id', R)
const L = Object.fromEntries(cabs.map(c => [c.label, c]))
const up = async (l, patch) => chk(l, await sb.from('cabinet_instances').update(patch).eq('id', L[l].id))
const cpx = async (l, patch) => chk(l + ' cp', await sb.from('cabinet_custom_parts').update(patch).eq('cabinet_instance_id', L[l].id))
const note = (l, from, to) => (L[l].notes ?? '').replace(from, to)
// Wall 2 (angle 0, pos_x = left edge)
await up('TC-01', { dx: 18, notes: note('TC-01', '# 1 30 filler', '# 1 18 2pac filler') }); await cpx('TC-01', { dx: 18 })
await up('TC-02', { pos_x: 850 })
for (const l of ['TC-04', 'WC-01', 'BC-01']) await up(l, { pos_x: 868, dx: 632 })
await cpx('WC-01', { dy: 632 })
await up('BC-05', { dx: 964 }); await up('TC-13', { dx: 964 }); await cpx('TC-13', { dx: 964 })
await up('BC-06', { pos_x: 3470, dx: 18, notes: note('BC-06', '30 filler', '18 2pac filler') }); await cpx('BC-06', { dx: 18 })
await up('WC-03', { dx: 491.75 }); await up('WC-04', { pos_x: 2979.75, dx: 491.75 })
// WC-05 -> WF-L (L filler, Teak 16.5, 348.5 deep to the door face)
const H = 1057, D = 348.5
await up('WC-05', { cabinet_definition_id: WFL, pos_x: 3471.5, dx: 16.5, dz: D, has_carcass: false, has_internal: false, has_face: false, has_toekick: false, top_type: 'front_rail',
  material_overrides: { exposed: TEAK }, left_neighbour_type: 'cabinet', right_neighbour_type: 'wall',
  notes: '# 16 WF-L 16.5 Sublime Teak L filler to Wall 6 (70 front leg + 70 bottom leg), no 30 fillers (Mark 2026-11-16)' })
await cpx('WC-05', { name: 'L Filler', x: 0, y: 0, z: 0, dx: D, dy: H, dz: 16.5, orientation: 'side', material_id: TEAK,
  outline: [{ x: 0, y: H }, { x: 0, y: H - 70 }, { x: D - 70, y: H - 70 }, { x: D - 70, y: 0 }, { x: D, y: 0 }, { x: D, y: H }],
  edge_top: true, edge_left: false, edge_right: true, edge_bottom: true, expressions: { dx: 'cab.d', dy: 'cab.h', dz: 't.exposed' },
  part_cutouts: [{ d: 'cab.d - 70', w: 'cab.h - 70', x: { off: 0, from: 'right' }, y: { off: 0, from: 'back' }, id: 'L', edge: 'back', kind: 'notch', depth: null, shape: 'rect', radius: 0, source: 'user' }] })
// Wall 4 (angle 180, pos_x = right end in room x)
await up('TC-09', { pos_x: 850, dx: 18, notes: '# 20 18 2pac filler to Nib 1 (talls recess 1822)' }); await cpx('TC-09', { dx: 18 })
for (const [l, x] of [['TC-08', 1743], ['WC-08', 1743], ['TC-07', 2636], ['WC-07', 2636]]) await up(l, { pos_x: x, dx: 893 })
await up('TC-10', { dx: 16.5, notes: note('TC-10', '30 filler', '16.5 Teak filler') }); await cpx('TC-10', { dx: 16.5 })
await up('BC-07', { pos_x: 725.5, dx: 947 })
await up('TC-11', { pos_x: -221.5, dx: 16.5, notes: note('TC-11', '30 filler', '16.5 Teak filler') }); await cpx('TC-11', { dx: 16.5 })
chk('basin', await sb.from('room_fixtures').update({ link_x: 473.5 }).eq('id', '7cc82318-6668-4d40-8082-bc7277263758'))
console.log('db done')
// resolve the changed cabinets through the canvas so cached parts / L outline rebuild
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const api = (page, fn, ...a) => page.evaluate((fn, a) => window.__canvasApi[fn](...a), fn, a)
try {
  const page = await browser.newPage(); page.on('dialog', d => d.dismiss())
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(3000)
  const { data: now } = await sb.from('cabinet_instances').select('label,dy').eq('room_id', R)
  for (const c of now.filter(c => ['WC-05', 'TC-01', 'WC-01', 'TC-13', 'BC-06', 'TC-09', 'TC-10', 'TC-11'].includes(c.label))) { await api(page, 'updateCabinet', c.label, { dy: Number(c.dy) }); await sleep(2500) }
  const rp = await api(page, 'getResolved', 'WC-05'); const cp = rp?.custom_parts?.[0]
  console.log('WC-05', cp ? `${cp.name} ${cp.dx}x${cp.dy}x${cp.dz} ${cp.orientation} mat ${cp.material_id?.slice(0, 8)}` : 'no part', JSON.stringify((rp?.errors ?? []).map(e => e.message)))
} finally { await browser.close() }
process.exit(0)
