// RHK6571 Kitchen WC-03 -> slide-out rangehood (z_rangehood R12, same as library WRHSO) for the Westinghouse WRR626SB:
// Bottom Type none, doors stop 42 above the underside (open 42 row), body between the gables 300 deep from the front,
// shelf at 300 (hood 272 high incl. visor). Then re-resolve WC-03 + its under panel WC-13 and print the result.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '5a1ef0f2-d86e-4c67-8b0e-df4a80dd09c3'
const cur = chk('q', await sb.from('cabinet_instances').select('id,face_grid,rangehood').eq('room_id', R).eq('label', 'WC-03').single())
// Face rows count up from the bottom: row 0 = the 40 open strip (+ 2 reveal = doors 42 up), row 1 = the doors.
const doors = cur.face_grid.zones.filter(z => z.face_type === 'door').map(z => ({ ...z, row_index: 1 }))
const face_grid = { cols: cur.face_grid.cols, rows: [{ row_index: 0, height: 40, height_locked: true }, { row_index: 1, height_locked: false }],
  zones: [...cur.face_grid.cols.map(c => ({ col_index: c.col_index, row_index: 0, face_type: 'open' })), ...doors] }
const rangehood = { ...cur.rangehood, mount: 'slideout', hole: { w: null, d: 300, setback: 0, offset: 0, radius: 0 }, shelf_h: 300 }
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 600000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 180000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await new Promise(r => setTimeout(r, 4000))
  const api = (f, ...a) => page.evaluate(([f, a]) => window.__canvasApi[f](...a), [f, a])
  chk('upd', await sb.from('cabinet_instances').update({ bottom_type: 'none', face_grid, rangehood }).eq('id', cur.id))
  await page.reload({ waitUntil: 'networkidle2' }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await new Promise(r => setTimeout(r, 4000))
  await api('updateCabinet', 'WC-03', { dz: 330 }); await new Promise(r => setTimeout(r, 4000))
  await api('updateCabinet', 'WC-13', { dz: 310 }); await new Promise(r => setTimeout(r, 4000))
  for (const l of ['WC-03', 'WC-13']) {
    const rp = await api('getResolved', l)
    console.log(l, JSON.stringify({ hole: rp.rangehood_hole, case: rp.case_parts.map(p => [p.part_key, p.DX, p.DY, p.DZ, p.outline?.length ?? 0]), custom: rp.custom_parts.map(p => [p.name, p.dx ?? p.DX, p.dy ?? p.DY, (p.outline ?? []).length, JSON.stringify(p.outline ?? null).slice(0, 300)]), faces: (rp.face_zones ?? []).map(z => [z.face_type, z.DX, z.DY, z.Y ?? z.y]), shelves: rp.internal_parts.map(p => [p.part_type, p.Y]) }).slice(0, 2500))
  }
  const issues = await api('getIssues')
  for (const ci of issues) if (['WC-03', 'WC-13', 'WC-02'].includes(ci.label)) for (const e of [...ci.errors, ...ci.warnings]) console.log('  ISSUE', ci.label, e.code, e.message)
} finally { await browser.close() }
