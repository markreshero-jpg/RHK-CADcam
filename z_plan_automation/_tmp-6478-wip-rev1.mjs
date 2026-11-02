// RHK6478 WIP rev 1 (Mark 2026-11-03):
// 1. WC-05/06 under panel (WUP) set back 20 for the finger grab  2. TEPF right of TC-02, full depth
// 3. WC-07 shadowline ends flush with WC-01 / TC-03 inside face, WC-08 extended left
// 4. BC-03 BFK -> BFF 12 (wall) + BEPF 18; integrated D/W front (B1D, no carcass, as RHK6581 BC-18) full height to match the sink doors
// 5. TC-05 bottom 2 inner drawers 178, other 3 spread, hinges in the gaps
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = 'cb47d462-90eb-4ba0-8e6e-ca4d978628ae', DW_FX = '9f8731a7-43d4-4a5f-bbc2-ac018fa42640'
const DP95 = 'bacd2f97-4771-4ddd-a3ae-ea76f5367f32', DP178 = '23507573-f911-406d-906f-74daa520994b'
const OLD_WALL = ['WC-01', 'WC-02', 'WC-03', 'WC-04', 'WC-05', 'WC-06', 'WC-07', 'WC-08', 'WC-09', 'WC-10']
const cabsNow = async () => chk('cabs', await sb.from('cabinet_instances').select('id,label,internal_grid,face_grid').eq('room_id', R))
const upd = async (label, patch) => {
  const c = (await cabsNow()).find(c => c.label === label)
  if (!c) throw new Error('no cabinet ' + label)
  chk(label, await sb.from('cabinet_instances').update(patch).eq('id', c.id)); return c
}

