// RHK6548 Front Counter BC-02 (Mark 2026-11-27): 200 cup dispenser cabinet - open below with a shelf,
// 2 false fronts above for the cup dispensers. Face rows (bottom-up): open 369 locked, false, false (equal).
// Internal: fixed shelf level with the bottom of the false fronts (top 369), adj shelf in the open bay.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const FC = '09786d9b-378e-42ed-9fc7-1aed4c7b21ab', ID = '57d47017-a80e-455f-af14-27bccf20da83'
const OPEN = Number(process.argv[2] ?? 369), SIZE = Number(process.argv[3] ?? 333)
chk('upd', await sb.from('cabinet_instances').update({
  face_grid: {
    cols: [{ col_index: 0, width_locked: false }],
    rows: [{ row_index: 0, height: OPEN, height_locked: true }, { row_index: 1, height_locked: false }, { row_index: 2, height_locked: false }],
    zones: [{ col_index: 0, row_index: 0, face_type: 'open' }, { col_index: 0, row_index: 1, face_type: 'false_panel' }, { col_index: 0, row_index: 2, face_type: 'false_panel' }],
  },
  internal_grid: { tree: { type: 'hsplit', children: [
    { size: SIZE, separator: 'fixed_shelf', section: { type: 'open', fittings: [{ type: 'adj_shelf', y_locked: false }] } },
    { section: { type: 'open', fittings: [] } },
  ] } },
  notes: 'Cup dispensers through the 2 false fronts; open below with a shelf',
}).eq('id', ID))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${FC}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  const r = await page.evaluate(async id => { const x = await window.__canvasApi.getResolved(id); return { errors: x.errors, warnings: x.warnings } }, ID)
  console.log(JSON.stringify(r))
} finally { await browser.close() }
console.log('faces', JSON.stringify(chk('f', await sb.from('face_zones').select('face_type,y,dy').eq('cabinet_instance_id', ID).order('y'))))
console.log('parts', JSON.stringify(chk('p', await sb.from('case_parts').select('part_key,y,dy,dz').eq('cabinet_instance_id', ID)).filter(p => /shelf|bottom|top|rail/.test(p.part_key))))
process.exit(0)
