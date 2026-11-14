// RHK6468 Kitchen - island seating side (Mark 2026-11-14, Mark Ups for Ai + DWG 7.04 Elev 5):
//  - 300 overhang on the back: stone band face 300 in from the top's back edge (x 5888)
//  - drawers deepen 660 -> 691 so their backs sit at 5838; BC-03 panel hard on the drawer backs
//    (5838-5855), 33x33 mouldings 5855-5888 flush with the stone band face
//  - end legs 280 x 1080: 16.5 WB inner box to the top underside (inset 20 for the stone apron),
//    17 veneer wrap 620 high mitred all round, 300 stone apron above (benchtop)
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) throw new Error(t + ': ' + r.error.message); return r.data }
const R = '58bac32f-cdca-4a86-a1a4-c29af7ef9430'
const W8 = 'a644652d-160e-4307-a744-f3295a957419', W9 = 'ce5df504-30cd-46eb-90a2-e6dfddb1dcb6'
const V17 = '8afde358-4ab0-4a2e-bb3c-4bbc89de9c9e'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const cabs = async () => chk('cabs', await sb.from('cabinet_instances').select('*').eq('room_id', R))
const upd = async (label, patch) => { const c = all.find(x => x.label === label); chk(label, await sb.from('cabinet_instances').update(patch).eq('id', c.id)) }

let all = await cabs()
const DRY = process.argv.includes('--dry')
const touched = []
if (!all.some(c => c.notes?.startsWith('Leg veneer wrap'))) {
  // A. Walls + recess
  chk('w8', await sb.from('walls').update({ pos_x: 5838 }).eq('id', W8))
  chk('w9', await sb.from('walls').update({ pos_x: 5855 }).eq('id', W9))
  for (const c of all.filter(c => c.wall_id === W8)) { await upd(c.label, { pos_x: 5838 }); touched.push([c.label, { dz: 691 }]) }
  await upd('BC-03', { pos_x: 5855, notes: 'Island back panel, Veneer 17 American Oak, hard against the drawer cupboard backs, under the 300 stone band. 33x33 mouldings over it flush with the stone face' })
  touched.push(['BC-03', { dz: 17 }])
  for (const l of ['BC-27', 'BC-28', 'BC-29', 'BC-30']) { await upd(l, { pos_x: 5855 }); touched.push([l, { dz: 14 }]) }
  // B. Legs: inner WB boxes
  const box = { dx: 240, dy: 900, dz: 1040, has_face: false, material_overrides: {}, pos_x: 6168,
    notes: 'Leg inner box, 16.5 Whiteboard, to the top underside. Set in 20 all round for the stone apron (17 veneer below + 3 pack)' }
  await upd('BC-01', { ...box, pos_y: 1087 }); touched.push(['BC-01', { dz: 1040 }])
  await upd('BC-02', { ...box, pos_y: -2633 }); touched.push(['BC-02', { dz: 1040 }])
  // Veneer back faces (seating side), 17 V17 280 x 620
  const face = n => ({ dz: 17, pos_x: 6171, material_overrides: { exposed: V17 }, notes: `Leg veneer wrap - ${n} face, Veneer 17 American Oak 280 x 620, MITRE 45 both vertical edges` })
  await upd('BC-25', face('back')); touched.push(['BC-25', { dz: 17 }])
  await upd('BC-26', face('back')); touched.push(['BC-26', { dz: 17 }])
  // New: front faces (IBPF clones of BC-25) + side faces (BEPF clones of BC-27)
  const tpl25 = all.find(c => c.label === 'BC-25'), tpl27 = all.find(c => c.label === 'BC-27')
  const strip = ({ id, created_at, updated_at, label, ...r }) => r
  let n = 51
  const news = [
    { ...strip(tpl25), ...face('front'), pos_x: 5108, pos_y: 1107 },
    { ...strip(tpl25), ...face('front'), pos_x: 5108, pos_y: -2613 },
    ...[[1107, 'outer end'], [844, 'inner'], [-2613, 'inner'], [-2876, 'outer end']].map(([y, n2]) => ({ ...strip(tpl27), dx: 17, dz: 1061, pos_x: 5108, pos_y: y,
      material_overrides: { exposed: V17 }, notes: `Leg veneer wrap - ${n2} side, Veneer 17 American Oak 1080 x 620, MITRE 45 both vertical edges` })),
  ]
  for (const r of news) { const label = `BC-${n++}`; chk(label, await sb.from('cabinet_instances').insert({ ...r, label })); touched.push([label, { dz: r.dz }]) }
} else console.log('already applied - re-resolving only')
if (!touched.length) for (const c of (await cabs()).filter(c => [W8, W9].includes(c.wall_id))) touched.push([c.label, { dz: Number(c.dz) }])

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => { console.log('dialog:', d.message()); d.dismiss() })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 180000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  const api = async (fn, ...a) => { const r = await page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message); await sleep(1200); return r }
  for (const [l, p] of touched) console.log(l, JSON.stringify(await api('updateCabinet', l, p)))
  await sleep(3000)
} finally { await browser.close() }
