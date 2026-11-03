// RHK6563 Study: room finishes (Lx ABS Grain 18 Tasmanian Oak, Momo Dallas 128), shelf backs upright, join tower kick, re-resolve + report.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '443a1553-14c4-4b8d-bd1f-2e5890b827e7'
const STYLE = '28d45d84-3270-40ad-ae78-7df696bcc388', COL = 'b5a28e84-24a8-42e1-b197-c088264d6588', MAT18 = '6cd37f1b-67ce-4005-b5c3-c2715b739e07', HS = '463951c9-9391-47a6-858d-0437ee9382b2'
const mode = process.argv[2] ?? 'check'
if (mode === 'setup') {
  chk('room', await sb.from('rooms').update({ base_door_style_id: STYLE, base_door_colour_id: COL, wall_door_style_id: STYLE, wall_door_colour_id: COL, tall_door_style_id: STYLE, tall_door_colour_id: COL, handle_schedule_id: HS }).eq('id', R))
  chk('rm del', await sb.from('room_materials').delete().eq('room_id', R).eq('material_role', 'exposed'))
  chk('rm', await sb.from('room_materials').insert(['base', 'wall', 'tall'].map(c => ({ room_id: R, assembly_class: c, material_role: 'exposed', material_id: MAT18 }))))
  chk('tk del', await sb.from('room_toekick_materials').delete().eq('room_id', R).eq('part_role', 'face'))
  chk('tk', await sb.from('room_toekick_materials').insert({ room_id: R, part_role: 'face', material_id: MAT18 }))
  const backs = chk('backs', await sb.from('cabinet_instances').select('id,label').eq('room_id', R).in('label', ['WC-07', 'WC-10']))
  for (const b of backs) chk('cp ' + b.label, await sb.from('cabinet_custom_parts').update({ orientation: 'front', name: 'Shelf Box Back', z: 0, expressions: { dx: 'cab.w', dy: 'cab.h', dz: 't.exposed' } }).eq('cabinet_instance_id', b.id))
  for (const [l, n] of [['WC-05', 'Shelf Box Bottom'], ['WC-06', 'Shelf Box Top'], ['WC-08', 'Shelf Box Bottom'], ['WC-09', 'Shelf Box Top'], ['WC-03', 'Desk Top'], ['WC-04', 'Desk Top']]) {
    const c = chk(l, await sb.from('cabinet_instances').select('id').eq('room_id', R).eq('label', l).single())
    chk('n ' + l, await sb.from('cabinet_custom_parts').update({ name: n }).eq('cabinet_instance_id', c.id))
  }
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  if (mode === 'setup') { console.log('join', JSON.stringify(await page.evaluate(() => window.__canvasApi.joinKicks('BC-01')))); await sleep(3000) }
  let st = await page.evaluate(() => window.__canvasApi.getState())
  for (const c of st.cabinets) { await page.evaluate(([l, dz]) => window.__canvasApi.updateCabinet(l, { dz }), [c.label, c.dz]); await sleep(1000) }
  st = await page.evaluate(() => window.__canvasApi.getState())
  for (const c of st.cabinets) console.log(c.label, c.wall, c.offset, c.dx, c.dy, c.dz, 'pos_z', c.pos_z)
  for (const l of ['BC-01', 'WC-01', 'TC-01', 'TC-02', 'BC-02', 'WC-03', 'WC-07']) {
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    if (!rp) { console.log(l, 'no resolved'); continue }
    console.log(l, JSON.stringify([...rp.case_parts.map(p => [p.part_key, p.DX, p.DY, p.DZ, p.material_id?.slice(0, 8)]), ...rp.custom_parts.map(p => [p.name, p.DX ?? p.dx, p.DY ?? p.dy, p.DZ ?? p.dz, p.material_id?.slice(0, 8)])]))
    if (rp.face_zones?.length) console.log(l, 'zones', JSON.stringify(rp.face_zones.map(z => [z.face_type, z.Y, z.DX, z.DY, z.material_id?.slice(0, 8), z.handle?.grip_kind, z.hinges])))
  }
  const issues = await page.evaluate(() => window.__canvasApi.getIssues()); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
