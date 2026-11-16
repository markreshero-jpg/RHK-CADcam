// RHK6468 Laundry rev 5 (Ryan 2026-11-16 via Mark): 2pac, likely Dulux White Pointer Quarter.
// Room style -> 2 Pac Flat 18mm, colour row added to the 2pac schedule, exposed (panels / fillers / BH / under panel)
// -> Satin Board 18 White. Panels 16.5 -> 18: run re-spaced, wine + stack spaces stay 650 / 650, top 5 past the BEPF,
// top 620 deep (580 + 18 + 2 + 20).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) throw new Error(t + ': ' + r.error.message); return r.data }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const R = '874fed25-8e1b-4bbf-b1ff-3090361b5dad', X0 = -2510, Y0 = -795
const PAC = 'bd2b9178-5b77-4a52-b7a1-cc3765ed4bb4', SCHED = 'bec37dbd-7fd1-44c7-acc1-38c74981e059', SATIN = 'b07a7e40-facd-4cdf-8856-60712e940b44'
// 1. colour row
let col = chk('c', await sb.from('door_schedule_materials').select('id').eq('schedule_id', SCHED).eq('colour_name', 'Dulux White Pointer Quarter'))[0]?.id
if (!col) {
  const tpl = chk('tpl', await sb.from('door_schedule_materials').select('*').eq('id', '747d491f-014f-4325-8cb3-f287cb635469').single())
  const { id, created_at, updated_at, ...rest } = tpl
  col = chk('ins', await sb.from('door_schedule_materials').insert({ ...rest, colour_name: 'Dulux White Pointer Quarter', colour_code: 'White Pointer Quarter', is_default: false, sort_order: (tpl.sort_order ?? 50) + 1 }).select('id').single()).id
}
console.log('colour', col)
// 2. room finish
chk('room', await sb.from('rooms').update({ door_style_override_id: PAC, base_door_style_id: PAC, wall_door_style_id: PAC, tall_door_style_id: PAC,
  base_door_colour_id: col, wall_door_colour_id: col, tall_door_colour_id: col }).eq('id', R))
chk('rm', await sb.from('room_materials').update({ material_id: SATIN }).eq('room_id', R).eq('material_role', 'exposed'))
// 3. geometry
const P = 18, S1 = 650 + P, S2 = S1 + 650 + P          // 668 stack start, 1336 run start
const BEP = 2866 - P, WEP = 2871 - P                   // 2848, 2853
const B = (BEP - S2) / 2, O = (WEP - S2) / 2           // 756, 758.5
const TUBX = X0 + S2 + B / 2 - 272.5, TAPX = TUBX + 242.55
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' }); page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 240000 }); await page.waitForFunction(() => window.__canvasApi, { timeout: 240000 }); await sleep(4000)
  const api = async (m, ...a) => { const r = await page.evaluate((m, a) => window.__canvasApi[m](...a), m, a); await sleep(1800); console.log(m, JSON.stringify(a), JSON.stringify(r)); return r }
  for (const [l, u] of [['BC-03', { offset: BEP, dx: P }], ['BC-02', { offset: S2 + B, dx: B }], ['BC-01', { offset: S2, dx: B }], ['KICK 1', { offset: S2, dx: 2 * B }],
    ['WC-04', { offset: WEP, dx: P }], ['WC-03', { offset: S2 + O, dx: O }], ['WC-02', { offset: S2, dx: O }], ['WC-07', { offset: S2, dx: 2 * O }],
    ['WC-06', { offset: S2, dx: 2871 - S2 }], ['WC-05', { dx: S2 }],
    ['TC-02', { offset: S2 - P, dx: P }], ['WC-09', { offset: S1, dx: 650 }], ['TC-01', { offset: 650, dx: P }],
    ['WC-01', { dz: 580 }], ['WC-08', { dz: 580 }]]) await api('updateCabinet', l, u)
  for (const [n, x] of [['Tub 45L', TUBX], ['Mixer TBC', TAPX]]) {
    const f = chk(n, await sb.from('room_fixtures').select('id,y').eq('room_id', R).eq('display_name', n).single())
    await api('updateFixture', f.id, { x, y: Number(f.y) })
  }
  const issues = await page.evaluate(() => window.__canvasApi.getIssues()); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
  const st = await page.evaluate(() => window.__canvasApi.getState())
  console.log(JSON.stringify(st.cabinets.map(c => `${c.label}@${c.offset}:${c.dx}`)))
  console.log(JSON.stringify(st.fixtures.map(f => ({ n: f.name, x: f.x, cab: f.cabinet, clash: f.clash }))))
} finally { await browser.close() }
// 4. top: from the run start, 620 deep
const bt = chk('bt', await sb.from('benchtop_instances').select('id,polygon,segments').eq('room_id', R).single())
const fx = p => ({ x: p.x === -1177 ? X0 + S2 : p.x, y: p.y === Y0 + 618.5 ? Y0 + 620 : p.y })
chk('bt up', await sb.from('benchtop_instances').update({ polygon: bt.polygon.map(fx), segments: bt.segments.map(s => ({ ...s, p0: fx(s.p0), p1: fx(s.p1) })),
  notes: `20 stone - colour TBC. ${2871 - S2} x 620, against the tall panel, 5 overhang past the BEPF at the D2 door. 45L undermount tub (Abi Seba stretched 545 x 480) + gooseneck mixer.` }).eq('id', bt.id))
console.log('top', JSON.stringify(fx({ x: -1177, y: Y0 + 618.5 })))
// 5. spec block text
const spec = chk('spec', await sb.from('room_annotations').select('id,text').eq('room_id', R).eq('style->>block', 'Spec block'))
for (const s of spec) chk('spec up', await sb.from('room_annotations').update({ text: s.text.replace('16mm Polytec Classic White Matt', '18mm 2pac - Dulux White Pointer Quarter (TBC)') }).eq('id', s.id))
console.log('spec rows', spec.length)
