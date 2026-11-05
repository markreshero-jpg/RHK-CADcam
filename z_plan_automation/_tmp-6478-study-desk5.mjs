// RHK6478 Study (Mark 2026-11-05): revert desk4 - end caps back over the fascia ends (600 deep, edged top + front),
// front strips between the caps (16.5-1250 = 1233.5, 1250-3005.5 = 1755.5).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = 'a04663c7-1402-4344-be00-3ad4ce3aeae9'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const L = 3022, J = 1250, D = 600, T = 16.5
const cab = chk('c', await sb.from('cabinet_instances').select('id').eq('room_id', R).eq('label', 'BC-11'))[0]
const parts = chk('cp', await sb.from('cabinet_custom_parts').select('*').eq('cabinet_instance_id', cab.id))
const P = n => parts.find(p => p.name === n) ?? (() => { throw new Error('no part ' + n) })()
const up = async (n, patch) => chk('up ' + n, await sb.from('cabinet_custom_parts').update(patch).eq('id', P(n).id))
await up('Desk front strip 1/2', { x: T, dx: J - T })
await up('Desk front strip 2/2', { x: J, dx: L - J - T })
for (const n of ['Desk end cap (wall end)', 'Desk end cap (leg end)']) await up(n, { dx: D, edge_top: true, edge_left: true, edge_right: false })
chk('notes', await sb.from('cabinet_instances').update({ notes: 'DESK TOP assembly, 600 deep, glass top 760 (6mm glass parts 510 deep + 40x40 steel by RHK). All Sublime Teak 16.5 except the 50 x 10 cover strip (hand cut). Parts in 2 pieces, joint 1250 (mid BC-07). 16.5 end caps 600 x 62.5 at both ends (on BC-06 / BC-10), fascia + glass + steel stop at them. Front strip + back rail grain horizontal' }).eq('id', cab.id))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('dialog', d => d.dismiss())
const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
const api = async (fn, ...a) => { const r = await page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message); await sleep(1500); return r }
try {
  await open()
  console.log(JSON.stringify(await api('updateCabinet', 'BC-11', { dz: D })))
  await open()
  for (const p of chk('cp2', await sb.from('cabinet_custom_parts').select('name,x,z,dx,dy,edge_top,edge_left').eq('cabinet_instance_id', cab.id).or('name.like.Desk front%,name.like.Desk end%'))) console.log(JSON.stringify(p))
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
