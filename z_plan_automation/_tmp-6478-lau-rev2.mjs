// RHK6478 Laundry rev 2 (Mark 2026-11-02): undermount sink under the slab (z 675, drop 205); no BC-04 cupboard -
// open bay under BC-05 with a 2pac side panel (under BC-05's right gable) + back panel; BC-06 filler at drawer height only;
// BC-03 panel to the floor (seen in the open bay); panels back to carcass dz (the part adds door + 2).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = 'fc12bc7d-53ee-46ee-a302-3411f5129bcc'
const cabs = chk('cabs', await sb.from('cabinet_instances').select('id,label').eq('room_id', R))
const id = Object.fromEntries(cabs.map(c => [c.label, c.id]))
// sink hangs under the 20 slab: carcass top 880 - 205
chk('sink', await sb.from('room_fixtures').update({ z: 880 - 205, bench_drop: 205 }).eq('room_id', R).ilike('name', 'Dali%'))
if (id['BC-04']) chk('del BC-04', await sb.from('cabinet_instances').delete().eq('id', id['BC-04']))
chk('BC-03 part', await sb.from('cabinet_custom_parts').update({ y: 0, expressions: { y: '0', dx: 'cab.d + t.door + 2', dy: 'cab.h', dz: 't.exposed' } }).eq('cabinet_instance_id', id['BC-03']))
chk('BC-03', await sb.from('cabinet_instances').update({ notes: '18 2pac panel between the tub base and the open bay, to the floor (seen in the bay)' }).eq('id', id['BC-03']))
chk('BC-06', await sb.from('cabinet_instances').update({ has_toekick: false, pos_z: 690, dy: 190, notes: '30 filler to Wall 6 at the BC-05 drawer height (690-880)' }).eq('id', id['BC-06']))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => { console.log('dialog', d.message()); d.dismiss() })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  const api = (fn, ...a) => page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a])
  let st = await api('getState')
  const at = (off, dx) => st.cabinets.find(c => c.wall === 'Wall 2' && Math.abs(c.offset - off) < 1 && Math.abs(c.dx - dx) < 1 && /^TC/.test(c.label))
  if (!at(2626, 18)) console.log(JSON.stringify(await api('placeCabinet', { def: 'TEPF', wall: 'Wall 2', offset: 2626, dx: 18 })))
  if (!at(1674, 952)) console.log(JSON.stringify(await api('placeCabinet', { def: 'TEPF', wall: 'Wall 2', offset: 1674, dx: 952 })))
  await sleep(1500); st = await api('getState')
  const side = at(2626, 18), back = at(1674, 952)
  chk('side', await sb.from('cabinet_instances').update({ notes: '18 2pac side panel of the open bay, under BC-05 right gable, floor to 690 (12 to Wall 6 behind the BC-06 filler)' }).eq('id', side.id))
  chk('back', await sb.from('cabinet_instances').update({ notes: '18 2pac back panel of the open bay, floor to 690, against Wall 2' }).eq('id', back.id))
  chk('back part', await sb.from('cabinet_custom_parts').update({ orientation: 'front', z: 0, expressions: { dx: 'cab.w', dy: 'cab.h', dz: 't.exposed' } }).eq('cabinet_instance_id', back.id))
  await api('updateCabinet', side.id, { dy: 690, dz: 680 }); await sleep(1000)
  await api('updateCabinet', back.id, { dy: 690, dz: 680 }); await sleep(1000)
  for (const [l, dz] of [['TC-02', 680], ['TC-05', 680], ['BC-03', 680], ['TC-06', 480], ['BC-06', 680]]) { await api('updateCabinet', l, { dz }); await sleep(1000) }
  // fixture re-link (z changed) - nudge and back
  const f = (st.fixtures ?? []).find(x => /^Dali/.test(x.name))
  if (f) { await api('updateFixture', f.id, { x: f.x + 1 }); await sleep(800); await api('updateFixture', f.id, { x: f.x }); await sleep(800) }
  st = await api('getState')
  for (const c of st.cabinets.filter(c => c.wall === 'Wall 2' && /BC|TC/.test(c.label))) console.log(c.label, c.offset, c.dx, c.dy, c.dz)
  for (const x of st.fixtures ?? []) console.log('fixture', x.name, JSON.stringify({ z: x.z, cab: x.cabinet, clash: x.clash }))
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
