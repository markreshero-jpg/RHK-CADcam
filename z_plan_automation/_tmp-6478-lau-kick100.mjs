// RHK6478 Laundry: kick 140 -> 100 (Mark 2026-11-03). Room TOEH override dropped (job TOEH 100); benches + talls to 2679 stay,
// so the cabinets on joined kicks drop 40 and grow 40; kick assemblies 100 high.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = 'fc12bc7d-53ee-46ee-a302-3411f5129bcc'
const room = chk('room', await sb.from('rooms').select('rule_overrides').eq('id', R).single())
const { TOEH, ...rest } = room.rule_overrides ?? {}
chk('room upd', await sb.from('rooms').update({ rule_overrides: rest }).eq('id', R))
const cabs = chk('cabs', await sb.from('cabinet_instances').select('id,label,pos_z,dy,is_kick_assembly').eq('room_id', R))
const changed = []
for (const c of cabs) {
  let patch = null
  if (c.is_kick_assembly && c.dy === 140) patch = { dy: 100 }
  else if (c.pos_z === 140) patch = { pos_z: 100, dy: c.dy + 40 }
  if (!patch) continue
  chk(c.label, await sb.from('cabinet_instances').update(patch).eq('id', c.id))
  changed.push([c.label, patch.dy]); console.log(c.label, JSON.stringify(patch))
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => { console.log('dialog', d.message()); d.dismiss() })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  const api = async (fn, ...a) => { const r = await Promise.race([page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]), sleep(60000).then(() => 'TIMEOUT')]); await sleep(1500); return r }
  // re-resolve everything: the kicked ones by their new dy, the rest (BC-04, TC-01, TC-02 kicks from TOEH) as they are
  const st = await api('getState')
  for (const c of st.cabinets) console.log(c.label, JSON.stringify(await api('updateCabinet', c.label, { dy: c.dy })))
  await sleep(3000)
  const iss = await api('getIssues')
  console.log('issues', JSON.stringify(iss.filter(i => i.errors.length || i.warnings.length)))
} finally { await browser.close() }
const after = chk('after', await sb.from('cabinet_instances').select('label,pos_z,dy,resolved_drawer_hw').eq('room_id', R).in('label', ['BC-01', 'BC-02', 'TC-07']))
for (const c of after) console.log(c.label, c.pos_z, c.dy, JSON.stringify((c.resolved_drawer_hw?.drawer_stacks ?? []).map(s => [s.face_zone_row, s.box_height, s.box_Y])))
