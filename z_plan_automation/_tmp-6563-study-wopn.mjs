// RHK6563 Study (Mark 2026-11-02): the open shelf boxes BC-03/BC-04 become wall cabinets (WOPN), looking the same:
// 33 Lx Tas Oak, 18 Tas Oak back, BC-03's right end 18, Wall 3 box no left end, bottom 1400 AFF (rule WALLZ), SCRBK 0.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '443a1553-14c4-4b8d-bd1f-2e5890b827e7', B33 = 'a92331d4-f2fd-4a82-9984-86f5af59bb01', B18 = '6cd37f1b-67ce-4005-b5c3-c2715b739e07'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
const open = async page => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500) }
const boxes = [
  { wall: 'Wall 2', offset: 500, dx: 1544, mo: { interior: B33, exposed: B33, shelf: B33, back: B18, right_side: B18 },
    note: 'Open shelf box 33 Lx Tas Oak, 18 Lx ABS Grain Tas Oak back + right end (lines up with the back of the Wall 3 box), no back scribe, 300 deep x 370, bottom 1400 AFF.' },
  { wall: 'Wall 3', offset: 267, dx: 1164, mo: { interior: B33, exposed: B33, shelf: B33, back: B18 }, hide: { case_left_side: ['plan', 'elevation', '3d'] },
    note: 'Open shelf box 33 Lx Tas Oak, 18 Lx ABS Grain Tas Oak back, no back scribe, 300 deep x 370, bottom 1400 AFF. No left end (butts the Wall 2 box), right end seen.' },
]
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  if (process.argv[2] === 'build') {
    const old = chk('old', await sb.from('cabinet_instances').select('id,label,dx').eq('room_id', R).in('label', ['BC-03', 'BC-04']))
    if (old.length !== 2 || !old.every(o => [1544, 1164].includes(Number(o.dx)))) throw new Error('unexpected old boxes ' + JSON.stringify(old))
    chk('cp del', await sb.from('cabinet_custom_parts').delete().in('cabinet_instance_id', old.map(o => o.id)))
    chk('del', await sb.from('cabinet_instances').delete().in('id', old.map(o => o.id))); console.log('deleted', old.map(o => o.label).join(','))
    await open(page)
    const before = new Set((await page.evaluate(() => window.__canvasApi.getState())).cabinets.map(c => c.label))
    for (const b of boxes) { console.log('placed', JSON.stringify(await page.evaluate(b => window.__canvasApi.placeCabinet({ def: 'WOPN', wall: b.wall, offset: b.offset, dx: b.dx }), b))); await sleep(2500) }
    const st = await page.evaluate(() => window.__canvasApi.getState())
    for (const c of st.cabinets.filter(c => !before.has(c.label))) {
      const b = boxes.find(x => x.dx === c.dx); if (!b) throw new Error('no match ' + c.label + ' ' + c.dx)
      const row = chk('cab', await sb.from('cabinet_instances').select('id,rule_overrides').eq('room_id', R).eq('label', c.label).single())
      const upd = { dy: 370, dz: 300, has_face: false, has_toekick: false, top_type: 'full_top', exposed_interior: true, notes: b.note,
        rule_overrides: { ...(row.rule_overrides ?? {}), WALLZ: 1400, SCRBK: 0 }, material_overrides: b.mo,
        internal_grid: { tree: { type: 'section', section: { type: 'open', fittings: [] } } }, part_hide_views: b.hide ?? {} }
      chk('upd ' + c.label, await sb.from('cabinet_instances').update(upd).eq('id', row.id)); console.log('set', c.label, b.wall)
    }
  }
  await open(page)
  let st = await page.evaluate(() => window.__canvasApi.getState())
  const mine = st.cabinets.filter(c => (c.dx === 1544 || c.dx === 1164))
  for (const c of mine) { await page.evaluate(l => window.__canvasApi.updateCabinet(l, { dz: 300 }), c.label); await sleep(2000) }
  st = await page.evaluate(() => window.__canvasApi.getState())
  for (const c of st.cabinets.filter(c => c.dx === 1544 || c.dx === 1164)) {
    console.log(c.label, c.assembly_class, c.wall, c.offset, c.dx, c.dy, c.dz)
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), c.label)
    console.log(' ', JSON.stringify(rp.case_parts.map(p => [p.part_key, p.X, p.Y, p.Z, p.DX, p.DY, p.DZ, p.material_id?.slice(0, 8), Object.entries(p.edge_band ?? {}).filter(([, v]) => v).map(([k]) => k).join('')])), 'int', rp.internal_parts.length, 'face', rp.face_parts?.length)
  }
  const issues = await page.evaluate(() => window.__canvasApi.getIssues()); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
