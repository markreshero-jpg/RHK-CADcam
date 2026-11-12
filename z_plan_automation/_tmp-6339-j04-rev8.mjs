// RHK6339 J04 rev 8 (Mark 2026-11-12):
//  - Shadowline back to 10 thick, 60 wide on the flat: custom part orientation 'flat' (dy = length 1107 across,
//    dx = 60 deep, dz = 10 thick), on WC-03's top (y 420), front edge set back 20 (z 620..680).
//  - Sink + tap (spec 17.x "Gym basin", Reece quote #3132738): Memo Hugo Compact Sink No Taphole SS 2402708
//    (340 x 440 x 220, bowl 300 x 400 R25) undermount, + Caroma Villa Sink Mixer Gunmetal Grey 6905.914A.
//    New catalogue rows (sink cloned from Abi Ohelu 380 U/M - its model stretches to 340; tap cloned from the
//    Abey Lucia gooseneck - STAND-IN model, real Villa model to come). Sink centred on BC-03, front 80 back
//    from the bench front; tap hole on the sink centre line 60 behind the sink.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'b2252689-fdc9-4fd7-be9a-f29853f0391e'
const chk = (t, r) => { if (r.error) throw new Error(t + ': ' + r.error.message); return r.data }
const cab = async l => chk(l, await sb.from('cabinet_instances').select('*').eq('room_id', R).eq('label', l).single())

// 1. Shadowline.
const wc3 = await cab('WC-03')
const strip = chk('strip', await sb.from('cabinet_custom_parts').select('id').eq('cabinet_instance_id', wc3.id).ilike('name', 'Shadowline strip%').single())
chk('strip upd', await sb.from('cabinet_custom_parts').update({ orientation: 'flat', name: 'Shadowline strip 10 x 60 flat (PT Black Matt, set back 20)',
  x: -14, y: 420, z: 700 - 20 - 60, dy: 1107, dx: 60, dz: 10, grain_across: false, expressions: {} }).eq('id', strip.id))

// 2. Catalogue rows.
const clone = async (srcId, row) => {
  let c = (await sb.from('fixture_catalog').select('*').eq('name', row.name).maybeSingle()).data
  if (c) return c
  const { id, created_at, updated_at, ...src } = chk('src', await sb.from('fixture_catalog').select('*').eq('id', srcId).single())
  return chk('cat ins', await sb.from('fixture_catalog').insert({ ...src, ...row }).select('*').single())
}
const SINK = await clone('ab1c3583-04c1-4105-aa8c-8cf2c54574a5', { name: 'Memo Hugo Compact Sink No Taphole SS (2402708)', brand: 'Memo', model_no: '2402708',
  width: 340, depth: 440, height: 220, bench_drop: 220, cutout_shape: 'rect', cutout_w: 300, cutout_d: 400, cutout_radius: 25, colour: '#c8c8c8',
  notes: 'Reece 2402708. Undermount / inset, 340 x 440 rim, bowl 300 x 400 R25, 220 deep, no taphole, basket waste. Cutout = bowl. Model = Abi Ohelu 380 stretched (stand-in).' })
const TAP = await clone('2d62af70-1116-49e5-97d7-9658d49d6af9', { name: 'Caroma Villa Sink Mixer Gunmetal Grey (6905.914A)', brand: 'Caroma', model_no: '6905.914A', colour: '#5a5c5e',
  notes: 'Caroma / Dorf Villa sink mixer, brushed gunmetal grey, spout ~230 reach x 232 high. MODEL IS A STAND-IN (Abey Lucia gooseneck) until the Villa model is imported.' })
console.log('catalogue', SINK.id, TAP.id)

// 3. Place (plan: wall 2 face at y 0, bench front at y 700).
const bc3 = await cab('BC-03')
const w2 = chk('w2', await sb.from('walls').select('id,name').eq('room_id', R).eq('name', 'Wall 2').single())
const cx = Number(bc3.pos_x) + Number(bc3.dx) / 2
const sinkY = 700 - 80 - SINK.depth
const holeY = sinkY - 60
const fcols = Object.keys(chk('fx tpl', await sb.from('room_fixtures').select('*').limit(1))[0])
const row = (c, extra) => { const r = { room_id: R, catalog_id: c.id, wall_id: w2.id, rotation: 0 }; for (const k of fcols) if (k in c && !['id', 'created_at', 'updated_at', 'room_id', 'wall_id', 'notes'].includes(k)) r[k] = c[k]; return { ...r, ...extra } }
chk('fx del', await sb.from('room_fixtures').delete().eq('room_id', R).in('category', ['sink', 'tap']))
const fx = chk('fx', await sb.from('room_fixtures').insert([
  row(SINK, { display_name: 'Memo Hugo Compact U/M sink', x: cx - SINK.width / 2, y: sinkY, z: 865 - SINK.height }),
  // hole sits at box centre + cutout_off (x -24.6, y -94.5): put it on the sink centre line, 60 behind the sink.
  row(TAP, { display_name: 'Caroma Villa sink mixer', x: cx + 24.6 - TAP.width / 2, y: holeY + 94.5 - TAP.depth / 2, z: 900 }),
]).select('id,name,x,y,z'))

const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  const api = async (fn, ...a) => { const r = await page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message); await sleep(1500); return r }
  for (const f of fx) await api('updateFixture', f.id, { x: Number(f.x), y: Number(f.y), z: Number(f.z) })
  console.log(JSON.stringify(await api('updateCabinet', 'WC-03', { dz: 510 })))
  const st = await api('getState')
  for (const f of st.fixtures ?? []) console.log('fixture', f.name, JSON.stringify({ x: f.x, y: f.y, z: f.z, cab: f.cabinet, clash: f.clash }))
  for (const ci of await api('getIssues')) for (const e of [...ci.errors, ...ci.warnings]) console.log('  !', ci.label, e.code, e.message)
} finally { await browser.close() }
console.log(chk('s', await sb.from('cabinet_custom_parts').select('name,orientation,x,y,z,dx,dy,dz').eq('id', strip.id).single()))
const { data: bt } = await sb.from('benchtop_instances').select('cutouts').eq('room_id', R).single()
console.log('top cutouts', JSON.stringify(bt?.cutouts ?? null))
