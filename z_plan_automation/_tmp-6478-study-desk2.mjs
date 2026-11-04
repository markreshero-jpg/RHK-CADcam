// RHK6478 Study (Mark 2026-11-05): desk top WC-21 -
//  - end cap at the leg end: 16.5 side part 600 deep x 62.5 high, sitting on the shaped leg BC-10 (same plane, 3005.5-3022),
//    grain horizontal, edged top + front. Piece-2 parts + rebates stop at it (1772 -> 1755.5); glass + steel stop at it too.
//  - front strips + back rails grain horizontal (grain_across).
//  - cover strip over the steel 100 -> 50 wide (533.5-583.5 off the wall, up to the front strip).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = 'a04663c7-1402-4344-be00-3ad4ce3aeae9'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const L = 3022, J = 1250, D = 600, T = 16.5, LEN2 = L - J - T, COVER = 50
const wc = chk('wc', await sb.from('cabinet_instances').select('id').eq('room_id', R).eq('label', 'WC-21'))[0]
const parts = chk('cp', await sb.from('cabinet_custom_parts').select('*').eq('cabinet_instance_id', wc.id))
const P = n => parts.find(p => p.name === n) ?? (() => { throw new Error('no part ' + n) })()
const up = async (p, patch) => chk('up ' + p.name, await sb.from('cabinet_custom_parts').update(patch).eq('id', p.id))

// 1. piece 2 stops at the end cap (flat: dy = length, front: dx = length)
for (const n of ['Desk underside 2/2', 'Desk back strip 2/2', 'Desk cover strip (hand cut) 2/2']) await up(P(n), { dy: LEN2 })
for (const n of ['Desk front strip 2/2', 'Desk back rail 2/2']) await up(P(n), { dx: LEN2 })
// 2. fascia + back rail grain horizontal
for (const n of ['Desk front strip 1/2', 'Desk front strip 2/2', 'Desk back rail 1/2', 'Desk back rail 2/2']) await up(P(n), { grain_across: true })
// 3. cover strip 50 wide, up to the front strip
for (const n of ['Desk cover strip (hand cut) 1/2', 'Desk cover strip (hand cut) 2/2']) await up(P(n), { dx: COVER, z: D - T - COVER })
// 4. end cap (side: dx = depth, dy = height, dz = thickness)
if (!parts.some(p => p.name === 'Desk end cap')) {
  const { id: _i, created_at: _c, updated_at: _u, ...base } = P('Desk underside 2/2')
  chk('cap', await sb.from('cabinet_custom_parts').insert({ ...base, name: 'Desk end cap', orientation: 'side', x: L - T, y: 0, z: 0, dx: D, dy: 62.5, dz: T,
    grain_across: true, edge_top: true, edge_left: true, edge_bottom: false, edge_right: false, no_cnc: false, sort_order: 10 }))
}
// 5. piece-2 rebates follow the new length
for (const n of ['Desk underside 2/2', 'Desk back strip 2/2']) {
  chk('op ' + n, await sb.from('part_operations').update({ pos_y: LEN2 / 2, size_dy: LEN2 + 12 }).eq('source_cabinet_id', wc.id).eq('source_part_key', 'custom_' + P(n).id))
}
// 6. notes
chk('wc notes', await sb.from('cabinet_instances').update({ notes: 'DESK TOP assembly, 600 deep, glass top 760 (glass 510 deep + 40x40 steel by RHK, not modelled). All Sublime Teak 16.5 except the 50 x 10 cover strip (hand cut). Parts in 2 pieces, joint 1250 (mid BC-07). 16.5 end cap 600 x 62.5 at the leg end (on BC-10), glass + steel stop at it. Front strip + back rail grain horizontal' }).eq('id', wc.id))
chk('glass note', await sb.from('room_annotations').update({ text: '6mm TOUGHENED GLASS DESK TOP 510 deep (supplied by RHK), back edge in a 10 x 6 rebate in the back strip, 2 pieces, joint over BC-08 left gable, right piece stops at the 16.5 end cap. Top 760 AFF. 40x40 STEEL behind the front strip (by RHK), rebated 10 into the underside, stops at the end cap, 50 x 10 cover strip over it (hand cut). ~40 display space under the glass. 100 x 16.5 back strip at the wall' }).eq('id', 'c1b9fc26-3983-4b64-b0ee-6a528b7917e6'))

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('dialog', d => { console.log('dialog', d.message()); d.dismiss() })
const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
const api = async (fn, ...a) => { const r = await Promise.race([page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message), sleep(60000).then(() => 'TIMEOUT')]); await sleep(1500); return r }
try {
  await open()
  console.log(JSON.stringify(await api('updateCabinet', 'WC-21', { dz: D })))
  await open()
  for (const p of chk('cp2', await sb.from('cabinet_custom_parts').select('name,orientation,x,y,z,dx,dy,dz,grain_across,edge_top,edge_bottom,edge_left,edge_right').eq('cabinet_instance_id', wc.id).order('sort_order')))
    console.log(' ', p.name, p.orientation, p.x, p.y, p.z, p.dx, p.dy, p.dz, p.grain_across ? 'GRAIN ACROSS' : '', ['top', 'bottom', 'left', 'right'].filter(k => p['edge_' + k]).join('+'))
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
