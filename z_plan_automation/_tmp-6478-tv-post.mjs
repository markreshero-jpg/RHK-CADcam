// RHK6478 DS TV Unit post-draw: WEP front fillers, 33 tops, 30 BH under the 2720 ceiling, re-resolve; then the
// TV wall angled 7.89 deg (architecturals p30: 3736 along the wall, 3701 square, 512.8 run-out) and the unit
// moved to a straight front square to the room - left bays 400 deep at the left end, right cols 700.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = '46c02367-c556-489e-9907-67785eb2cd87', TEAK18 = 'd67d85b0-b12b-4b03-be3c-8bdbbf23cd11'
const SPAN = 3701, RUN = 512.8, FRONT = RUN + 400   // wall left end at y RUN, right end at y 0; front line y 912.8
const LEFT = ['BC-01', 'BC-02', 'BC-03', 'BC-04', 'WC-01', 'WC-02', 'WC-04', 'WC-05', 'WC-06']
const BHS = [{ offset: 0, dx: 1591, dz: 400, fwd: true }, { offset: 1591, dx: 1036, dz: 400, fwd: true }, { offset: 2627, dx: 1074, dz: 700, fwd: false }]
const sleep = ms => new Promise(r => setTimeout(r, ms))

const ids = async () => Object.fromEntries(chk('cabs', await sb.from('cabinet_instances').select('id,label,pos_x,pos_y,dx,assembly_class').eq('room_id', R)).map(c => [c.label, c]))
let C = await ids()
for (const l of ['WC-04', 'WC-08']) chk(l, await sb.from('cabinet_custom_parts').update({ orientation: 'front', expressions: { z: 'cab.d + 2', dx: 'cab.w', dy: 'cab.h', dz: 't.exposed' } }).eq('cabinet_instance_id', C[l].id).eq('name', 'Applied Panel'))

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 600000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => { console.log('dialog', d.message()); d.dismiss() })
  const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 180000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 180000 }); await sleep(4000) }
  const api = (fn, ...a) => Promise.race([page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]), sleep(90000).then(() => 'TIMEOUT')])
  await open()
  // 30 BH over the units, under the 2720 ceiling (wall_cabinet_top 2690).
  let st = await api('getState')
  if (!st.cabinets.some(c => c.dy <= 40 && /^WC/.test(c.label)))
    for (const b of BHS) { console.log(JSON.stringify(await api('placeCabinet', { def: 'BH', wall: 'Wall 2', offset: b.offset, dx: b.dx }))); await sleep(1200) }
  C = await ids()
  const bh = Object.values(C).filter(c => c.assembly_class === 'wall' && !LEFT.includes(c.label) && !['WC-03', 'WC-07', 'WC-08'].includes(c.label))
  for (const c of bh) {
    const b = BHS.find(x => Math.abs(x.offset - c.pos_x) < 1)
    chk(c.label, await sb.from('cabinet_instances').update({ notes: '30 bulkhead to the 2720 ceiling - scribe', bulkhead: { front: 'carcase', cleat: true, auto_h: true,
      left: { on: false, depth: b.dz, joint: 'mitre' }, right: { on: false, depth: b.dz, joint: 'mitre' }, bottom: { on: false, depth: b.dz, joint: 'mitre' } } }).eq('id', c.id))
    await api('updateCabinet', c.id, { dy: 30, dz: b.dz }); await sleep(1200)
    if (b.fwd) LEFT.push(c.label)
  }
  // WUP tops: 33 thick (dy is cosmetic on a flat under panel - match it).
  for (const l of ['WC-01', 'WC-02', 'WC-03']) { await api('updateCabinet', l, { dy: 33 }); await sleep(900) }
  st = await api('getState')
  for (const c of st.cabinets) { await api('updateCabinet', c.label, { dz: c.dz }); await sleep(700) }
  // Straight front square to the room (after the re-resolves, which place from the wall offset): every
  // cabinet's front on y = FRONT, then the TV wall angled from (0, RUN) to (SPAN, 0) with the returns on it.
  C = await ids()
  for (const c of Object.values(C)) {
    const front = LEFT.includes(c.label) ? 400 : 700   // overall depth incl fronts / filler faces
    chk(c.label, await sb.from('cabinet_instances').update({ pos_y: +(FRONT - front).toFixed(1) }).eq('id', c.id))
  }
  const W = Object.fromEntries(chk('walls', await sb.from('walls').select('id,name').eq('room_id', R)).map(w => [w.name, w.id]))
  const len = Math.hypot(SPAN, RUN), ang = (360 + Math.atan2(-RUN, SPAN) * 180 / Math.PI) % 360
  chk('w1', await sb.from('walls').update({ pos_x: 0, pos_y: RUN + 445, length: 445, angle: 270 }).eq('id', W['Wall 1']))
  chk('w2', await sb.from('walls').update({ pos_x: 0, pos_y: RUN, length: +len.toFixed(1), angle: +ang.toFixed(3) }).eq('id', W['Wall 2']))
  chk('w3', await sb.from('walls').update({ pos_x: SPAN, pos_y: 0, length: 1134, angle: 90 }).eq('id', W['Wall 3']))
  console.log('TV wall', len.toFixed(1), '@', ang.toFixed(3))
  await open()
  st = await api('getState')
  for (const c of st.cabinets) console.log(c.label, c.offset, c.dx, c.dy, c.dz)
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
const fin = chk('fin', await sb.from('cabinet_instances').select('label,pos_x,pos_y,pos_z,dx,dy,dz').eq('room_id', R).order('label'))
for (const c of fin) console.log(c.label, c.pos_x, c.pos_y, c.pos_z, `${c.dx}x${c.dy}x${c.dz}`)
