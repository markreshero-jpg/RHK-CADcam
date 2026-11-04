// RHK6478 Laundry (Mark 2026-11-05):
// 1. Wall 2 kicks joined into one: TC-01 (30 filler) | TC-02 18 panel | BC-01 tower | TC-05 18 panel | BC-02 tub bench = 832-2488.
//    The 18 panels sit on the kick (has_toekick false) so joinKicks saw a gap; they're made kick members first (pos_z 0,
//    dy incl. kick), and the join puts them back on the kick (pos_z 100) as run members.
// 2. Wall 4 PDR basin not in the elevation: rotation 0 / link_rot 180 faced it into the wall. Now rotation 180 / link_rot 0,
//    same centre (252, 2028) -> back-left (432, 2208).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const R = 'fc12bc7d-53ee-46ee-a302-3411f5129bcc', BASIN = '7cc82318-6668-4d40-8082-bc7277263758'

chk('basin', await sb.from('room_fixtures').update({ rotation: 180, x: 432, y: 2208, link_rot: 0 }).eq('id', BASIN))
const pan = chk('pan', await sb.from('cabinet_instances').select('id,label,pos_z,dy,has_toekick,kick_run_id').eq('room_id', R).in('label', ['TC-02', 'TC-05']))
for (const p of pan) {
  if (p.kick_run_id) continue
  if (p.pos_z !== 100) throw new Error(p.label + ' pos_z ' + p.pos_z)
  chk('pan upd', await sb.from('cabinet_instances').update({ has_toekick: true, pos_z: 0, dy: p.dy + 100 }).eq('id', p.id))
}

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('dialog', d => { console.log('dialog', d.message()); d.dismiss() })
const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
const api = async (fn, ...a) => { const r = await Promise.race([page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message), sleep(60000).then(() => 'TIMEOUT')]); await sleep(1500); return r }
try {
  await open()
  console.log(JSON.stringify(await api('joinKicks', 'BC-01')))
  await open()
  const st = await api('getState')
  for (const c of st.cabinets.filter(c => ['TC-01', 'TC-02', 'BC-01', 'TC-05', 'BC-02', 'BC-03'].includes(c.label) || /^KICK/.test(c.label)))
    console.log(c.label, JSON.stringify({ off: c.offset, dx: c.dx, dy: c.dy, dz: c.dz, pos_z: c.pos_z, run: c.kick_run_id?.slice(0, 6) }))
  const fx = (st.fixtures ?? []).find(f => f.id === BASIN); console.log('basin', JSON.stringify(fx))
  for (const k of st.cabinets.filter(c => /^KICK/.test(c.label))) {
    const rp = await api('getResolved', k.label)
    for (const p of rp.toekick_parts ?? rp.toekick ?? []) if (p.part_key === 'kick_front_face') console.log(' ', k.label, 'face', p.x, p.z, p.dx, p.dy)
  }
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
