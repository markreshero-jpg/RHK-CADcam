// RHK6478 US Hallway Linen + US Broom pre-nest (Mark 2026-11-25):
//  - US Broom TC-02: gables 2676 / back 2659.5 over the 2415 Whiteboard sheet -> height split at 2130 (middle of the
//    bay between the top two adj shelves, tops 1959 / bottom 2301 - no fixed shelf), cut ends TAPED (new split
//    option tape_cut: "mark the edges on the split to be edged so there's a nice join").
//  - US Hallway Linen + US Broom handles -> "Push To Open – K-Push Tech" (as DS Linen / Laundry).
//  - Satin 18 doors 2574 / 2526 + side-on fillers 2574 / 2676: 2750 Satin sheets in Stage 3 (no change here).
// Run: node z_plan_automation/_tmp-6478-linen-prenest.mjs go
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer-core'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) { console.log('ERR', t, r.error.message); process.exit(1) } return r.data }
const KPUSH = 'd134dc33-f088-430c-8733-0d20b0672ec5', GENERIC = '9440a3f0-63db-4085-9042-1c728298b49a'
const BROOM = '02ce23c0-9b53-454f-8bcf-f0f81daa1dc8', HALL = 'b6377e60-bed3-4e5c-af80-7ea320db6ff5'
const rooms = chk('rooms', await sb.from('rooms').select('id,name,handle_schedule_id').in('id', [BROOM, HALL]))
const cabs = chk('cabs', await sb.from('cabinet_instances').select('id,label,room_id,dz,dy,split,hardware_overrides').in('room_id', [BROOM, HALL]))
for (const r of rooms) console.log(r.name, 'room schedule', r.handle_schedule_id)
for (const c of cabs) if (c.hardware_overrides?.handle_schedule_id) console.log(c.label, 'cab schedule', c.hardware_overrides.handle_schedule_id)
const tc02 = cabs.find(c => c.room_id === BROOM && c.label === 'TC-02')
console.log('TC-02', tc02.dy, JSON.stringify(tc02.split))
if (process.argv[2] !== 'go') { console.log('dry run - pass go'); process.exit(0) }
if (tc02.dy !== 2676 || tc02.split) { console.log('TC-02 changed since query'); process.exit(1) }

chk('split', await sb.from('cabinet_instances').update({ split: { at: [2130], tape_cut: true } }).eq('id', tc02.id))
for (const r of rooms) if (r.handle_schedule_id === GENERIC || !r.handle_schedule_id) chk('room hs', await sb.from('rooms').update({ handle_schedule_id: KPUSH }).eq('id', r.id))
for (const c of cabs) if (c.hardware_overrides?.handle_schedule_id === GENERIC)
  chk(c.label, await sb.from('cabinet_instances').update({ hardware_overrides: { ...c.hardware_overrides, handle_schedule_id: KPUSH } }).eq('id', c.id))
console.log('split + K-Push Tech written')

// re-resolve both rooms
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  for (const R of [BROOM, HALL]) {
    const page = await browser.newPage(); page.on('dialog', d => d.dismiss()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)))
    await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
    await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 240000 })
    await page.waitForFunction('!!window.__canvasApi', { timeout: 240000 }); await sleep(5000)
    for (const c of cabs.filter(c => c.room_id === R)) { await page.evaluate(([i, z]) => window.__canvasApi.updateCabinet(i, { dz: z }), [c.id, c.dz]); await sleep(1500) }
    await sleep(2000)
    const iss = await page.evaluate(() => window.__canvasApi.getIssues())
    for (const x of iss) for (const e of [...x.errors, ...x.warnings]) console.log('ISSUE', x.label, e.code, e.message)
    await page.close()
  }
} finally { await browser.close() }
const parts = chk('parts', await sb.from('case_parts').select('part_key,dx,dy,edge_band_top,edge_band_bottom').eq('cabinet_instance_id', tc02.id))
for (const p of parts) console.log(p.part_key, p.dx, 'x', p.dy, 'top', p.edge_band_top, 'bottom', p.edge_band_bottom)
process.exit(0)