// 4a. BC-03 (30 BFK) out
const bc03 = (await cabsNow()).find(c => c.label === 'BC-03')
if (bc03) {
  chk('bc03 cp', await sb.from('cabinet_custom_parts').delete().eq('cabinet_instance_id', bc03.id))
  chk('bc03', await sb.from('cabinet_instances').delete().eq('id', bc03.id))
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('dialog', d => { console.log('dialog', d.message()); d.dismiss() })
const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
const api = async (fn, ...a) => { const r = await Promise.race([page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]), sleep(60000).then(() => 'TIMEOUT')]); await sleep(1500); return r }
try {
  await open()
  const before = new Set((await cabsNow()).map(c => c.label))
  for (const p of [{ def: 'BFF', wall: 'Wall 5', offset: 0, dx: 12 }, { def: 'BEPF', wall: 'Wall 5', offset: 12, dx: 18 },
    { def: 'B1D', wall: 'Wall 5', offset: 30, dx: 600 }, { def: 'TEPF', wall: 'Wall 2', offset: 268, dx: 18 }]) {
    console.log('place', p.def, JSON.stringify(await api('placeCabinet', p)))
    await sleep(2000)
  }
  await sleep(3000)
  // find the new labels by order of creation
  const all = chk('new', await sb.from('cabinet_instances').select('id,label,cabinet_definition_id,created_at').eq('room_id', R).order('created_at'))
  const fresh = all.filter(c => !before.has(c.label))
  console.log('new', fresh.map(c => c.label).join(', '))
  if (fresh.length !== 4) throw new Error('expected 4 new cabinets')
  const [BFF, BEPF, DW, TEPF] = fresh.map(c => c.label)

  await upd(BFF, { dy: 900, dz: 630, pos_z: 0, has_toekick: false, notes: '12 filler to Wall 4, to the floor' })
  await upd(BEPF, { dy: 900, dz: 630, pos_z: 0, has_toekick: false, notes: '18 2pac end panel beside the integrated D/W, to the floor' })
  const dwCab = await upd(DW, {
    pos_z: 140, dy: 760, dz: 630, has_carcass: false, has_internal: false, has_face: true, has_toekick: false,
    left_neighbour_type: 'end_panel', right_neighbour_type: 'cabinet', rule_overrides: { SCRBK: 0 },
    face_grid: { cols: [{ col_index: 0, width_locked: false }], rows: [{ row_index: 0, height_locked: false }],
      zones: [{ row_index: 0, col_index: 0, face_type: 'door', hinge_side: 'bottom', hinges: [], finger_gap: 60 }] },
    notes: 'Bosch SMV6HCX03A fully integrated D/W front (2pac), full height to match the sink doors, sharknose under the apron (60 gap). Bottom hinged on the D/W, no hinges. 25 packer under the D/W.',
  })
  chk('dw fx', await sb.from('room_fixtures').update({ cabinet_id: dwCab.id }).eq('id', DW_FX))
  await upd(TEPF, { dy: 2362, dz: 630, pos_z: 0, has_toekick: false, notes: '18 2pac panel, shelf unit / fridge, full depth, floor to shadowline' })
  await upd('TC-02', { right_neighbour_type: 'end_panel' })
  await upd('WC-01', { left_neighbour_type: 'end_panel', notes: 'PTO pair over the fridge (1850-2362), 1 adj shelf, between the TEPFs' })
  for (const l of ['WC-05', 'WC-06']) await upd(l, { notes: 'Overhead pair 1530-2362, 2 adj shelves, LED strip under; 18 under panel set back 20 (finger grab behind the doors)' })

  // 5. TC-05 inner drawers: 178 / 178 / 95 / 95 / 95, equal 105.5 gaps between fronts (front = box +2 .. box + h + 20)
  const tc05 = (await cabsNow()).find(c => c.label === 'TC-05')
  const ig = structuredClone(tc05.internal_grid)
  const ys = [[30.5, 178], [332, 178], [633.5, 95], [852, 95], [1070.5, 95]]
  ig.tree.children[0].section.fittings = ys.map(([y, h]) => ({ type: 'inner_drawer', height: h, y_locked: true, y_position: y, slide_product_id: h === 178 ? DP178 : DP95 }))
  const fg = structuredClone(tc05.face_grid)
  for (const z of fg.zones) z.hinges = [2140, 1520, 801, 281]
  chk('tc05', await sb.from('cabinet_instances').update({ internal_grid: ig, face_grid: fg,
    notes: 'Pantry pair: 5 inner drawers (2 x 178 + 3 x 95 Dragon Pro 500), fixed shelf, 2 adj above' }).eq('id', tc05.id))

  // reload, then geometry through the bridge (re-resolves)
  await open()
  for (const [l, p] of [['WC-01', { offset: 286, dx: 932 }], ['WC-07', { dx: 1218 }], ['WC-08', { offset: 1218, dx: 1133 }],
    [BFF, { dy: 900 }], [BEPF, { dy: 900 }], [DW, { dy: 760 }], [TEPF, { dy: 2362 }], ['TC-05', { dy: 2222 }], ['TC-02', { dy: 2362 }]])
    console.log(l, JSON.stringify(await api('updateCabinet', l, p)))
  console.log('under', JSON.stringify(await api('addUnderPanel', ['WC-05', 'WC-06'])))
  await sleep(3000)
  const st = await api('getState')
  const wup = st.cabinets.filter(c => c.class === 'wall' && !OLD_WALL.includes(c.label))
  console.log('under panel', JSON.stringify(wup))
  for (const w of wup) console.log('wup dz', JSON.stringify(await api('updateCabinet', w.label, { dz: 310 })))
  await sleep(2000)
  const st2 = await api('getState')
  for (const c of st2.cabinets) console.log(c.label, c.wall, c.offset, c.dx, c.dy, c.dz)
  console.log(JSON.stringify(st2.fixtures?.map(f => [f.name?.slice(0, 20), f.cabinet, f.clash])))
  console.log('issues', JSON.stringify(await api('getIssues')).slice(0, 5000))
} finally { await browser.close() }
