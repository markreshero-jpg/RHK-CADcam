// RHK6478 Buffet BC-01 (Mark 2026-11-18): the 4 vent slots 8 x 300 weren't cut - as hole cut-outs they route with the sheet's
// 10/12 cutter, which can't fit an 8 slot (G-code: "WARN ... too small for the bit - not cut"). Now 4 through GROOVES with the
// 8mm Downshear T110: one centreline pass each, round ends -> 8 x 300 overall. Op frame on the side panel: pos_x = depth from
// the back (wall), pos_y = height from the bottom. Centrelines 54 / 82 / 110 / 138 off the wall (slots 50-58, 78-86 ... 20 gaps),
// 534 -> 826 off the floor (slot 530-830, top end 50 under the 880 top). Hole cut-outs vent1-4 removed; apron notch kept.
// Run: node z_plan_automation/_tmp-6478-buf-slots-groove.mjs go
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer-core'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) { console.log('ERR', t, r.error.message); process.exit(1) } return r.data }
const R = '0df13af4-8a6f-438f-a10d-6a9b4754aa97', BC01 = 'eb12e59c-f1d8-46a6-86c9-ee1bbb34ac13', PART = 'd42fd658-9ecd-4a4f-ace4-bb46af9965e0'
const T110 = '12163452-ea8f-407e-85a9-340204dc0e5f'
const KEY = `custom_${PART}`
const have = chk('have', await sb.from('part_operations').select('id').eq('source_cabinet_id', BC01).eq('operation_type', 'groove'))
if (have.length) { console.log('grooves already there', have.length); process.exit(1) }
const rows = [54, 82, 110, 138].map((x, i) => ({
  source_table: 'custom_parts', source_cabinet_id: BC01, source_part_key: KEY, operation_type: 'groove', operation_role: 'local',
  plane_kind: 'face_front', pos_x: x, pos_y: 534, length: 292, width: 8, angle_az: 90, depth: 18, size_dz: 18,
  router_tool_id: T110, auto_tool: false, output_to_cnc: true, angle_ax: 0, angle_ay: 0, repeat_count: 1, is_master: false, sort_order: i,
  parameters: { note: `Vent slot ${i + 1}: 8 x 300 through, 8mm downshear, top end 50 under the top, ${x - 4} off the wall (Mark 2026-11-18)` },
}))
if (process.argv[2] !== 'go') { console.log(JSON.stringify(rows, null, 1)); process.exit(0) }
const p = chk('p', await sb.from('cabinet_custom_parts').select('part_cutouts').eq('id', PART).single())
const keep = p.part_cutouts.filter(c => !/^vent\d$/.test(c.id))
if (keep.length !== p.part_cutouts.length - 4) { console.log('unexpected cut-outs', JSON.stringify(p.part_cutouts)); process.exit(1) }
chk('cut', await sb.from('cabinet_custom_parts').update({ part_cutouts: keep }).eq('id', PART))
chk('ops', await sb.from('part_operations').insert(rows))
console.log('4 grooves in, hole cut-outs out; kept', keep.map(c => c.id).join(','))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); page.on('dialog', d => d.dismiss())
  page.on('console', m => { if (/handOpMarkers/.test(m.text())) console.log('CONSOLE', m.text().slice(0, 200)) })
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 240000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 240000 }); await sleep(4000)
  await page.evaluate(([i]) => window.__canvasApi.updateCabinet(i, { dz: 575 }), [BC01]); await sleep(2000)
  const iss = await page.evaluate(() => window.__canvasApi.getIssues())
  for (const x of iss) for (const e of x.errors) console.log('ERROR', x.label, e.code, e.message)
} finally { await browser.close() }
const after = chk('after', await sb.from('cabinet_custom_parts').select('outline,cutouts').eq('id', PART).single())
console.log('outline pts', after.outline?.length, 'holes', after.cutouts?.length ?? 0)
process.exit(0)
