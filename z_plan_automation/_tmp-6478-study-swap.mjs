// RHK6478 Study (Mark 2026-11-04): Wall 3 overheads re-ordered to open | pair | open | pair | open (792 / 792 / 794 / 792 / 792).
// Old: WC-11 pair 30 | WC-12 open 822 | WC-13 pair 1614 | WC-14 open 2408 | WC-15 pair 3200, under panels WC-19 / 20 / 21.
// Moves the open boxes to 30 / 3200, the pairs to 822 / 2408, deletes the middle pair (WC-13) + its under panel (WC-20),
// clones an open box at 1614 (794) with its bottom LED route; under panels follow the pairs. Then relabels left -> right:
// open WC-11 / WC-13 / WC-15, pairs WC-12 / WC-14, under panels WC-19 (under WC-12) / WC-20 (under WC-14).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = 'a04663c7-1402-4344-be00-3ad4ce3aeae9'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const all = chk('cabs', await sb.from('cabinet_instances').select('*').eq('room_id', R))
const C = l => all.find(c => c.label === l)
if (!C('WC-13') || C('WC-13').cabinet_definition_id === C('WC-14').cabinet_definition_id) throw new Error('already swapped?')
const upd = async (id, patch) => chk('upd', await sb.from('cabinet_instances').update(patch).eq('id', id))
const delCab = async c => {
  chk('ops', await sb.from('part_operations').delete().eq('source_cabinet_id', c.id))
  chk('cp', await sb.from('cabinet_custom_parts').delete().eq('cabinet_instance_id', c.id))
  chk('del', await sb.from('cabinet_instances').delete().eq('id', c.id))
}
const ids = { open1: C('WC-12').id, pair1: C('WC-11').id, pair2: C('WC-15').id, open3: C('WC-14').id, up1: C('WC-19').id, up2: C('WC-21').id }

await delCab(C('WC-13')); await delCab(C('WC-20'))
// temp labels so the relabel can't collide
for (const [k, id] of Object.entries(ids)) await upd(id, { label: 'TMP-' + k })
// new middle open box: clone of the old WC-14 open box at 1614, 794 wide
const src = C('WC-14')
const { id: _i, created_at: _c, updated_at: _u, ...rest } = src
const mid = chk('ins', await sb.from('cabinet_instances').insert({ ...rest, label: 'WC-13', pos_x: 1614, dx: 794, label_offsets: null, notes: '# 23 open shelves 16.5 Sublime Teak, 2 fixed shelves, flush with the doors, LED route in the bottom' }).select('id'))[0]
const op = chk('op', await sb.from('part_operations').select('*').eq('source_cabinet_id', src.id))[0]
{ const { id: _o, created_at: _a, updated_at: _b, ...o } = op
  chk('op ins', await sb.from('part_operations').insert({ ...o, source_cabinet_id: mid.id, pos_y: (794 - 33) / 2, size_dy: 794 - 33 + 12 })) }
// positions + final labels (Wall 3 runs +x from x 0 at y 0, so pos_x = offset)
await upd(ids.open1, { pos_x: 30, label: 'WC-11' })
await upd(ids.pair1, { pos_x: 822, label: 'WC-12' })
await upd(ids.pair2, { pos_x: 2408, label: 'WC-14' })
await upd(ids.open3, { pos_x: 3200, label: 'WC-15' })
await upd(ids.up1, { pos_x: 822, label: 'WC-19' })
await upd(ids.up2, { pos_x: 2408, label: 'WC-20' })

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('dialog', d => { console.log('dialog', d.message()); d.dismiss() })
const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
try {
  await open()
  const now = chk('now', await sb.from('cabinet_instances').select('label,dz').eq('room_id', R).like('label', 'WC-%'))
  for (const l of ['WC-11', 'WC-12', 'WC-13', 'WC-14', 'WC-15', 'WC-19', 'WC-20', 'WC-17', 'WC-18']) {
    console.log(l, JSON.stringify(await page.evaluate(([l, dz]) => window.__canvasApi.updateCabinet(l, { dz }), [l, now.find(c => c.label === l).dz]))); await sleep(1500)
  }
  await open()
  const st = await page.evaluate(() => window.__canvasApi.getState())
  for (const c of st.cabinets.filter(c => c.wall === 'Wall 3' && /^WC/.test(c.label)).sort((a, b) => a.offset - b.offset)) console.log(c.label, c.offset, c.dx, c.dy, c.dz)
  for (const l of ['WC-11', 'WC-12', 'WC-13']) {
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    console.log(l, JSON.stringify([...rp.case_parts.map(p => [p.part_key, p.DY, p.Y]), ...rp.face_zones.map(z => ['face', z.DX, z.DY]), ...rp.internal_parts.map(p => [p.part_type, p.Y])]))
  }
  const issues = await page.evaluate(() => window.__canvasApi.getIssues()); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
