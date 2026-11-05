// RHK6592 rev 20 (Mark 2026-11-05): kitchen WC-03 rangehood finish-off —
//  - no bottom (Bottom Type none): the hole is only in the under panel (Bosch cut-out bigger than the carcass bottom allows);
//  - hood cover (z_rangehood R9): carcass-board panel behind the doors, flush with the gables' front, 260 up from the
//    under panel, D notches 40 x 80 r15 at the hinges (follow them); door hinges >= 200 from the door bottom;
//  - under panels (WUP, full carcass depth) under WC-04 / WC-03 / WC-02, each scribed up (bottom scribe = panel);
//    separate panels because WC-03 is 380 deep and the others 300;
//  - the under panel's rangehood hole keeps a 0.3 onion skin.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (m, r) => { if (r.error) throw new Error(m + ': ' + r.error.message); console.log('ok', m); return r.data }
const KIT = 'dc7a22f3-ed0b-4771-a42e-4548fc4de1e1'
const wc3 = chk('WC-03', await sb.from('cabinet_instances').select('id,rangehood').eq('room_id', KIT).eq('label', 'WC-03').single())
chk('WC-03 block', await sb.from('cabinet_instances').update({
  bottom_type: 'none',
  rangehood: { ...wc3.rangehood, cover: { h: 260, notch_w: 40, notch_h: 80, notch_r: 15 }, panel_skin: 0.3 },
}).eq('id', wc3.id))

const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); page.on('dialog', d => d.dismiss()); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  const open = async () => { await page.goto(`http://localhost:3001/canvas/${KIT}`, { waitUntil: 'networkidle2', timeout: 90000 }); await page.waitForFunction('!!window.__canvasApi'); await sleep(1500) }
  const api = async (fn, ...a) => { const r = await page.evaluate(([f, x]) => window.__canvasApi[f](...x), [fn, a]); console.log(fn, JSON.stringify(a), JSON.stringify(r)?.slice(0, 200)); await sleep(1500); return r }
  await open()
  const st = await page.evaluate(() => window.__canvasApi.getState())
  const have = st.cabinets.filter(c => /WUP|Under/i.test(c.label ?? '') || c.dy === 18 && c.class === 'wall').map(c => c.label)
  console.log('existing panels?', have)
  if (!process.env.SKIP_UP) for (const l of ['WC-04', 'WC-03', 'WC-02']) await api('addUnderPanel', [l])
  await sleep(3000); await open()
  // Hinges: bottom one 200 up the door, the rest as resolved.
  const rh = await page.evaluate(async () => (await window.__canvasApi.getResolved('WC-03')).hinge_instances.map(h => [h.row_index, h.col_index, h.sort_order, h.y_position_mm]))
  console.log('hinges', JSON.stringify(rh))
  const { data: c3 } = await sb.from('cabinet_instances').select('id,face_grid').eq('id', wc3.id).single()
  const fg = c3.face_grid
  fg.zones = fg.zones.map(z => {
    if (z.face_type !== 'door') return z
    const ys = rh.filter(h => h[0] === z.row_index && h[1] === z.col_index).map(h => h[3]).sort((a, b) => a - b)
    return { ...z, hinges: ys.map((y, i) => i === 0 ? Math.max(200, y) : y) }
  })
  chk('hinges', await sb.from('cabinet_instances').update({ face_grid: fg }).eq('id', wc3.id))
  await open()
  const r = await page.evaluate(async () => { const x = await window.__canvasApi.getResolved('WC-03')
    return { hinges: x.hinge_instances.map(h => [h.col_index, h.y_position_mm]), cover: x.case_parts.filter(p => p.part_key === 'rh:cover').map(p => ({ ...p, outline: p.outline?.map(q => [q.x, q.y, q.b ?? 0]) })),
      bottom: x.case_parts.some(p => p.part_key === 'bottom'), hole: x.rangehood_hole } })
  console.log(JSON.stringify(r))
  const s2 = await page.evaluate(() => window.__canvasApi.getState())
  console.log(JSON.stringify(s2.cabinets.filter(c => c.wall === 'Wall 1' && c.class === 'wall').map(c => [c.label, c.offset, c.dx, c.dy, c.dz])))
  for (const x of await page.evaluate(() => window.__canvasApi.getIssues())) if (x.errors.length || x.warnings.length) console.log(x.label, JSON.stringify([...x.errors, ...x.warnings].map(e => e.code + ' ' + e.message)))
  console.log('done')
} finally { await browser.close() }
