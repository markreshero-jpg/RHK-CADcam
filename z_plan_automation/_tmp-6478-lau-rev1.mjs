// RHK6478 Laundry rev 1 (Mark 2026-11-02): delete the washer bay TC-03 (620 clear between the tower panels),
// tower panels kick to shadowline; talls split at the upper doors -> lower TCs (REVT 3 so the doors clear the ones above)
// + upper WCs in 2pac PTO; TC-07 central divider, adj shelves on the RHS; 18 shadowlines over every run.
// node _tmp-6478-lau-rev1.mjs [db|canvas|all]
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const mode = process.argv[2] ?? 'all'
const R = 'fc12bc7d-53ee-46ee-a302-3411f5129bcc'
const PTO = '9440a3f0-63db-4085-9042-1c728298b49a'
const PAC = 'bd2b9178-5b77-4a52-b7a1-cc3765ed4bb4', PAC_TBC = '827dfe38-7cb7-4c02-aa87-6916b09876f5'
const KICK = 140, TOP = 2679, UPPER = 659, SPLIT = TOP - UPPER   // 2020
const cabsOf = async () => chk('cabs', await sb.from('cabinet_instances').select('id,label,dx,dy,pos_z,rule_overrides,hardware_overrides,notes').eq('room_id', R))
const adj = n => Array.from({ length: n }, () => ({ type: 'adj_shelf', y_locked: false }))
const pair = (extra = {}) => ({ cols: [{ col_index: 0, width_locked: false }, { col_index: 1, width_locked: false }], rows: [{ row_index: 0, height_locked: false }],
  zones: [{ col_index: 0, row_index: 0, face_type: 'door', hinge_side: 'left', ...extra }, { col_index: 1, row_index: 0, face_type: 'door', hinge_side: 'right', ...extra }] })
const sleep = ms => new Promise(r => setTimeout(r, ms))

if (mode === 'db' || mode === 'all') {
  const cabs = await cabsOf(), by = l => cabs.find(c => c.label === l)
  // 1. washer / dryer bay gone: 620 clear between the tower panels
  if (by('TC-03')) chk('del TC-03', await sb.from('cabinet_instances').delete().eq('id', by('TC-03').id))
  // 2. tower panels stand on the kick, up to the shadowline
  for (const l of ['TC-02', 'TC-05']) chk(l, await sb.from('cabinet_instances').update({ pos_z: KICK, dy: TOP - KICK,
    notes: `18 2pac panel, tower ${l === 'TC-02' ? 'left' : 'right'}, kick to shadowline (620 clear for the washer + dryer)` }).eq('id', by(l).id))
  // 3. lower talls: carcass to 2020, one row of doors with a 3 top reveal
  const lower = {
    'TC-07': { note: 'Broom / ironing board / steamer - lower pair to 2020, central divider: LHS open 1850 broom space, RHS adj shelves', tree: { type: 'vsplit', children: [
      { divider: 'single', section: { type: 'open', fittings: [] } }, { section: { type: 'open', fittings: adj(4) } }] } },
    'TC-08': { note: 'Lower pair to 2020, central divider, all shelves adjustable', tree: { type: 'vsplit', children: [
      { divider: 'single', section: { type: 'open', fittings: adj(4) } }, { section: { type: 'open', fittings: adj(4) } }] } },
  }
  for (const [l, v] of Object.entries(lower)) {
    const c = by(l)
    chk(l, await sb.from('cabinet_instances').update({ dy: SPLIT - KICK, face_grid: pair(), internal_grid: { tree: v.tree }, notes: v.note,
      rule_overrides: { ...(c.rule_overrides ?? {}), REVT: 3 } }).eq('id', c.id))
  }
}

