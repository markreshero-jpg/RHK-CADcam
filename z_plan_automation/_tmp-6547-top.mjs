// RHK6547 Laundry rev (Mark 2026-11-16): benchtop = a piece of 18 LX Elegant Oak instead of stone by others.
// Bases 780 -> 782 carcass (100 kick, 18 top -> 900 bench). Top = flat WUP 1500 x 605 (5 past the doors),
// pos_z 882, Elegant Oak (job exposed), butts the TEPF at 690 and the right wall.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '20601f2b-4fa7-49c1-bfff-36d1d53ed308'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const cabsNow = async () => chk('cabs', await sb.from('cabinet_instances').select('id,label,pos_x,pos_z,dx,dy,dz,rule_overrides,notes').eq('room_id', R))
const by = async l => (await cabsNow()).find(c => c.label === l)

// bases: carcass 782 (joined kick -> dy excludes the kick, pos_z stays 100)
for (const l of ['BC-01', 'BC-02']) { const c = await by(l); chk(l, await sb.from('cabinet_instances').update({ dy: 782, pos_z: 100 }).eq('id', c.id)) }

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('dialog', d => { console.log('dialog', d.message()); d.dismiss() })
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)))
const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
const api = async (fn, ...a) => { const r = await Promise.race([page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message), sleep(60000).then(() => 'TIMEOUT')]); await sleep(1500); return r }
try {
  await open()
  for (const l of ['BC-01', 'BC-02', 'KICK 1']) console.log('re', l, JSON.stringify(await api('updateCabinet', l, { dz: 580 })))
  let top = (await cabsNow()).find(c => (c.notes ?? '').startsWith('Benchtop 18'))
  if (!top) {
    const before = new Set((await cabsNow()).map(c => c.label))
    console.log('place', JSON.stringify(await api('placeCabinet', { def: 'WUP', wall: 'Wall 2', offset: 690, dx: 1500 })))
    const fresh = (await cabsNow()).filter(c => !before.has(c.label))
    if (fresh.length !== 1) throw new Error('place: ' + fresh.map(c => c.label))
    top = fresh[0]
    chk('top', await sb.from('cabinet_instances').update({ notes: 'Benchtop 18 LX Elegant Oak, 1500 x 605, front edge taped. Sink cut-out 450 x 450 drop-in, cut-out size TBC',
      rule_overrides: { ...(top.rule_overrides ?? {}), UNDER_PANEL: true } }).eq('id', top.id))
    const p = chk('cp', await sb.from('cabinet_custom_parts').select('*').eq('cabinet_instance_id', top.id))[0]
    console.log('part', JSON.stringify({ name: p.name, orientation: p.orientation, expressions: p.expressions, edges: [p.edge_top, p.edge_bottom, p.edge_left, p.edge_right] }))
    chk('part', await sb.from('cabinet_custom_parts').update({ name: 'Benchtop' }).eq('id', p.id))
    await open()
  }
  console.log('top', JSON.stringify(await api('updateCabinet', top.label, { dy: 18, dz: 605, pos_z: 882 })))
  const st = await api('getState')
  for (const x of st.cabinets) console.log(x.label, 'off', x.offset, 'dx', x.dx, 'dy', x.dy, 'dz', x.dz)
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
for (const c of await cabsNow()) console.log(c.label, 'z', c.pos_z, 'dy', c.dy, 'dz', c.dz)
process.exit(0)
