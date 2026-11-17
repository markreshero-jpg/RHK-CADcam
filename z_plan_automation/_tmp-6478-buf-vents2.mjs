// RHK6478 Buffet (Mark 2026-11-17): BC-02 + BC-03 left gable vent cut-outs turned upright: 50 (front-back) x 220 high,
// behind the BC-03 runners (26.5-76.5 off the wall: back panel face 26.5, runners start 77), lined up through both:
// top 610-830 AFF (50 under the top), bottom 210-430 AFF.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer-core'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) { console.log('ERR', t, r.error.message); process.exit(1) } return r.data }
const R = '0df13af4-8a6f-438f-a10d-6a9b4754aa97', BC02 = '8f893ccd-6d57-4c18-a286-b04b55a30d97', BC03 = 'c84381ca-3e73-4e9c-93a1-191a3a3888d3'
const vent = (id, from, off) => ({ id, kind: 'hole', shape: 'rect', w: 220, d: 50, radius: 0, x: { from, off }, y: { from: 'back', off: 26.5 }, depth: null, source: 'user' })
const p = chk('p', await sb.from('cabinet_custom_parts').select('id,part_cutouts').eq('cabinet_instance_id', BC02).eq('name', 'Applied Panel').single())
const keep = (p.part_cutouts ?? []).filter(c => !c.id.startsWith('vent'))
chk('BC-02', await sb.from('cabinet_custom_parts').update({ part_cutouts: [...keep, vent('vent_top', 'right', 50), vent('vent_bot', 'left', 210)] }).eq('id', p.id))
const c = chk('c', await sb.from('cabinet_instances').select('part_cutouts,dz').eq('id', BC03).single())
chk('BC-03', await sb.from('cabinet_instances').update({ part_cutouts: { ...c.part_cutouts, case_left_side: [vent('vent_top', 'right', 50), vent('vent_bot', 'left', 110)] } }).eq('id', BC03))
const a = chk('a', await sb.from('room_annotations').select('id,text').eq('room_id', R).like('text', 'VENT CUT-OUTS%'))
for (const n of a) chk('ann', await sb.from('room_annotations').update({ text: 'VENT CUT-OUTS BC-02 / BC-03\n2 x 50 x 220 high - 3D printed vents by RHK' }).eq('id', n.id))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); page.on('dialog', d => d.dismiss())
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 240000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 240000 }); await sleep(4000)
  for (const [id, dz] of [[BC02, 575], [BC03, c.dz]]) { await page.evaluate(([i, z]) => window.__canvasApi.updateCabinet(i, { dz: z }), [id, dz]); await sleep(1500) }
  const iss = await page.evaluate(() => window.__canvasApi.getIssues())
  for (const x of iss) for (const e of [...x.errors, ...x.warnings]) console.log('ISSUE', x.label, e.code, e.message)
} finally { await browser.close() }
const a2 = chk('a2', await sb.from('cabinet_custom_parts').select('cutouts').eq('id', p.id).single())
const g = chk('g', await sb.from('case_parts').select('cutouts').eq('cabinet_instance_id', BC03).eq('part_key', 'left_side').single())
console.log('BC-02 (880 high)', JSON.stringify(a2.cutouts.map(c => c.pts)))
console.log('BC-03 (780 high, +100 AFF)', JSON.stringify(g.cutouts.map(c => c.pts)))
process.exit(0)
