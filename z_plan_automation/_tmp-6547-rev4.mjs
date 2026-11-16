// RHK6547 Laundry rev 4 (Mark 2026-11-16): top back to 20 stone by others (WUP WC-03 removed, bases 782 -> 780,
// stone benchtop drawn 1500 x 620 at 880), floating shelf FLSHLF 1500 x 250 Elegant Oak, underside 1770.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '20601f2b-4fa7-49c1-bfff-36d1d53ed308'
const RS = 'ca01b6c2-c3cc-4084-8905-5c45577fb58b', STONE20 = 'fde097ae-d0e2-46dc-a549-9939ff7d8c28'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const cabs = async () => chk('cabs', await sb.from('cabinet_instances').select('id,label,pos_x,pos_z,dx,dy,dz,notes,float_shelf,cabinet_definition_id').eq('room_id', R))

// 1. 18 Oak top out
const top = (await cabs()).find(c => c.label === 'WC-03' && (c.notes ?? '').startsWith('Benchtop 18'))
if (top) {
  const d = await sb.from('cabinet_instances').delete().eq('id', top.id)
  if (d.error) { chk('cp del', await sb.from('cabinet_custom_parts').delete().eq('cabinet_instance_id', top.id)); chk('top del', await sb.from('cabinet_instances').delete().eq('id', top.id)) }
  console.log('removed WC-03 top')
}
// 2. bases + filler back to 780 carcass (joined kick: dy excludes the kick)
for (const l of ['BC-01', 'BC-02', 'BC-03']) { const c = (await cabs()).find(x => x.label === l); chk(l, await sb.from('cabinet_instances').update({ dy: 780, pos_z: 100 }).eq('id', c.id)) }
// 3. stone top by others, 580 + 18 door + 2 + 20 = 620 deep, against the TC-02 panel and the right wall
const W2 = chk('w', await sb.from('walls').select('id').eq('room_id', R).eq('name', 'Wall 2').single()).id
const pt = (x, y) => ({ x, y }), WALL = { wall: true }, EXP = { wall: false }
const segs = [[pt(690, 0), WALL], [pt(2190, 0), WALL], [pt(2190, 620), EXP], [pt(690, 620), WALL]]
if (!chk('bt', await sb.from('benchtop_instances').select('id').eq('room_id', R)).length)
  chk('bt ins', await sb.from('benchtop_instances').insert({ room_id: R, label: 'Laundry top', wall_id: W2, wall_side: 'face', height_mm: 880,
    benchtop_schedule_id: RS, benchtop_build_method_id: STONE20, notes: '20 stone offcut BY OTHERS (Georgie). 1500 x 620, panel to wall. Sink cut-out by others.',
    polygon: segs.map(s => s[0]), edge_tags: [], join_types: [], arc_segments: [], cutout_polygons: [], joins: [],
    segments: segs.map((s, i) => ({ type: 'line', p0: s[0], p1: segs[(i + 1) % segs.length][0], edge: s[1] })) }))

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('dialog', d => { console.log('dialog', d.message()); d.dismiss() })
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)))
const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
const api = async (fn, ...a) => { const r = await Promise.race([page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message), sleep(60000).then(() => 'TIMEOUT')]); await sleep(1500); return r }
try {
  await open()
  for (const l of ['BC-01', 'BC-02', 'BC-03', 'KICK 1']) console.log('re', l, JSON.stringify(await api('updateCabinet', l, { dz: l === 'BC-03' ? 560 : 580 })))
  // 4. floating shelf
  const FL = chk('d', await sb.from('cabinet_definitions').select('id').eq('name', 'FLSHLF').single()).id
  let sh = (await cabs()).find(c => c.cabinet_definition_id === FL)
  if (!sh) {
    console.log('place', JSON.stringify(await api('placeCabinet', { def: 'FLSHLF', wall: 'Wall 2', offset: 690, dx: 1500 })))
    sh = (await cabs()).find(c => c.cabinet_definition_id === FL)
    chk('sh', await sb.from('cabinet_instances').update({ notes: 'Floating shelf 1500 x 250, LX Elegant Oak double build (2 x 18 = 36), panel to wall, underside 1770 (in line with the overhead) - height TBC',
      float_shelf: { ...(sh.float_shelf ?? {}), build: 'double', seen_left: false, seen_right: false } }).eq('id', sh.id))
    await open()
  }
  console.log('shelf', JSON.stringify(await api('updateCabinet', sh.label, { dz: 250, pos_z: 1770 })))
  const st = await api('getState')
  for (const x of st.cabinets) console.log(x.label, 'off', x.offset, 'dx', x.dx, 'dy', x.dy, 'dz', x.dz)
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
for (const c of await cabs()) console.log(c.label, 'z', c.pos_z, 'dx', c.dx, 'dy', c.dy, 'dz', c.dz, JSON.stringify(c.float_shelf ?? null).slice(0, 120))
process.exit(0)
