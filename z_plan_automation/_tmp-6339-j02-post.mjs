// RHK6339 J02 (Mark 2026-11-11): room handle schedule (Custom Timber Pull 450), hinge 3 off the shelf holes,
// re-resolve; spec block + SITE NOTES (plan); 35 shadow line leaders + site-check note (Wall 2 elevation).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '67a27d07-1012-4537-a58d-5d3b50764221', HSCHED = '43f3c3c9-930d-4cc6-a49a-a7cb9bf30e90'
const GENERAL = '9768e64f-5133-4558-8375-b293405b976c', SITE = '82e5b80d-e0b7-4480-a64a-46af8e0b4d41'

console.log('room handles', (await sb.from('rooms').update({ handle_schedule_id: HSCHED }).eq('id', R)).error?.message ?? 'ok')
// Hinges along the door from its bottom (door bottom = cabinet Y 100): cups 200 / 791 / 1470 / 1974 / 2565 cabinet Y.
const { data: cab } = await sb.from('cabinet_instances').select('id,face_grid').eq('room_id', R).eq('label', 'TC-01').single()
const hinges = [100, 691.25, 1370, 1873.75, 2465]
const fg = { ...cab.face_grid, zones: cab.face_grid.zones.map(z => ({ ...z, hinges })) }
console.log('hinges', (await sb.from('cabinet_instances').update({ face_grid: fg }).eq('id', cab.id)).error?.message ?? 'ok')

const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  console.log(JSON.stringify(await page.evaluate(() => window.__canvasApi.updateCabinet('TC-01', { dz: 421 })))); await sleep(4000)
  for (const ci of await page.evaluate(() => window.__canvasApi.getIssues())) for (const e of [...ci.errors, ...ci.warnings]) console.log(' ', ci.label, e.code, e.message)
} finally { await browser.close() }

const ann = (await sb.from('room_annotations').select('id,text,sort_order').eq('room_id', R)).data
if (ann.some(a => a.text?.startsWith('SPECIFICATIONS'))) { console.log('CAD already there'); process.exit(0) }
const { data: wall2 } = await sb.from('walls').select('id').eq('room_id', R).eq('name', 'Wall 2').single()
let so = Math.max(0, ...ann.map(a => a.sort_order ?? 0))
const box = { src: 'markup-std', size: 2.5, bgPad: 2, border: 'box', lineSpacing: 1.3, borderWeight: 0.35 }
const spec = ['SPECIFICATIONS - {room}', '{job}', '',
  'FRONTS + PANELS', 'Veneer Blackbutt, vertical grain', 'Gables: Veneer Blackbutt (seen in the shadow lines)', 'Kick: Veneer Blackbutt', '',
  'HANDLES', 'Custom timber pull 450, solid timber (made in shop)', '',
  'CARCASS', 'PT Black Matt'].join('\n')
const site = ['SITE NOTES', 'NO SITE MEASURES - drawn as per plan.', 'ALL MEASUREMENTS TO BE SITE CHECKED:',
  'recess width (820 approx), depth (440), ceiling (2700 approx)'].join('\n')
// Elevation frame: x along Wall 2 (0-820), y = -height AFF. Shadow lines: x 0-35 / 785-820, top 2665-2700.
const rows = [
  { view: 'plan', cad_layer_id: GENERAL, kind: 'text', text: spec, geom: { at: { x: 1550, y: -400 }, width: 80 }, style: { ...box, block: 'Spec block' } },
  { view: 'plan', cad_layer_id: SITE, kind: 'text', text: site, geom: { at: { x: 1550, y: 900 }, width: 80 }, style: box },
  { view: 'elevation', wall_id: wall2.id, wall_side: 'face', cad_layer_id: GENERAL, kind: 'text', text: '35 SHADOW LINE',
    geom: { at: { x: -620, y: -1950 }, leader: [{ x: 17.5, y: -1900 }, { x: -200, y: -1900 }] }, style: { size: 2.5 } },
  { view: 'elevation', wall_id: wall2.id, wall_side: 'face', cad_layer_id: GENERAL, kind: 'text', text: '35 SHADOW LINE',
    geom: { at: { x: 1050, y: -1950 }, leader: [{ x: 802.5, y: -1900 }, { x: 1030, y: -1900 }] }, style: { size: 2.5 } },
  { view: 'elevation', wall_id: wall2.id, wall_side: 'face', cad_layer_id: GENERAL, kind: 'text', text: '35 SHADOW LINE',
    geom: { at: { x: 1050, y: -2850 }, leader: [{ x: 600, y: -2682.5 }, { x: 1030, y: -2800 }] }, style: { size: 2.5 } },
  { view: 'elevation', wall_id: wall2.id, wall_side: 'face', cad_layer_id: SITE, kind: 'text', text: 'ALL MEASUREMENTS\nTO BE SITE CHECKED',
    geom: { at: { x: 1050, y: -1200 } }, style: { size: 3.5, bold: true, border: 'box', bgPad: 1.5 } },
]
for (const row of rows) {
  const r = await sb.from('room_annotations').insert({ room_id: R, wall_id: null, ...row, sort_order: ++so }).select('id').single()
  console.log(row.view, row.text.split('\n')[0], r.error?.message ?? r.data.id)
}
