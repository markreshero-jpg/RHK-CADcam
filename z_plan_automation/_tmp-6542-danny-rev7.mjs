// RHK6542 Danny's Robe: TC-03 / TC-04 fixed shelf top at 800 AFF (carcass 720, underside 703.5) keeping
// every finger gap 25: the extra 22 goes into the fronts (+22/3 each via IDB_FRONT_TOP_ADJUST),
// TC-03's flap the same height as the drawer fronts, AV shelf up under it.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const R = '830e087b-d817-4843-b766-5fbdd8ee6c4a'
const KICK = 80, SHELF_TOP_AFF = 800, T = 16.5, GAP = 25, BOX = 178
const underside = SHELF_TOP_AFF - KICK - T                 // 703.5
const size = underside - T                                  // 687 (section above the carcass bottom)
const front = (underside - GAP - (T + 2) - 2 * GAP) / 3     // 203.33
const adj = front - BOX + 2                                  // 27.33: absolute top adjust (method 20, bottom adjust -2)
const ys = [0, 1, 2].map(i => T + i * (front + GAP))        // box Y: 16.5 / 244.83 / 473.17
console.log({ underside, size, front, adj, ys })
const cabs = (await sb.from('cabinet_instances').select('id,label,internal_grid,face_grid,rule_overrides,drawerbox_overrides').eq('room_id', R).in('label', ['TC-03', 'TC-04'])).data
for (const c of cabs) {
  const g = structuredClone(c.internal_grid), sec = g.tree.children[0]
  sec.size = size
  let i = 0
  for (const f of sec.section.fittings) {
    if (f.type === 'inner_drawer') f.y_position = ys[i++]
    else if (f.type === 'fixed_shelf') f.y_position = ys[2] + 2          // AV shelf underside = flap bottom
  }
  const { IDB_FRONT_TOP_ADJUST: _x, ...ro } = c.rule_overrides ?? {}
  const upd = { internal_grid: g, rule_overrides: ro, drawerbox_overrides: { ...(c.drawerbox_overrides ?? {}), IDB_FRONT_TOP_ADJUST: adj } }
  if (c.label === 'TC-03') {
    const fg = structuredClone(c.face_grid)
    fg.rows[0].height = ys[2]            // flap bottom = 2 + row 0 (was 458.5 → 460.5)
    fg.rows[1].height = front
    upd.face_grid = fg
  }
  console.log(c.label, (await sb.from('cabinet_instances').update(upd).eq('id', c.id)).error?.message ?? 'ok', JSON.stringify(g.tree.children[0].section.fittings.map(f => [f.type, f.y_position])))
}
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' }); page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  for (const l of ['TC-03', 'TC-04']) { await page.evaluate(l => window.__canvasApi.updateCabinet(l, { dz: 580 }), l); await sleep(2500) }
  for (const l of ['TC-03', 'TC-04']) {
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    console.log('==', l)
    for (const p of rp.internal_parts.filter(p => /front|fixed_shelf|bottom$/.test(p.part_type))) console.log('  ', p.part_type, 'Y', +p.Y.toFixed(2), 'DX', +p.DX.toFixed(2), 'DZ', p.DZ, 'top', +(p.Y + (p.part_type === 'fixed_shelf' ? p.DZ : p.DX)).toFixed(2))
    for (const f of rp.face_zones ?? rp.faces ?? []) console.log('   face', f.face_type, 'Y', f.Y, 'DY', f.DY)
  }
  const issues = await page.evaluate(() => window.__canvasApi.getIssues())
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) console.log(`  ${ci.label} ${e.code}: ${e.message}`)
  console.log('errors', issues.reduce((a, c) => a + c.errors.length, 0))
} finally { await browser.close() }
