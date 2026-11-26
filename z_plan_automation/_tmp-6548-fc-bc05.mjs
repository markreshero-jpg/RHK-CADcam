// RHK6548 Front Counter BC-05 (Mark 2026-11-27): bottom drawer as an INNER drawer (not a face drawer / finger pull).
// Face all open. Fixed shelf stays (underside 202, top 220). Inner drawer 127 box at y 30 -> front 32-177,
// top 25 below the shelf underside so it can be pulled from the top edge. Adj shelf above as before.
// node _tmp-6548-fc-bc05.mjs [boxY] [boxH]
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const FC = '09786d9b-378e-42ed-9fc7-1aed4c7b21ab', ID = '47afbb25-6133-464b-81c4-64f640bac41f'
const Y = Number(process.argv[2] ?? 30), H = Number(process.argv[3] ?? 127)
chk('upd', await sb.from('cabinet_instances').update({
  face_grid: { cols: [{ col_index: 0, width_locked: false }], rows: [{ row_index: 0, height_locked: false }], zones: [{ col_index: 0, row_index: 0, face_type: 'open' }] },
  internal_grid: { tree: { type: 'hsplit', children: [
    { size: 184, separator: 'fixed_shelf', section: { type: 'open', fittings: [{ type: 'inner_drawer', height: H, y_locked: true, y_position: Y }] } },
    { section: { type: 'open', fittings: [{ type: 'adj_shelf', y_locked: false }] } },
  ] } },
  notes: 'Inner drawer, no handle - front 25 below the shelf to pull from the top edge',
}).eq('id', ID))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${FC}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  console.log(JSON.stringify(await page.evaluate(async id => { const x = await window.__canvasApi.getResolved(id); return { errors: x.errors, warnings: x.warnings } }, ID)))
} finally { await browser.close() }
console.log('faces', JSON.stringify(chk('f', await sb.from('face_zones').select('face_type,y,dy,handle').eq('cabinet_instance_id', ID))))
for (const p of chk('p', await sb.from('internal_parts').select('*').eq('cabinet_instance_id', ID)))
  console.log(p.part_type, 'y', p.y, 'dy', p.dy, 'dz', p.dz, 'dx', p.dx, JSON.stringify(p.drawerbox_overrides))
process.exit(0)
