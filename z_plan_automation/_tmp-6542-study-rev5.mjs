// RHK6542 Study rev 5 (Mark 2026-11-03):
//  WC-04 back in 2 pieces across the width (split.back_x, joined at the middle, grain up each piece);
//  recessed LED route in the underside of WC-04's bottom + WC-08 under panel, in line, 50 off the
//  back wall (route back edge), same route as Danny's Robe TC-03 (18.5 x 9 pocket, 8mm Downshear, 6 past both ends).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = 'a81555f3-22f3-4efd-947b-4e083bf49c94', T110 = '12163452-ea8f-407e-85a9-340204dc0e5f'
const W = 18.5, D = 9, OFF_BACK = 50, RUN_PAST = 6
const cab = async l => chk(l, await sb.from('cabinet_instances').select('id').eq('room_id', R).eq('label', l).single()).id
const wc04 = await cab('WC-04'), wc08 = await cab('WC-08')

// Back: 1934 wide from X 16.5 -> cut at 16.5 + 967.
chk('split', await sb.from('cabinet_instances').update({ split: { at: [], back_x: [983.5] } }).eq('id', wc04))

const up = chk('wup', await sb.from('cabinet_custom_parts').select('id,dx,dy').eq('cabinet_instance_id', wc08).eq('name', 'Under Panel').single())
const routes = [
  { cabId: wc04, table: 'case_parts', key: 'case_bottom', width: 1934 },
  { cabId: wc08, table: 'custom_parts', key: `custom_${up.id}`, width: Number(up.dy) },
]
for (const r of routes) {
  chk('del', await sb.from('part_operations').delete().eq('source_cabinet_id', r.cabId).eq('source_part_key', r.key).eq('operation_type', 'route'))
  console.log(chk('ins', await sb.from('part_operations').insert({
    source_table: r.table, source_cabinet_id: r.cabId, source_part_key: r.key,
    operation_type: 'route', operation_action: 'pocket', operation_role: 'local', plane_kind: 'face_back',
    pos_x: OFF_BACK + W / 2, pos_y: r.width / 2,
    size_dx: W, size_dy: r.width + 2 * RUN_PAST, size_dz: D, depth: D,
    router_tool_id: T110, auto_tool: false, output_to_cnc: true,
    fill_strategy: 'raster', raster_angle_deg: 90, raster_stepover_pct: 40,
    angle_ax: 0, angle_ay: 0, angle_az: 0, repeat_count: 1, sort_order: 0,
    parameters: { note: 'Recessed LED strip route 18.5 x 9, 50 off the back wall, 6 past both ends' },
  }).select('source_part_key,pos_x,pos_y,size_dx,size_dy,depth').single()))
}
chk('note', await sb.from('room_annotations').update({ text: 'COB LED RECESSED IN UNDERSIDE (WITH UNDER PANEL) - ROUTE 18.5 x 9, 50 OFF BACK WALL (CONNECTION BY OTHERS)' })
  .eq('room_id', R).like('text', 'COB LED%'))

// Re-resolve WC-04 so the persisted back is cut.
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  await page.evaluate(() => window.__canvasApi.updateCabinet('WC-04', { dz: 350 })); await sleep(3000)
  const issues = await page.evaluate(() => window.__canvasApi.getIssues())
  console.log('errors', issues.reduce((a, c) => a + c.errors.length, 0), issues.flatMap(c => [...c.errors, ...c.warnings].map(e => `${c.label} ${e.code}`)).join(', '))
} finally { await browser.close() }
const cp = chk('cp', await sb.from('case_parts').select('part_key,dx,dy,dz').eq('cabinet_instance_id', wc04).like('part_key', '%back%'))
console.log('back pieces', JSON.stringify(cp))
