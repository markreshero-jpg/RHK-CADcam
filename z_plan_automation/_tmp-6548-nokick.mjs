// RHK6548 Hard Coffee rev 2 (Mark 2026-11-26): no kicks on any cabinet - kicks already on site.
// Email heights = carcass height (no kick): FC 755, BC 760, WS 770 (+35 filler = 805), BK tall 2320. All pos_z 0.
// Back Counter KICK 1 removed (unjoined). FC BC-03 door 605 (top still 150 below the 755 top).
// FC BC-04 fixed shelf size 381 (keeps 320 clear for the microwave). BK TC-01 hinges back to auto, re-checked.
// node _tmp-6548-nokick.mjs ["<TC-01 hinges csv>"]
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const ROOMS = { ws: '2bed2187-0b9c-4cf3-9e3e-5d29be5538a0', fc: '09786d9b-378e-42ed-9fc7-1aed4c7b21ab', bc: 'd3c04ade-ba07-4462-a40c-2a4bd1952d31', bk: 'e8b3c950-5be5-4e4a-9117-451395e9d2a1' }
const P = '31ed4cce-ffd3-4004-b8f1-d62f8dad6f5c'
const hinges = process.argv[2] ? process.argv[2].split(',').map(Number) : null
const get = async (R, label) => chk(label, await sb.from('cabinet_instances').select('*').eq('room_id', R).eq('label', label).single())

// Back Counter: drop the joined kick, carcasses back to 760 on the floor
const kick = (chk('k', await sb.from('cabinet_instances').select('id,kick_run_id').eq('room_id', ROOMS.bc).eq('is_kick_assembly', true)))
for (const label of ['BC-02', 'BC-03']) {
  const c = await get(ROOMS.bc, label)
  chk(label, await sb.from('cabinet_instances').update({ dy: 760, pos_z: 0, has_toekick: false, kick_run_id: null }).eq('id', c.id))
}
for (const k of kick) {
  chk('kick del', await sb.from('cabinet_instances').delete().eq('id', k.id))
  if (k.kick_run_id) { const r = await sb.from('kick_runs').delete().eq('id', k.kick_run_id); console.log('kick_run del', r.error?.message ?? 'ok') }
}
console.log('BC kicks removed', kick.length)

// Every other cabinet: no kick, on the floor (water station filler stays at 770)
for (const R of [ROOMS.ws, ROOMS.fc, ROOMS.bk]) chk('nokick', await sb.from('cabinet_instances').update({ has_toekick: false, pos_z: 0 }).eq('room_id', R).eq('has_toekick', true))

// FC BC-03 door 0-605 (150 below the 755 top)
{ const c = await get(ROOMS.fc, 'BC-03'); const fg = structuredClone(c.face_grid); fg.rows[0].height = 605
  chk('bc03', await sb.from('cabinet_instances').update({ face_grid: fg }).eq('id', c.id)) }
// FC BC-04 microwave shelf: 320 clear above
{ const c = await get(ROOMS.fc, 'BC-04'); const ig = structuredClone(c.internal_grid); ig.tree.children[0].size = 381
  chk('bc04', await sb.from('cabinet_instances').update({ internal_grid: ig }).eq('id', c.id)) }
// BK TC-01 hinges: auto unless a set is given
{ const c = await get(ROOMS.bk, 'TC-01'); const fg = structuredClone(c.face_grid)
  fg.zones = fg.zones.map(z => { const n = { ...z }; if (hinges) n.hinges = hinges; else delete n.hinges; return n })
  chk('tc01', await sb.from('cabinet_instances').update({ face_grid: fg }).eq('id', c.id)) }

// Job: kick off by default for anything added later
const pj = chk('pj', await sb.from('projects').select('notes').eq('id', P).single())
const line = 'REV 2 26/11: NO KICKS - kicks already on site; heights = carcass (FC 755, BC 760, WS 770 + 35, tall 2320).'
if (!(pj.notes ?? '').includes('NO KICKS')) chk('notes', await sb.from('projects').update({ notes: (pj.notes + '\n' + line).trim() }).eq('id', P))

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  for (const [k, R] of Object.entries(ROOMS)) {
    const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
    page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
    await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
    const iss = await page.evaluate(() => window.__canvasApi.getIssues())
    for (const ci of iss) { console.log(k, ci.label, ci.dims); for (const e of [...ci.errors, ...ci.warnings]) console.log('   ', e.code, e.message) }
    await page.close()
  }
} finally { await browser.close() }
const cabs = chk('q', await sb.from('cabinet_instances').select('label,room_id,dy,pos_z,has_toekick,kick_run_id').in('room_id', Object.values(ROOMS)))
console.log(JSON.stringify(cabs.map(c => [Object.keys(ROOMS).find(k => ROOMS[k] === c.room_id), c.label, c.dy, c.pos_z, c.has_toekick, !!c.kick_run_id])))
process.exit(0)
