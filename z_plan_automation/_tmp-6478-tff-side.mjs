// RHK6478 (Mark 2026-11-18, DS Linen pre-nest): fillers = TFF side-on: a 70 x 18 strip standing between the cabinet and
// the wall, 18 edge to the front flush with the door face, only the front edge taped, Satin Board 18 White (2pac 25W).
//  - DS Linen + US Broom TC-01 / TC-03: TFFW face fillers (Whiteboard 16.5 at dz 18) -> TFF side-on, to the floor.
//  - US Hallway Linen TC-01 / TC-04: TFKW on the kick -> TFK side-on, still on the kick.
//  - Library TFF made side-on like BFK (2026-11-08) so new ones come in right.
//  - DS Linen handle schedule -> "Push To Open – K-Push Tech" (as the Laundry).
// Run: node z_plan_automation/_tmp-6478-tff-side.mjs go
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer-core'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) { console.log('ERR', t, r.error.message); process.exit(1) } return r.data }
const SATIN = 'b07a7e40-facd-4cdf-8856-60712e940b44', KPUSH = 'd134dc33-f088-430c-8733-0d20b0672ec5'
const TFF = '98c1e26b-43a1-4f6b-a768-3066d76d72d3', TFK = '48ab05ae-eca2-4058-bc41-a17ae81800e6'
const FRONT_Z = 'cab.d + t.door + 2 - 70'
const ROOMS = [
  { id: 'f1953ab4-a03b-4439-a777-d39476156f31', name: 'DS Linen', fillers: ['TC-01', 'TC-03'], def: TFF },
  { id: '02ce23c0-9b53-454f-8bcf-f0f81daa1dc8', name: 'US Broom', fillers: ['TC-01', 'TC-03'], def: TFF },
  { id: 'b6377e60-bed3-4e5c-af80-7ea320db6ff5', name: 'US Hallway Linen', fillers: ['TC-01', 'TC-04'], def: TFK },
]
if (process.argv[2] !== 'go') { console.log('dry run - pass go'); process.exit(0) }

// library TFF -> side-on (BFK pattern, no kick)
const lib = chk('lib', await sb.from('cabinet_definitions').select('custom_parts').eq('id', TFF).single())
if (lib.custom_parts[0].orientation !== 'side') {
  chk('lib upd', await sb.from('cabinet_definitions').update({
    default_dx: 18,
    description: 'Tall filler to the floor, material thickness: a 70 strip (planer takes it in one pass) standing side-on between the cabinet and the wall, front edge flush with the door face and the only part seen (front edge taped). Set the width to the board thickness (18 / 16.5). Height tracks cabinet height. Face filler in the door plane = TFFW.',
    custom_parts: [{ ...lib.custom_parts[0], dx: 70, orientation: 'side', edge_top: false, edge_bottom: false, edge_left: false, edge_right: true,
      expressions: { z: FRONT_Z, dx: '70', dy: 'cab.h', dz: 't.exposed' } }],
  }).eq('id', TFF))
  console.log('library TFF side-on')
}

const done = []
for (const r of ROOMS) {
  const cabs = chk('cabs', await sb.from('cabinet_instances').select('id,label,dz').eq('room_id', r.id))
  for (const l of r.fillers) {
    const c = cabs.find(x => x.label === l)
    const p = chk('p', await sb.from('cabinet_custom_parts').select('id,orientation,expressions').eq('cabinet_instance_id', c.id).eq('name', 'Filler').single())
    if (p.orientation === 'side') { console.log(r.name, l, 'already side-on'); continue }
    const ex = { ...(p.expressions.y ? { y: p.expressions.y } : {}), z: FRONT_Z, dx: '70', dy: p.expressions.dy, dz: '18' }
    chk('cp', await sb.from('cabinet_custom_parts').update({ orientation: 'side', x: 0, dx: 70, dz: 18, expressions: ex,
      edge_top: false, edge_bottom: false, edge_left: false, edge_right: true, material_id: SATIN, material_override_id: SATIN }).eq('id', p.id))
    chk('cab', await sb.from('cabinet_instances').update({ cabinet_definition_id: r.def,
      notes: `18 side-on filler (${r.def === TFF ? 'TFF, to the floor' : 'TFK, on the kick'}): 70 x 18 Satin Board 2pac 25W, front edge flush with the door, taped front only (Mark 2026-11-18)` }).eq('id', c.id))
    console.log(r.name, l, '->', r.def === TFF ? 'TFF' : 'TFK', JSON.stringify(ex))
  }
  if (r.name === 'DS Linen') { chk('hs', await sb.from('rooms').update({ handle_schedule_id: KPUSH }).eq('id', r.id)); console.log('DS Linen handles -> K-Push Tech') }
  done.push({ ...r, cabs })
}

// re-resolve every cabinet in the three rooms
const sleep = ms => new Promise(res => setTimeout(res, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  for (const r of done) {
    const page = await browser.newPage(); page.on('dialog', d => d.dismiss()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)))
    await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
    await page.goto(`http://localhost:3001/canvas/${r.id}`, { waitUntil: 'domcontentloaded', timeout: 240000 })
    await page.waitForFunction('!!window.__canvasApi', { timeout: 240000 }); await sleep(4000)
    for (const c of r.cabs) { await page.evaluate(([i, z]) => window.__canvasApi.updateCabinet(i, { dz: z }), [c.id, c.dz]); await sleep(1200) }
    const iss = await page.evaluate(() => window.__canvasApi.getIssues())
    console.log(r.name, 'errors', iss.reduce((n, x) => n + x.errors.length, 0))
    for (const x of iss) for (const e of [...x.errors, ...x.warnings]) console.log('  ISSUE', x.label, e.code, e.message)
    await page.close()
  }
} finally { await browser.close() }
for (const r of done) {
  const ids = r.fillers.map(l => r.cabs.find(c => c.label === l).id)
  const ps = chk('after', await sb.from('cabinet_custom_parts').select('orientation,x,y,z,dx,dy,dz,material_id,edge_right,edge_left,edge_top,edge_bottom').in('cabinet_instance_id', ids).eq('name', 'Filler'))
  for (const p of ps) console.log(r.name, JSON.stringify(p))
}
process.exit(0)
