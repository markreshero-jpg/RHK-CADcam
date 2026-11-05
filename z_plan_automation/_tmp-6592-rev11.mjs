// RHK6592 rev 11 (Mark 2026-11-05), butlers void corner kick (option B) + D/W cleat:
// - KICK 1 (west run) carries on south into the void to the south-wall kick line: offset 502 (face back at y 1788),
//   dx 1788. Its face front is at x 520, same 40 setback as the south-wall kick (front at y 1770).
// - BC-04 (58 filler) kick face hidden; a 98 x 110 x 18 kick face custom part on BC-04 runs from KICK 1's face
//   (x 520) to BC-05 (x 618), front at y 1770, butting KICK 1 in the inside corner.
// - wall cleat 70 x 16.5 Whiteboard E1L in the D/W space (x 636-1246).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (m, r) => { if (r.error) throw new Error(m + ': ' + r.error.message); console.log('ok', m); return r.data }
const BUT = '1c00eb19-09c1-41b8-8c7c-a6441ee0263d', KFACE = 'b07a7e40-facd-4cdf-8856-60712e940b44', WB = 'd081b2a1-38a8-472c-a415-f179699a1347'
const cab = async l => chk('get ' + l, await sb.from('cabinet_instances').select('*').eq('room_id', BUT).eq('label', l).single())

const bc04 = await cab('BC-04')
chk('BC-04 hide kick face', await sb.from('cabinet_instances').update({
  hidden_parts: [...new Set([...(bc04.hidden_parts ?? []), 'tk_kick_front_face_0'])],
  notes: 'Void corner return filler 58 (40 face + 18). Its kick face is replaced by the 98 kick return face (custom part) from KICK 1 to BC-05.',
}).eq('id', bc04.id))
const cps = chk('BC-04 parts', await sb.from('cabinet_custom_parts').select('*').eq('cabinet_instance_id', bc04.id))
if (!cps.some(p => p.name === 'Kick return face')) {
  const { id: _i, created_at: _c, updated_at: _u, ...base } = cps[0]
  chk('kick return face', await sb.from('cabinet_custom_parts').insert({ ...base, name: 'Kick return face', orientation: 'front',
    x: 0, y: 0, z: 502, dx: 98, dy: 110, dz: 18, expressions: {}, material_id: KFACE, material_override_id: KFACE,
    edge_top: false, edge_bottom: false, edge_left: false, edge_right: false, no_cnc: false, sort_order: 99 }))
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage()
  page.on('dialog', d => d.dismiss())
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  const open = async () => { await page.goto(`http://localhost:3001/canvas/${BUT}`, { waitUntil: 'networkidle2', timeout: 90000 }); await page.waitForFunction('!!window.__canvasApi'); await sleep(1500) }
  const api = async (fn, ...args) => { const r = await page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, args]); console.log(fn, JSON.stringify(args), JSON.stringify(r)?.slice(0, 160)); await sleep(700); return r }
  await open()
  const st = await page.evaluate(() => window.__canvasApi.getState())
  const w4 = st.walls.find(w => w.name === 'Wall 4').id
  const before = new Set(st.cabinets.map(c => c.label))
  await api('updateCabinet', 'KICK 1', { offset: 502, dx: 1788 })
  await api('updateCabinet', 'BC-04', { dy: 880 })
  await api('placeCabinet', { def: 'WUP', wall: w4, offset: 2669, dx: 610 })
  const [c] = (await page.evaluate(() => window.__canvasApi.getState())).cabinets.filter(c => !before.has(c.label))
  const row = await cab(c.label)
  chk(c.label + ' rules', await sb.from('cabinet_instances').update({ rule_overrides: { ...(row.rule_overrides ?? {}), UNDER_PANEL: true },
    notes: 'Wall cleat 70 x 16.5 Whiteboard E1L (bottom edge taped) across the D/W space, fixed to the wall under the top' }).eq('id', row.id))
  const parts = chk('parts', await sb.from('cabinet_custom_parts').select('*').eq('cabinet_instance_id', row.id))
  const { id: _i, created_at: _c, updated_at: _u, ...base } = parts[0]
  chk('cleat part', await sb.from('cabinet_custom_parts').insert({ ...base, name: 'Wall cleat', orientation: 'front', x: 0, y: 0, z: 0, dx: 610, dy: 70, dz: 16.5,
    expressions: {}, material_id: WB, material_override_id: WB, edge_top: false, edge_bottom: true, edge_left: false, edge_right: false, no_cnc: false, sort_order: 0 }))
  for (const p of parts) chk('old part', await sb.from('cabinet_custom_parts').delete().eq('id', p.id))
  await open()
  await api('updateCabinet', c.label, { dx: 610, dy: 70, dz: 16.5, pos_z: 810 })
  await open()
  const s = await page.evaluate(() => window.__canvasApi.getState())
  console.log(JSON.stringify(s.cabinets.filter(x => /^(KICK 1|BC-0[145]|WC)/.test(x.label)).map(x => [x.label, x.offset, x.dx, x.dy, x.dz])))
  for (const l of ['KICK 1', 'BC-04']) {
    const r = await page.evaluate(async l => { const x = await window.__canvasApi.getResolved(l); return { tk: (x?.toekick_parts ?? []).map(q => [q.part_key, q.X, q.Z, q.DY]), cp: (x?.custom_parts ?? []).map(q => [q.name ?? q.part_key, q.X, q.Y, q.Z, q.DX, q.DY, q.DZ]) } }, l)
    console.log(l, JSON.stringify(r))
  }
  for (const x of await page.evaluate(() => window.__canvasApi.getIssues())) if (x.errors.length || x.warnings.length) console.log(x.label, JSON.stringify([...x.errors, ...x.warnings].map(e => e.code + ' ' + e.message)))
  console.log('done')
} finally { await browser.close() }
