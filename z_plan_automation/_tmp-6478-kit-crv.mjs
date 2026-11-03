// RHK6478 Kitchen (Mark 2026-11-04): curved seating-side end. BCRVFIXP on the back of Wall 5 at the
// overhang (east) end, set in 280 (offset 280-780), 500 wide x 450 deep overall, R300, curve on the right
// (east, facing its front). BC-14 back panel then runs from it to the 60 waterfall (offset 780-3140) and
// moves to 432 off the cabinet backs so its face (2850) is flush with the curved face.
// Footprint from curvedEndFootprint({hand:'RH', R:300}, {w:500, d:450}) (npx tsx z_plan_automation/_tmp-fp.mts).
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = 'dd6c9440-6664-4e87-8ea9-4d88b7a9b1b6', W5 = 'c6531864-e0a3-45a8-a8f3-d5218464da86'
const footprint = JSON.parse(execSync('npx tsx z_plan_automation/_tmp-fp.mts', { encoding: 'utf8' }).trim())
const cabsNow = async () => chk('cabs', await sb.from('cabinet_instances').select('id,label,curved_end,wall_id').eq('room_id', R))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
  const api = async (fn, ...a) => { const r = await page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]); await sleep(2000); return r }
  await open()
  let crv = (await cabsNow()).find(c => c.curved_end && c.wall_id === W5)
  if (!crv) {
    const before = new Set((await cabsNow()).map(c => c.label))
    console.log(JSON.stringify(await api('placeCabinet', { def: 'BCRVFIXP', wall: W5, offset: 280, dx: 500, back: true })))
    await sleep(2000)
    crv = (await cabsNow()).find(c => !before.has(c.label))
  }
  console.log('curved', crv.label)
  chk('crv', await sb.from('cabinet_instances').update({
    dx: 500, dy: 900, dz: 450, footprint,
    curved_end: { ...crv.curved_end, hand: 'RH', R: 300, kick: false, inner: false },
    notes: 'Curved seating-side end, 450 overall x 500, R300, set in 280 from the island end (top overhangs it). Face board = substrate for the tiler (tiled by others); BC-14 back panel butts its fixing panel',
  }).eq('id', crv.id))
  const b14 = (await cabsNow()).find(c => c.label === 'BC-14')
  chk('bc14', await sb.from('cabinet_instances').update({ pos_x: 4430 - 780, pos_y: 2400 + 432, dx: 2360,
    notes: 'Island seating-side back panel, 18 raw substrate for the tiler (tiled by others), 432 off the cabinet backs (face flush with the curved end), from the curved end to the 60 waterfall' }).eq('id', b14.id))
  await open()
  console.log(JSON.stringify(await api('updateCabinet', crv.label, { dz: 450 })))
  console.log(JSON.stringify(await api('updateCabinet', 'BC-14', { dz: 18 })))
  const st = await api('getState')
  for (const c of st.cabinets.filter(c => c.wall === 'Wall 5')) console.log(c.label, c.offset, c.dx, c.dy, c.dz)
  const r = await api('getResolved', crv.label)
  console.log(crv.label, JSON.stringify((r?.case_parts ?? []).map(p => [p.part_key, p.DX, p.DY, p.DZ])), JSON.stringify(r?.errors), JSON.stringify(r?.warnings))
  console.log('issues', JSON.stringify((await api('getIssues')).filter(i => i.errors.length || i.warnings.length)))
} finally { await browser.close() }
