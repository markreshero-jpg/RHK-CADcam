// RHK6595 (Mark 2026-11-08): BC-10 BEPF -> BFK like BC-14: one board flat against Wall 5, side-on, on the kick, out to
// the door face (front row: Winter Sky 16.5 doors -> t.door), front edge taped; carries its own kick.
// BC-14's board depth -> cab.d + 20 (BC-01's teak doors are 18; t.door gave the 16.5 class door).
// Edits rows in place (no deletes).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const ROOM = 'd113bd53-5e4a-4ded-9592-cc1f7bc0eecb'
const BC10 = '8a40cb3d-c37d-4898-b2e2-d62cb4101f2f', BC10_PART = 'f2f771b2-20a1-4462-844e-995d9f686fb0', BC14_PART = 'b1197731-3054-47e5-a3fd-a3118dd17f8a'
const BFK_DEF = 'dc9c76a6-d8b0-4b45-aed9-5b6d7d49111c', FILLER_LIB = 'ecd95bb2-900b-4341-ab42-d6b98412f2e0'
const log = (l, r) => console.log(l, r.error?.message ?? 'ok')
log('BC-10', await sb.from('cabinet_instances').update({ cabinet_definition_id: BFK_DEF, has_toekick: true, left_neighbour_type: 'wall', right_neighbour_type: 'cabinet' }).eq('id', BC10))
log('BC-10 part', await sb.from('cabinet_custom_parts').update({ name: 'Filler', part_library_id: FILLER_LIB, orientation: 'side', x: 0, z: 0,
  expressions: { y: 'cab.kick', dx: 'cab.d + t.door + 2', dy: 'cab.h - cab.kick', dz: 't.exposed' },
  edge_top: false, edge_bottom: false, edge_left: false, edge_right: true }).eq('id', BC10_PART))
log('BC-14 part', await sb.from('cabinet_custom_parts').update({ expressions: { y: 'cab.kick', dx: 'cab.d + 20', dy: 'cab.h - cab.kick', dz: 't.exposed' } }).eq('id', BC14_PART))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'domcontentloaded', timeout: 180000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 180000 }); await sleep(6000)
  for (const l of ['BC-10', 'BC-14']) {
    const c = (await page.evaluate(() => window.__canvasApi.getState())).cabinets.find(c => c.label === l)
    await page.evaluate(([l, dy]) => window.__canvasApi.updateCabinet(l, { dy }), [l, c.dy]); await sleep(3000)
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    console.log(l, 'dx', c.dx, 'custom', JSON.stringify((rp.custom_parts ?? []).map(p => [p.name, p.orientation, p.y, p.dx, p.dy, p.dz, p.material_id?.slice(0, 8)])),
      'kick', (rp.toekick_parts ?? []).length, 'warn', JSON.stringify(rp.warnings.map(w => w.message)), 'err', JSON.stringify(rp.errors.map(e => e.message)))
  }
} finally { await browser.close() }
