// RHK6478 Buffet vents (Mark 2026-11-17, pre-nest):
//  BC-01 (18 gable between the bar fridges): 4 routed through-slots 8 x 300, vertical, 20 apart,
//    top ends 50 under the panel top, back slot 50 off the wall.
//  BC-02 (18 panel fridge 2 | drawers) + BC-03 left gable behind it: 2 x 220 (front-back) x 50 high cut-outs
//    for 3D-printed vents, 50 off the wall, lined up: top 780-830 AFF, bottom 210-260 AFF
//    (clear of the BC-03 runner screw lines at 166 / 412 / 659 AFF).
//  Apron notch on BC-01 / BC-02 / BC-07 moved from a drawn shape to a cut-out notch (17 x 40 top front),
//    because a drawn shape drops the part's cut-outs in the optimiser. Removing the drawn shape = the app's own
//    Overrides > Remove (every revision); these were made by automation (Buffet rev 1 / rev 4), not drawn by Mark.
// Run: node z_plan_automation/_tmp-6478-buf-vents.mjs go
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer-core'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) { console.log('ERR', t, r.error.message); process.exit(1) } return r.data }
const R = '0df13af4-8a6f-438f-a10d-6a9b4754aa97'
const cabs = chk('cabs', await sb.from('cabinet_instances').select('id,label,dz,part_cutouts').eq('room_id', R))
const by = l => cabs.find(c => c.label === l)
const cps = chk('cps', await sb.from('cabinet_custom_parts').select('id,cabinet_instance_id,name,part_cutouts').in('cabinet_instance_id', cabs.map(c => c.id)))
const panel = l => cps.find(p => p.cabinet_instance_id === by(l).id && p.name === 'Applied Panel')

// Side custom / gable frame: x 'left' = bottom, 'right' = top (w = height); y from front / back (d = depth).
const notch = { id: 'apron', kind: 'notch', shape: 'rect', w: 40, d: 17, radius: 0, edge: 'front', x: { from: 'right', off: 0 }, y: { from: 'front', off: 0 }, depth: null, source: 'user' }
const slot = i => ({ id: `vent${i + 1}`, kind: 'hole', shape: 'rect', w: 300, d: 8, radius: 4, x: { from: 'right', off: 50 }, y: { from: 'back', off: 50 + i * 28 }, depth: null, source: 'user' })
const vent = (id, from, off) => ({ id, kind: 'hole', shape: 'rect', w: 50, d: 220, radius: 0, x: { from, off }, y: { from: 'back', off: 50 }, depth: null, source: 'user' })

const plan = {
  'BC-01': [notch, ...[0, 1, 2, 3].map(slot)],
  'BC-02': [notch, vent('vent_top', 'right', 50), vent('vent_bot', 'left', 210)],
  'BC-07': [notch],
}
if (process.argv[2] !== 'go') { console.log(JSON.stringify(plan, null, 1)); process.exit(0) }

for (const [l, list] of Object.entries(plan)) {
  const p = panel(l)
  if ((p.part_cutouts ?? []).length) { console.log(l, 'already has cut-outs', JSON.stringify(p.part_cutouts)); process.exit(1) }
  chk(l, await sb.from('cabinet_custom_parts').update({ part_cutouts: list }).eq('id', p.id))
  const n = chk('so del', await sb.from('part_shape_overrides').delete().eq('cabinet_id', by(l).id).eq('part_key', `custom_${p.id}`).select('id'))
  console.log(l, list.map(c => c.id).join(' '), '| drawn shape revisions removed', n.length)
}
// BC-03 left gable (780 high, bottom at 100 AFF): same AFF as BC-02 -> top 680-730, bottom 110-160 from its bottom
const bc3 = by('BC-03')
chk('BC-03', await sb.from('cabinet_instances').update({ part_cutouts: { ...(bc3.part_cutouts ?? {}), case_left_side: [vent('vent_top', 'right', 50), vent('vent_bot', 'left', 110)] } }).eq('id', bc3.id))
console.log('BC-03 case_left_side vents')

// elevation notes: edit the TBC callout, add one for the cut-outs beside it
const anns = chk('ann', await sb.from('room_annotations').select('*').eq('room_id', R).eq('text', 'VENT SLOTS TBC'))
if (anns.length === 1) {
  const a = anns[0]
  chk('ann', await sb.from('room_annotations').update({ text: 'VENT SLOTS BC-01\n4 x 8 x 300 routed through' }).eq('id', a.id))
  const { id, created_at, updated_at, ...rest } = a
  chk('ann ins', await sb.from('room_annotations').insert({ ...rest, text: 'VENT CUT-OUTS BC-02 / BC-03\n2 x 220 x 50 - 3D printed vents by RHK', geom: { ...a.geom, at: { ...a.geom.at, x: 1060 } } }))
  console.log('elevation notes')
} else console.log('VENT SLOTS TBC note not found:', anns.length)

const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage()
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.dismiss())
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 240000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 240000 }); await sleep(4000)
  for (const l of ['BC-01', 'BC-02', 'BC-07', 'BC-03']) { await page.evaluate(([i, dz]) => window.__canvasApi.updateCabinet(i, { dz }), [by(l).id, by(l).dz]); await sleep(1500) }
  const iss = await page.evaluate(() => window.__canvasApi.getIssues())
  for (const c of iss) for (const e of [...c.errors, ...c.warnings]) console.log('ISSUE', c.label, e.code, e.message)
} finally { await browser.close() }
const after = chk('after', await sb.from('cabinet_custom_parts').select('cabinet_instance_id,outline,cutouts').in('id', ['BC-01', 'BC-02', 'BC-07'].map(l => panel(l).id)))
for (const p of after) console.log(cabs.find(c => c.id === p.cabinet_instance_id).label, 'outline pts', p.outline?.length, 'holes', p.cutouts?.length, JSON.stringify(p.cutouts?.[0]?.pts)?.slice(0, 160))
const g = chk('g', await sb.from('case_parts').select('cutouts').eq('cabinet_instance_id', bc3.id).eq('part_key', 'left_side').single())
console.log('BC-03 left_side holes', g.cutouts?.length, JSON.stringify(g.cutouts?.map(c => c.pts)).slice(0, 300))
process.exit(0)
