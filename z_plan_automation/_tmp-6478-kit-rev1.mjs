// RHK6478 Kitchen rev 1 (Mark 2026-11-04):
//  - BC-14 island back panel onto Wall 5, back side, 445 off the cabinet backs; Wall 7 deleted
//  - WC-02 / WC-04 single doors, hinged toward the tall panels (WC-02 left, WC-04 right)
//  - WC-05 one adj shelf (middle)
//  - cooktop lowered: glass 5 proud of the 920 stone
//  - BC-09 Teramo 56L bin with an external 150 drawer above (top line with the S/M/L drawers)
//  - every drawer cabinet re-resolved for the 5 clear under finger rails (D25)
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = 'dd6c9440-6664-4e87-8ea9-4d88b7a9b1b6'
const W5 = 'c6531864-e0a3-45a8-a8f3-d5218464da86', W7 = 'e3e27777-48ae-4688-8154-bb4fd77457d8'
const TERAMO56 = '73489428-752b-4223-af23-e90cb8729521'
const cabs = chk('cabs', await sb.from('cabinet_instances').select('id,label,face_grid,internal_grid,dz,notes').eq('room_id', R))
const C = Object.fromEntries(cabs.map(c => [c.label, c]))
const upd = async (l, patch) => chk(l, await sb.from('cabinet_instances').update(patch).eq('id', C[l].id))

// BC-14: Wall 5 runs east->west from x 4430; panel x 1290-3832 -> offset 598. Back side (rotation 0 = 180 + 180),
// back 445 off the island line (cabinet backs at y 2400) = y 2845.
await upd('BC-14', { wall_id: W5, pos_x: 4430 - 598, pos_y: 2845, rotation: 0 })
chk('ann7', await sb.from('room_annotations').delete().eq('wall_id', W7))
chk('wall7', await sb.from('walls').delete().eq('id', W7))

const door = hinge => ({ cols: [{ col_index: 0, width_locked: false }], rows: [{ row_index: 0, height_locked: false }],
  zones: [{ col_index: 0, row_index: 0, face_type: 'door', hinge_side: hinge }] })
await upd('WC-02', { face_grid: door('left'), notes: '# 17 overhead 1530-2672, single door hinged left (off the TEPF), 2 adj, LED strip under' })
await upd('WC-04', { face_grid: door('right'), notes: '# 19 overhead 1530-2672, single door hinged right (off the TEPF), 2 adj, LED strip under' })
await upd('WC-05', { internal_grid: { ...C['WC-05'].internal_grid, tree: { type: 'open', fittings: [{ type: 'adj_shelf', y_locked: false }] } },
  notes: '# 20 / 21 PTO pair over the fridge + freezer 1913-2672, 1 adj (middle)' })

await upd('BC-09', {
  face_grid: { cols: [{ col_index: 0, width_locked: false }],
    rows: [{ row_index: 0, height_locked: false }, { row_index: 1, height: 150, height_locked: true }],
    zones: [
      { col_index: 0, row_index: 0, face_type: 'drawer_face', hinge_side: 'left', drawer_type_config: { type: 'bin', slide_product_id: TERAMO56 } },
      { col_index: 0, row_index: 1, face_type: 'drawer_face', hinge_side: 'left', finger_gap: 60 }] },
  notes: '# 31 Nikpol Teramo 56L pull-out bin (2 x 28L) with an external 150 drawer over, top line with the S/M/L drawers',
})

const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  const api = async (fn, ...a) => { const r = await page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]); await sleep(1500); return r }
  const st = await api('getState')
  const ck = { id: '037859d7-8f18-4ee8-8b86-4a939a9e1479', height: 59.1 }
  console.log('cooktop', JSON.stringify(await api('updateFixture', ck.id, { z: Math.round((920 - ck.height + 5) * 10) / 10 })))
  // re-resolve every cabinet with a face (finger rails / drawers / doors changed): no-op dz
  for (const c of st.cabinets) {
    if (/^(KICK|BH|SL)/.test(c.label)) continue
    await api('updateCabinet', c.label, { dz: c.dz })
  }
  const st2 = await api('getState')
  const b14 = st2.cabinets.find(c => c.label === 'BC-14'); console.log('BC-14', b14.wall, b14.offset, b14.dx, b14.dz, JSON.stringify(b14).slice(0, 300))
  console.log('walls', st2.walls.map(w => w.name).join(','))
  for (const l of ['BC-01', 'BC-02', 'BC-03', 'BC-06', 'BC-09', 'BC-13']) {
    const r = await api('getResolved', l); if (!r) continue
    const rails = (r.case_parts ?? []).filter(p => String(p.part_key).startsWith('fprail')).map(p => p.Y)
    console.log(l, 'rails', JSON.stringify(rails), 'boxes', JSON.stringify((r.drawer_stacks ?? []).map(s => [s.drawer_type, s.box_Y, s.box_height])))
  }
  console.log('issues', JSON.stringify((await api('getIssues')).filter(i => i.errors.length || i.warnings.length)))
} finally { await browser.close() }
