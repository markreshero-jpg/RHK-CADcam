// RHK6548 Hard Coffee fix 1 (2026-11-26):
//  Water Station BC-02: filler = a 590 x 35 front strip on top of the box (770 -> 805), flush with the box front.
//  Front Counter BC-03: door 505 high (top 150 below the carcass top, rubbish gap above), no handle.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const WS = '2bed2187-0b9c-4cf3-9e3e-5d29be5538a0', FC = '09786d9b-378e-42ed-9fc7-1aed4c7b21ab'

const f = chk('ws', await sb.from('cabinet_instances').select('id').eq('room_id', WS).eq('label', 'BC-02').single())
chk('cp', await sb.from('cabinet_custom_parts').update({ name: 'Filler 35 (to 805)', orientation: 'front', expressions: { x: '0', y: '0', z: 'cab.d - t.exposed', dx: 'cab.w', dy: 'cab.h', dz: 't.exposed' } }).eq('cabinet_instance_id', f.id))
chk('ws note', await sb.from('cabinet_instances').update({ notes: '35 filler over the water station to make 805 (front strip, flush with the box front)' }).eq('id', f.id))

const d = chk('fc', await sb.from('cabinet_instances').select('id,face_grid,rule_overrides').eq('room_id', FC).eq('label', 'BC-03').single())
const ro = { ...(d.rule_overrides ?? {}) }; delete ro.REVT
chk('fc upd', await sb.from('cabinet_instances').update({
  rule_overrides: ro,
  face_grid: {
    cols: [{ col_index: 0, width_locked: false }],
    rows: [{ row_index: 0, height: 505, height_locked: true }, { row_index: 1, height_locked: false }],
    zones: [{ col_index: 0, row_index: 0, face_type: 'door', hinge_side: 'right', handle_id: 'none' }, { col_index: 0, row_index: 1, face_type: 'open' }],
  },
}).eq('id', d.id))

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  for (const [R, label, patch] of [[WS, 'BC-02', { dz: 590 }], [FC, 'BC-03', { dz: 545 }]]) {
    const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
    page.on('dialog', dl => { console.log('DIALOG', dl.message()); dl.dismiss() })
    await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
    console.log(JSON.stringify(await page.evaluate((l, p) => window.__canvasApi.updateCabinet(l, p), label, patch))); await sleep(5000)
    for (const ci of await page.evaluate(() => window.__canvasApi.getIssues())) for (const e of [...ci.errors, ...ci.warnings]) console.log(' ', ci.label, e.code, e.message)
    await page.close()
  }
} finally { await browser.close() }
const ws = chk('q', await sb.from('cabinet_instances').select('pos_z,dy,has_toekick,cabinet_custom_parts(orientation,x,y,z,dx,dy,dz)').eq('id', f.id).single())
console.log('WS filler', JSON.stringify(ws))
const fz = chk('q2', await sb.from('face_zones').select('face_type,y,dy,handle').eq('cabinet_instance_id', d.id))
console.log('FC BC-03 faces', JSON.stringify(fz.map(z => ({ t: z.face_type, y: z.y, h: z.dy, handle: z.handle?.name }))))
process.exit(0)
