// RHK6478 Study (Mark 2026-11-05): second end cap on WC-21 at the window wall end (x 0, on the BC-06 end panel),
// same as the leg-end cap: 16.5 side part 600 x 62.5, grain horizontal, edged top + front. Piece-1 parts start at 16.5
// (1250 -> 1233.5), rebates follow; glass + steel stop at both caps.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = 'a04663c7-1402-4344-be00-3ad4ce3aeae9'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const J = 1250, D = 600, T = 16.5, LEN1 = J - T
const wc = chk('wc', await sb.from('cabinet_instances').select('id').eq('room_id', R).eq('label', 'WC-21'))[0]
const parts = chk('cp', await sb.from('cabinet_custom_parts').select('*').eq('cabinet_instance_id', wc.id))
const P = n => parts.find(p => p.name === n) ?? (() => { throw new Error('no part ' + n) })()
const up = async (p, patch) => chk('up ' + p.name, await sb.from('cabinet_custom_parts').update(patch).eq('id', p.id))
if (parts.some(p => p.name === 'Desk end cap (wall end)')) throw new Error('already done')

for (const n of ['Desk underside 1/2', 'Desk back strip 1/2', 'Desk cover strip (hand cut) 1/2']) await up(P(n), { x: T, dy: LEN1 })
for (const n of ['Desk front strip 1/2', 'Desk back rail 1/2']) await up(P(n), { x: T, dx: LEN1 })
await up(P('Desk end cap'), { name: 'Desk end cap (leg end)' })
{ const { id: _i, created_at: _c, updated_at: _u, ...base } = P('Desk end cap')
  chk('cap', await sb.from('cabinet_custom_parts').insert({ ...base, name: 'Desk end cap (wall end)', x: 0, sort_order: 11 })) }
for (const n of ['Desk underside 1/2', 'Desk back strip 1/2'])
  chk('op ' + n, await sb.from('part_operations').update({ pos_y: LEN1 / 2, size_dy: LEN1 + 12 }).eq('source_cabinet_id', wc.id).eq('source_part_key', 'custom_' + P(n).id))
chk('wc notes', await sb.from('cabinet_instances').update({ notes: 'DESK TOP assembly, 600 deep, glass top 760 (glass 510 deep + 40x40 steel by RHK, not modelled). All Sublime Teak 16.5 except the 50 x 10 cover strip (hand cut). Parts in 2 pieces, joint 1250 (mid BC-07). 16.5 end caps 600 x 62.5 at both ends (on BC-06 / BC-10), glass + steel stop at them. Front strip + back rail grain horizontal' }).eq('id', wc.id))
const g = chk('g', await sb.from('room_annotations').select('id,text').eq('id', 'c1b9fc26-3983-4b64-b0ee-6a528b7917e6'))[0]
chk('glass note', await sb.from('room_annotations').update({ text: g.text.replace('right piece stops at the 16.5 end cap', 'stops at the 16.5 end caps both ends').replace('stops at the end cap', 'stops at the end caps') }).eq('id', g.id))

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('dialog', d => { console.log('dialog', d.message()); d.dismiss() })
const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
const api = async (fn, ...a) => { const r = await Promise.race([page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message), sleep(60000).then(() => 'TIMEOUT')]); await sleep(1500); return r }
try {
  await open()
  console.log(JSON.stringify(await api('updateCabinet', 'WC-21', { dz: D })))
  await open()
  for (const p of chk('cp2', await sb.from('cabinet_custom_parts').select('name,orientation,x,y,z,dx,dy,dz').eq('cabinet_instance_id', wc.id).order('sort_order')))
    console.log(' ', p.name, p.orientation, p.x, p.y, p.z, p.dx, p.dy, p.dz)
  console.log(JSON.stringify(chk('ops', await sb.from('part_operations').select('source_part_key,pos_y,size_dy').eq('source_cabinet_id', wc.id))))
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
