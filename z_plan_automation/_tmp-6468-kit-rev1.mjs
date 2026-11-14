// RHK6468 Kitchen rev 1 (Mark 2026-11-14):
//  - butler's overheads 2pac "Colour TBC"; each lift-up split into 2 stacked cupboards (W1LU, Aventos HK-top + TIP-ON)
//    upper 1995-2370 hangs off the top line, lower 1620-1995 via WALLZ 1620
//  - corner open shelves deleted -> voids under the under panel
//  - BC-05 bin 300, sink BC-07 takes the rest (937)
//  - under panels (2pac, set back 20) under the lift-ups, west one runs through both corners
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) throw new Error(t + ': ' + r.error.message); return r.data }
const R = '58bac32f-cdca-4a86-a1a4-c29af7ef9430'
const W1LU = '562d869c-d8f4-4882-85c1-85f7015351dd'
const PAC_STYLE = 'bd2b9178-5b77-4a52-b7a1-cc3765ed4bb4', PAC_TBC = '827dfe38-7cb7-4c02-aa87-6916b09876f5', SATIN = 'b07a7e40-facd-4cdf-8856-60712e940b44'
const LIFTS = ['WC-02', 'WC-03', 'WC-07', 'WC-08', 'WC-11', 'WC-12']
const flap = { cols: [{ col_index: 0, width_locked: false }], rows: [{ row_index: 0, height_locked: false }],
  zones: [{ col_index: 0, row_index: 0, face_type: 'door', hinge_side: 'top', hinges: [], door_style_id: PAC_STYLE, door_colour_id: PAC_TBC }] }
const liftSet = (note, extraRules = {}) => ({ cabinet_definition_id: W1LU, face_grid: flap, material_overrides: { exposed: SATIN },
  internal_grid: { tree: { type: 'open', fittings: [] } }, notes: note })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const cabs = async () => chk('cabs', await sb.from('cabinet_instances').select('id,label,wall_id,dx,dy,dz,rule_overrides,cabinet_definition_id,notes').eq('room_id', R))

// 1. Corner open shelves out.
const before = await cabs()
const opn = before.filter(c => ['WC-06', 'WC-09'].includes(c.label))
if (opn.length) chk('del opn', await sb.from('cabinet_instances').delete().in('id', opn.map(c => c.id)))
// 2. Existing lift-ups -> upper W1LU 1995-2370.
for (const c of before.filter(c => LIFTS.includes(c.label))) {
  if (c.cabinet_definition_id === W1LU) continue
  chk(c.label, await sb.from('cabinet_instances').update(liftSet('UPPER 1995-2370: 2pac Colour TBC lift-up flap, Blum Aventos HK-top + TIP-ON (push to open)')).eq('id', c.id))
}

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => { console.log('dialog:', d.message()); d.dismiss() })
  const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 180000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
  const api = async (fn, ...a) => { const r = await page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message); await sleep(1200); return r }
  await open()
  // Bin / sink.
  console.log(JSON.stringify(await api('updateCabinet', 'BC-05', { dx: 300 })))
  console.log(JSON.stringify(await api('updateCabinet', 'BC-06', { offset: 333 })))
  console.log(JSON.stringify(await api('updateCabinet', 'BC-07', { offset: 366, dx: 937 })))
  for (const l of LIFTS) console.log(l, JSON.stringify(await api('updateCabinet', l, { dy: 375 })))
  await open()
  // Lowers.
  const st = await api('getState')
  const lowers = []
  for (const l of LIFTS) {
    const up = st.cabinets.find(c => c.label === l)
    const r = await api('placeCabinet', { def: 'W1LU', wall: up.wall, offset: up.offset, dx: up.dx })
    console.log('lower for', l, JSON.stringify(r))
    lowers.push({ up, r })
  }
  await open()
  const st2 = await api('getState')
  const known = new Set(before.map(c => c.label))
  const fresh = st2.cabinets.filter(c => !known.has(c.label) && c.dx > 900)
  console.log('fresh', fresh.map(c => `${c.label} ${c.wall} ${c.offset} ${c.dx}`).join(' | '))
  const now = await cabs()
  const lowerLabels = []
  for (const { up } of lowers) {
    const f = fresh.find(c => c.wall === up.wall && Math.abs(c.dx - up.dx) <= 1 && !lowerLabels.includes(c.label))
    if (!f) { console.log('NO LOWER for', up.label); continue }
    const row = now.find(c => c.label === f.label)
    chk(f.label, await sb.from('cabinet_instances').update({ ...liftSet(`LOWER 1620-1995 (under ${up.label}): 2pac Colour TBC lift-up flap, Blum Aventos HK-top + TIP-ON (push to open). Under panel below`),
      dz: 300, rule_overrides: { ...(row.rule_overrides ?? {}), WALLZ: 1620 } }).eq('id', row.id))
    lowerLabels.push(f.label)
  }
  await open()
  for (const l of lowerLabels) {
    const up = lowers[lowerLabels.indexOf(l)].up
    console.log(l, JSON.stringify(await api('updateCabinet', l, { offset: up.offset, dy: 375 })))
  }
  // Under panels per wall (lower cupboards).
  await open()
  const st3 = await api('getState')
  const byWall = {}
  for (const l of lowerLabels) { const c = st3.cabinets.find(x => x.label === l); (byWall[c.wall] ??= []).push(l) }
  for (const [w, ls] of Object.entries(byWall)) console.log('under panel', w, JSON.stringify(await api('addUnderPanel', ls)))
  await open()
  const st4 = await api('getState')
  const wups = st4.cabinets.filter(c => /WUP|under/i.test(c.def ?? '') || (c.dy <= 20 && c.dz >= 250))
  console.log('wups', JSON.stringify(wups.map(c => ({ l: c.label, w: c.wall, o: c.offset, dx: c.dx, dy: c.dy, dz: c.dz, def: c.def }))))
  for (const u of wups) {
    const row = (await cabs()).find(c => c.label === u.label)
    chk(u.label, await sb.from('cabinet_instances').update({ material_overrides: { exposed: SATIN }, notes: 'Under panel 2pac Colour TBC, set back 20' + (u.wall === 'Wall 3' ? ', runs through both corner voids' : '') }).eq('id', row.id))
    const patch = u.wall === 'Wall 3' ? { offset: 0, dx: 2700, dz: 280 } : { dz: 280 }
    console.log(u.label, JSON.stringify(await api('updateCabinet', u.label, patch)))
  }
  for (const ci of await api('getIssues')) for (const e of [...ci.errors, ...ci.warnings]) console.log('  !', ci.label, e.code, e.message)
} finally { await browser.close() }
