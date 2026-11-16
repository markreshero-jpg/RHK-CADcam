// RHK6468 Laundry rev 4 (Mark 2026-11-16): Vintec wine fridge 595 x 610 x 1850 against the left wall in a
// 650 space with the cupboard over (WC-08 filler + WC-01 stay). Then TEPF | stack 650 + new W2D over | new TEPF |
// tub B2D + B2D shrunk to 758.25 each | BEPF at 2849.5 (5 top overhang kept). Overheads 2 x 760.75 to the WEP.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) throw new Error(t + ': ' + r.error.message); return r.data }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const R = '874fed25-8e1b-4bbf-b1ff-3090361b5dad'
const X0 = -2510
const W2 = chk('w2', await sb.from('walls').select('id').eq('room_id', R).eq('name', 'Wall 2').single()).id
const cab = async l => chk(l, await sb.from('cabinet_instances').select('*').eq('room_id', R).eq('label', l).single())
const S = 1333                       // run start after wine 650 + TEPF + stack 650 + TEPF
const B = (2849.5 - S) / 2           // 758.25
const O = (2854.5 - S) / 2           // 760.75
const TUBX = X0 + S + B / 2 - 272.5, TAPX = TUBX + 242.55
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' }); page.on('dialog', d => d.dismiss())
  const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 240000 }); await page.waitForFunction(() => window.__canvasApi, { timeout: 240000 }); await sleep(4000) }
  const api = async (m, ...a) => { const r = await page.evaluate((m, a) => window.__canvasApi[m](...a), m, a); await sleep(2000); console.log(m, JSON.stringify(a[0]), JSON.stringify(r)); return r }
  await open()
  const st0 = await api('getState')
  if (!st0.cabinets.some(c => c.label === 'TC-02')) {
    // right side first, moving right / shrinking
    await api('updateCabinet', 'BC-02', { offset: S + B, dx: B })
    await api('updateCabinet', 'BC-01', { offset: S, dx: B })
    await api('updateCabinet', 'KICK 1', { offset: S, dx: 2 * B })
    await api('updateCabinet', 'WC-03', { offset: S + O, dx: O })
    await api('updateCabinet', 'WC-02', { offset: S, dx: O })
    await api('updateCabinet', 'WC-07', { offset: S, dx: 2 * O })
    await api('updateCabinet', 'WC-06', { offset: S, dx: 2871 - S })
    await api('updateCabinet', 'WC-05', { dx: S })
    // stack cupboard + its TEPF
    let before = new Set((await api('getState')).cabinets.map(c => c.id))
    await api('placeCabinet', { def: 'W2D', wall: W2, offset: 666.5, dx: 650 })
    const w = (await api('getState')).cabinets.find(c => !before.has(c.id))
    const wc01 = await cab('WC-01')
    chk('w2d', await sb.from('cabinet_instances').update({ dy: 673, dz: 580, face_grid: wc01.face_grid, notes: 'Cupboard over the WASHER / DRYER STACK SPACE 650W x 1900H (underside 1900, top 2573)' }).eq('id', w.id))
    before = new Set((await api('getState')).cabinets.map(c => c.id))
    await api('placeCabinet', { def: 'TEPF', wall: W2, offset: 1316.5, dx: 16.5 })
    const t = (await api('getState')).cabinets.find(c => !before.has(c.id))
    chk('tepf', await sb.from('cabinet_instances').update({ dy: 2573, dz: 580, notes: 'Tall end panel between the stack space and the laundry run, floor to 2573' }).eq('id', t.id))
    chk('wc01', await sb.from('cabinet_instances').update({ notes: 'Cupboard over the WINE FRIDGE SPACE 650W x 1900H (Vintec 595 x 610 x 1850; underside 1900, top 2573)' }).eq('id', wc01.id))
    chk('tc01', await sb.from('cabinet_instances').update({ notes: 'Tall end panel between the wine fridge and the stack space, floor to 2573' }).eq('room_id', R).eq('label', 'TC-01'))
    chk('bc01', await sb.from('cabinet_instances').update({ notes: 'TUB - 45L undermount (Abi Seba stretched 545 x 480). Rails on edge' }).eq('room_id', R).eq('label', 'BC-01'))
    await open()
    await api('updateCabinet', w.label, { dy: 673, dz: 580, offset: 666.5 })
    await api('updateCabinet', t.label, { dy: 2573, dz: 580, offset: 1316.5 })
  }
  // tub + tap re-centred on BC-01
  const st = await api('getState')
  for (const [n, x] of [['Tub 45L', TUBX], ['Mixer TBC', TAPX]]) {
    const f = (await sb.from('room_fixtures').select('id,y').eq('room_id', R).eq('display_name', n).single()).data
    await api('updateFixture', f.id, { x, y: Number(f.y) })
  }
  const issues = await page.evaluate(() => window.__canvasApi.getIssues()); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
  const s2 = await page.evaluate(() => window.__canvasApi.getState())
  console.log(JSON.stringify(s2.cabinets.map(c => `${c.label}@${c.offset}:${c.dx}x${c.dy}x${c.dz}`)))
  console.log(JSON.stringify((s2.fixtures ?? []).map(f => ({ name: f.name, x: f.x, cabinet: f.cabinet, clash: f.clash }))))
} finally { await browser.close() }
// top starts at the new run
const RS = X0 + S
const bt = chk('bt', await sb.from('benchtop_instances').select('id,polygon,segments').eq('room_id', R).single())
const fx = p => (p.x === -1843.5 ? { ...p, x: RS } : p)
chk('bt up', await sb.from('benchtop_instances').update({ polygon: bt.polygon.map(fx), segments: bt.segments.map(s => ({ ...s, p0: fx(s.p0), p1: fx(s.p1) })),
  notes: `20 stone - colour TBC. ${2871 - S} x 618.5, against the tall panel, 5 overhang past the BEPF at the D2 door. 45L undermount tub (Abi Seba stretched 545 x 480) + gooseneck mixer.` }).eq('id', bt.id))
console.log('top from', RS)
