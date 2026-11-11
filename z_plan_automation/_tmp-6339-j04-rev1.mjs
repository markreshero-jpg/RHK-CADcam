// RHK6339 J04 rev 1 (Mark 2026-11-12):
//  - WC-04 A/C box sits on WC-03 (no shadow gap), no bottom, 700 deep; removable 17 panel in between the sides
//    (2 clearance each side) with an 80 gap top and bottom (top gap under the 33 top).
//  - WC-03 open shelf: top + right side extend out to the bench depth (700) - part size overrides (sd).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'b2252689-fdc9-4fd7-be9a-f29853f0391e'
const cab = async l => (await sb.from('cabinet_instances').select('id,rule_overrides,part_pos_overrides').eq('room_id', R).eq('label', l).single()).data

const wc4 = await cab('WC-04')
const rules4 = { ...wc4.rule_overrides, WALLZ: 2214, BOTTOM_TYPE: 'none', SCRBT: 0, REVSL: 35, REVSR: 35, REVT: 113, REVB: 80, FACINS: 1 }
console.log('WC-04 rules', (await sb.from('cabinet_instances').update({ rule_overrides: rules4, notes: 'A/C box on the open shelf, no bottom. Removable 17 veneer panel between the sides, 80 gap top + bottom. SIZE TBC' }).eq('id', wc4.id)).error?.message ?? 'ok')

const wc3 = await cab('WC-03')
const pov = { ...(wc3.part_pos_overrides ?? {}) }
for (const k of ['case_full_top', 'case_right_side']) pov[k] = { ox: 0, oy: 0, oz: 0, ...(pov[k] ?? {}), sd: 700 }
console.log('WC-03 overrides', (await sb.from('cabinet_instances').update({ part_pos_overrides: pov }).eq('id', wc3.id)).error?.message ?? 'ok')

const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  console.log(JSON.stringify(await page.evaluate(() => window.__canvasApi.updateCabinet('WC-04', { dz: 700 })))); await sleep(3000)
  console.log(JSON.stringify(await page.evaluate(() => window.__canvasApi.updateCabinet('WC-03', { dz: 510 })))); await sleep(3000)
  for (const ci of await page.evaluate(() => window.__canvasApi.getIssues())) for (const e of [...ci.errors, ...ci.warnings]) console.log(' ', ci.label, e.code, e.message)
} finally { await browser.close() }

// Shadow-gap note -> the 80 air gap under the panel (edit in place).
const { data: ann } = await sb.from('room_annotations').select('id,text').eq('room_id', R)
const sg = ann.find(a => a.text === '35 SHADOW GAP TBC')
if (sg) console.log('note', (await sb.from('room_annotations').update({ text: '80 GAP TOP + BOTTOM\n(REMOVABLE PANEL)', geom: { at: { x: 2450, y: -2330 }, leader: [{ x: 2000, y: -2254 }, { x: 2430, y: -2300 }] } }).eq('id', sg.id)).error?.message ?? 'ok')
const ac = ann.find(a => a.text?.startsWith('A/C BOX'))
if (ac) console.log('ac note', (await sb.from('room_annotations').update({ text: 'A/C BOX - REMOVABLE PANEL, EXHAUST SLOTS TBC. SIZE TBC', geom: { at: { x: 1137, y: -2420 }, width: 54.5 } }).eq('id', ac.id)).error?.message ?? 'ok')

for (const l of ['WC-03', 'WC-04']) {
  const c = await cab(l)
  for (const t of ['case_parts', 'face_zones']) {
    const { data } = await sb.from(t).select('*').eq('cabinet_instance_id', c.id)
    for (const p of data ?? []) console.log(l, t, p.part_key ?? p.face_type, p.dx, p.dy, p.dz, 'x', p.x ?? p.pos_x, 'y', p.y ?? p.pos_y, 'z', p.z ?? p.pos_z)
  }
}
