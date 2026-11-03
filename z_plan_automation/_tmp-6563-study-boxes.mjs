// RHK6563 Study (Mark 2026-11-02): open shelves as 2 real boxes in 33 Lx Tas Oak (material_overrides interior/exposed/shelf),
// bottom 1400 AFF, 370 high, 300 deep, no front, no shelf. Wall 2 box 500-2044 both ends; Wall 3 box no left end (butts the Wall 2 box), right end seen.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '443a1553-14c4-4b8d-bd1f-2e5890b827e7', B33 = 'a92331d4-f2fd-4a82-9984-86f5af59bb01'
const mode = process.argv[2] ?? 'check'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
const open = async page => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500) }
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  if (mode === 'build') {
    const old = chk('old', await sb.from('cabinet_instances').select('id,label').eq('room_id', R).in('label', ['WC-05', 'WC-06', 'WC-07', 'WC-08', 'WC-09', 'WC-10']))
    if (old.length) { chk('cp del', await sb.from('cabinet_custom_parts').delete().in('cabinet_instance_id', old.map(o => o.id))); chk('del', await sb.from('cabinet_instances').delete().in('id', old.map(o => o.id))); console.log('deleted', old.map(o => o.label).join(',')) }
    await open(page)
    const boxes = [
      { wall: 'Wall 2', offset: 500, dx: 1544, note: 'Open shelf box 33 Lx Tas Oak, 300 deep x 370, bottom 1400 AFF. Both ends.' },
      { wall: 'Wall 3', offset: 267, dx: 1164, note: 'Open shelf box 33 Lx Tas Oak, 300 deep x 370, bottom 1400 AFF. No left end (butts the Wall 2 box), right end seen.' },
    ]
    for (const b of boxes) { console.log('placed', JSON.stringify(await page.evaluate(b => window.__canvasApi.placeCabinet({ def: 'B1D', wall: b.wall, offset: b.offset, dx: b.dx }), b))); await sleep(2500) }
    const st = await page.evaluate(() => window.__canvasApi.getState())
    const placed = st.cabinets.filter(c => c.dx === 1544 || c.dx === 1164)
    for (const c of placed) {
      const b = boxes.find(x => x.dx === c.dx)
      const row = chk('cab', await sb.from('cabinet_instances').select('id,rule_overrides').eq('room_id', R).eq('label', c.label).single())
      const upd = { dy: 370, dz: 300, pos_z: 1400, has_face: false, has_toekick: false, top_type: 'full_top', exposed_interior: true, notes: b.note,
        rule_overrides: { ...(row.rule_overrides ?? {}), FLOAT: true }, material_overrides: { interior: B33, exposed: B33, shelf: B33 },
        internal_grid: { tree: { type: 'section', section: { type: 'open', fittings: [] } } } }
      if (b.wall === 'Wall 3') upd.part_hide_views = { case_left_side: ['plan', 'elevation', '3d'] }
      chk('upd ' + c.label, await sb.from('cabinet_instances').update(upd).eq('id', row.id)); console.log('set', c.label, b.wall)
    }
  }
  await open(page)
  let st = await page.evaluate(() => window.__canvasApi.getState())
  const boxes = st.cabinets.filter(c => c.dx === 1544 || c.dx === 1164)
  for (const c of boxes) { await page.evaluate(l => window.__canvasApi.updateCabinet(l, { dz: 300 }), c.label); await sleep(2000) }
  st = await page.evaluate(() => window.__canvasApi.getState())
  for (const c of st.cabinets.filter(c => c.dx === 1544 || c.dx === 1164)) {
    console.log(c.label, c.wall, c.offset, c.dx, c.dy, c.dz, 'pos_z', c.pos_z)
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), c.label)
    console.log(' ', JSON.stringify(rp.case_parts.map(p => [p.part_key, p.X, p.Y, p.DX, p.DY, p.DZ, p.material_id?.slice(0, 8)])), 'int', rp.internal_parts.length, 'hide', JSON.stringify(rp.part_hide_views))
  }
  const issues = await page.evaluate(() => window.__canvasApi.getIssues()); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
