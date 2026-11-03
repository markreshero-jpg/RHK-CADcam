// RHK6478 Laundry CAD: spec block (template order, colours only) + SITE NOTES box (Site notes layer) on the plan;
// elevation notes (Site notes layer, all but the floating shelf note), PTO tags, washer / dryer opening + PDR basin dims.
// Also moves TC-12 (open bay side panel) tight to Wall 6 (Mark 2026-11-02).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = 'fc12bc7d-53ee-46ee-a302-3411f5129bcc', SITE_LAYER = '2931a12f-666e-4f16-9840-8a8b4e09da50'
const walls = chk('walls', await sb.from('walls').select('id,name').eq('room_id', R))
const W = Object.fromEntries(walls.map(w => [w.name, w.id]))
const e2 = { room_id: R, view: 'elevation', wall_id: W['Wall 2'], wall_side: 'face' }
const e4 = { room_id: R, view: 'elevation', wall_id: W['Wall 4'], wall_side: 'face' }
const box = { size: 2.5, bgPad: 2, border: 'box', lineSpacing: 1.3, borderWeight: 0.35 }
const note = { size: 2.5, align: 'center' }
const inCab = (left, width) => ({ x: left + 30, w: (width - 60) / 20 })   // text box inside a cabinet (scale 1:20)
const spec = 'SPECIFICATIONS - {room}\n{job}\n\nBENCHTOP\n60mm YDL Bella Oro\n\nFRONTS + PANELS\nBases, tower + talls: 2 Pac - colour TBC\nOverheads + PDR vanity: Lx Sublime Teak Chalk\n\nCARCASS\n16mm Whiteboard\n\nOPEN SHELVES + FLOATING SHELF\nLx Sublime Teak Chalk'
const site = 'SITE NOTES\nTub wall 2656 between 833 returns\nTalls recess 1824 to Nib 1, PDR 980 x 502\nCeiling 2717 off slab - 20 floor allowance (TBC) = 2697, 18 shadowline\nPDR ceiling 2413 off slab TBC\nPDR tap 493 @ 1107H, waste 451 @ 650H\nSink: Dali Tanawha YH5444AR R15 540 x 440 U/M\nTap: V&B LF Vita pull-out 213880\n(both drawn as stand-in models)\nWasher ASKO W3086C + dryer T308HC stacked, 595 x 850 each'
const pto = (e, x, y) => ({ ...e, kind: 'text', geom: { at: { x, y } }, text: 'PTO', style: { size: 2.5 } })
const rows = [
  { room_id: R, view: 'plan', kind: 'text', geom: { at: { x: 4200, y: 0 }, width: 80 }, text: spec, style: { ...box, block: 'Spec block' } },
  { room_id: R, view: 'plan', kind: 'text', geom: { at: { x: 4200, y: 1300 }, width: 90 }, text: site, cad_layer_id: SITE_LAYER, style: box },
  // Wall 2
  { ...e2, kind: 'dim', geom: { p1: { x: 548, y: -418 }, p2: { x: 548, y: -2150 }, offset: 0, axis: 'y' }, style: {} },
  { ...e2, kind: 'dim', geom: { p1: { x: 48, y: -1700 }, p2: { x: 668, y: -1700 }, offset: 0, axis: 'x' }, style: {} },
  { ...e2, kind: 'text', geom: { at: { x: 78, y: -1500 }, width: 22 }, text: 'WASHER / DRYER OPENING\n620 x 1732 clear\nASKO washer +\ndryer stacked\n2 x 850 H', style: note },
  { ...e2, kind: 'text', geom: { at: { x: inCab(48, 620).x, y: -620 }, width: inCab(48, 620).w }, text: '18 TOP carries the washer', style: note },
  pto(e2, 208, -2600), pto(e2, 388, -2600),
  { ...e2, kind: 'text', geom: { at: { x: inCab(2141, 485).x, y: -2500 }, width: inCab(2141, 485).w }, text: 'OPEN SHELVES Chalk inside', style: note },
  { ...e2, kind: 'text', geom: { at: { x: 1300, y: -1250 }, width: 30 }, text: 'STONE SPLASHBACK', style: note },
  { ...e2, kind: 'text', geom: { at: { x: inCab(1674, 952).x, y: -600 }, width: inCab(1674, 952).w }, text: 'OPEN - 2pac side panel + back panel, floor to 690', style: note },
  // Wall 4
  pto(e4, 312, -1250), pto(e4, 492, -1250), pto(e4, 1200, -1250), pto(e4, 1380, -1250),
  pto(e4, 312, -2580), pto(e4, 492, -2580), pto(e4, 1200, -2580), pto(e4, 1380, -2580),
  { ...e4, kind: 'text', geom: { at: { x: inCab(18, 444).x, y: -1800 }, width: inCab(18, 444).w }, text: 'BROOMS / IRONING BOARD / STEAMER - 1850 clear, no shelves', style: note },
  { ...e4, kind: 'dim', geom: { p1: { x: 2204, y: -820 }, p2: { x: 2204, y: -960 }, offset: 0, axis: 'y' }, style: {} },
  { ...e4, kind: 'dim', geom: { p1: { x: 2960, y: 0 }, p2: { x: 2960, y: -960 }, offset: 0, axis: 'y' }, style: {} },
  { ...e4, kind: 'text', geom: { at: { x: 1950, y: -1250 }, width: 45 }, text: 'PDR BASIN centred on the vanity, finishes 960 (model TBC). Tap 1107 / waste 650 AFF (site)', style: note },
  { ...e4, kind: 'text', geom: { at: { x: inCab(1914, 980).x, y: -100 }, width: inCab(1914, 980).w }, text: 'FLOATING SHELF 33 x 500 x 980 wall to wall, LED strip at back', style: note },
]
// Elevation notes on the Site notes layer (not printed for the client) - all but the floating shelf note.
for (const r of rows) if (r.view === 'elevation' && r.kind === 'text' && !r.text.startsWith('FLOATING SHELF')) r.cad_layer_id = SITE_LAYER
chk('del', await sb.from('room_annotations').delete().eq('room_id', R))
chk('ins', await sb.from('room_annotations').insert(rows.map((r, i) => ({ ...r, sort_order: i + 1 }))))
console.log('annotations', rows.length)

const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  console.log(JSON.stringify(await page.evaluate(() => window.__canvasApi.updateCabinet('TC-12', { offset: 2638 })))); await sleep(1500)
  chk('TC-12', await sb.from('cabinet_instances').update({ notes: '18 2pac side panel of the open bay, tight to Wall 6, floor to 690' }).eq('room_id', R).eq('label', 'TC-12'))
  const st = await page.evaluate(() => window.__canvasApi.getState())
  for (const c of st.cabinets.filter(c => /TC-1[23]|BC-0[56]/.test(c.label))) console.log(c.label, c.offset, c.dx, c.dy, c.dz)
} finally { await browser.close() }