if (mode === 'canvas' || mode === 'all') {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
  try {
    const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
    page.on('dialog', d => { console.log('dialog', d.message()); d.dismiss() })
    page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)))
    const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(2500) }
    const api = (fn, ...a) => page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a])
    await open()
    let st = await api('getState')
    const have = (wall, off, dx, def) => st.cabinets.find(c => c.wall === wall && Math.abs(c.offset - off) < 1 && Math.abs(c.dx - dx) < 1 && (!def || c.def === def))
    // 4. upper WCs over the talls + 18 shadowlines
    const adds = [
      ['W2D', 'Wall 4', 18, 888], ['W2D', 'Wall 4', 906, 888],
      ['BHSL', 'Wall 2', 0, 686], ['BHSL', 'Wall 2', 686, 1970], ['BHSL', 'Wall 4', 18, 1806],
    ]
    for (const [def, wall, offset, dx] of adds) if (!st.cabinets.some(c => c.wall === wall && Math.abs(c.offset - offset) < 1 && Math.abs(c.dx - dx) < 1 && /^WC/.test(c.label) && (def !== 'W2D' || c.dy > 100) && (def !== 'BHSL' || c.dy < 100))) {
      console.log('place', def, wall, offset, JSON.stringify(await api('placeCabinet', { def, wall, offset, dx }))); await sleep(600)
    }
    st = await api('getState')
    const cabs = await cabsOf()
    const find = (wall, off, dx, small) => st.cabinets.find(c => c.wall === wall && Math.abs(c.offset - off) < 1 && Math.abs(c.dx - dx) < 1 && /^WC/.test(c.label) && (small ? c.dy < 100 : c.dy >= 100) && c.label !== 'WC-01')
    const wcs = [find('Wall 4', 18, 888), find('Wall 4', 906, 888)]
    for (const w of wcs) {
      const c = cabs.find(x => x.id === w.id)
      chk(w.label, await sb.from('cabinet_instances').update({ face_grid: pair({ door_style_id: PAC, door_colour_id: PAC_TBC }), internal_grid: { tree: { type: 'open', fittings: adj(1) } },
        hardware_overrides: { ...(c.hardware_overrides ?? {}), handle_schedule_id: PTO }, notes: `Upper pair over ${w.offset < 100 ? 'TC-07' : 'TC-08'} 2020-2679, 2pac PTO (as the talls), 1 adj shelf` }).eq('id', w.id))
      await api('updateCabinet', w.id, { dy: UPPER, dz: 480 }); await sleep(900)
    }
    const sl = (left, depth) => ({ kind: 'shadowline', front: 'carcase', width: 60, cleat: false, auto_h: false,
      left: { on: left, depth, joint: 'mitre' }, right: { on: false, depth, joint: 'mitre' }, bottom: { on: false, depth, joint: 'mitre' } })
    const shadows = [[find('Wall 2', 0, 686, true), 680, false, 'tower'], [find('Wall 2', 686, 1970, true), 330, false, 'overheads'], [find('Wall 4', 18, 1806, true), 480, true, 'talls']]
    for (const [b, dz, left, what] of shadows) {
      chk('sl', await sb.from('cabinet_instances').update({ bulkhead: sl(left, dz), notes: `18 shadowline over the ${what}, 2679-2697` }).eq('id', b.id))
      await api('updateCabinet', b.id, { dy: 18, dz }); await sleep(900)
    }
    // 5. re-resolve the edited cabinets (no-op dz), then report
    await open()
    st = await api('getState')
    for (const c of st.cabinets) { await api('updateCabinet', c.label, { dz: c.dz }); await sleep(700) }
    st = await api('getState')
    for (const c of st.cabinets) console.log(c.label, c.def ?? '', c.wall, c.offset, c.dx, c.dy, c.dz)
    for (const l of ['TC-07', wcs[0].label]) {
      const rp = await api('getResolved', l)
      console.log(l, 'zones', JSON.stringify(rp.face_zones.map(z => [z.Y, z.DY, z.DZ, z.material_id?.slice(0, 8), z.handle?.grip_kind])))
    }
    const issues = await api('getIssues'); let n = 0
    for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
    console.log('issues', n)
  } finally { await browser.close() }
}
