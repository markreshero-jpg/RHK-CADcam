// RHK6339 J02 (Mark 2026-11-12): Custom Timber Pull 450 = timber pull (z_handles D19): linear strip 35 wide x 35
// thick, 18 x 18 rebate on the hinge-side back edge, Solid Timber 35mm – Blackbutt, flush with each door's meeting
// edge (one per door), 1050-1500 AFF, secret fixed (no holes), no CNC.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '67a27d07-1012-4537-a58d-5d3b50764221', PULL = 'cb24a933-5410-4582-bd8a-186d702918ea'
const VEN = '0e14088b-0649-4756-91ea-cd8d8704e57c'

// Material: parent "Solid Timber 35mm" + colour row Blackbutt (copy of the Veneer 17mm look, no CNC tool).
let { data: parent } = await sb.from('materials').select('id').eq('name', 'Solid Timber 35mm').maybeSingle()
const { data: ven } = await sb.from('materials').select('*').eq('id', VEN).single()
const base = { brand: 'RHK (made in shop)', finish: 'Solid timber', dz: 35, sheet_dx: 2400, sheet_dy: 200, has_grain: true, grain_direction: 'vertical',
  active: true, face_colour: ven.face_colour, back_colour: ven.back_colour, edge_colour: ven.edge_colour, cnc_tool_id: null,
  trim_top: 0, trim_bottom: 0, trim_left: 0, trim_right: 0, pad: 0, feed_rate_pct: ven.feed_rate_pct }
if (!parent) {
  const r = await sb.from('materials').insert({ ...base, name: 'Solid Timber 35mm', notes: 'Dressed solid timber 35 thick, made by hand in the shop (timber pulls etc). Not nested. Species = colour rows. RHK6339.' }).select('id').single()
  console.log('parent', r.error?.message ?? r.data.id); parent = r.data
}
let { data: mat } = await sb.from('materials').select('id').eq('name', 'Solid Timber 35mm – Blackbutt').maybeSingle()
if (!mat) {
  const r = await sb.from('materials').insert({ ...base, name: 'Solid Timber 35mm – Blackbutt', parent_id: parent.id, colour_name: 'Blackbutt', notes: 'RHK6339 Hans Const timber pulls' }).select('id').single()
  console.log('mat', r.error?.message ?? r.data.id); mat = r.data
}

// Handle -> timber pull.
console.log('handle', (await sb.from('hardware_handles').update({ grip_kind: 'linear', handle_type: 'other', strip_width_mm: 35, strip_thick_mm: 35, rebate_mm: 18,
  strip_material_id: mat.id, projection: 35, screw_spacing_mm: null, screw_inset_mm: null, needs_finger_gap: false }).eq('id', PULL)).error?.message ?? 'ok')

// Door zones: 450 long, bottom at 1050 AFF -> handle_inset = door top AFF - 1500; no holes; pulls no CNC.
const { data: cab } = await sb.from('cabinet_instances').select('id,pos_z,face_grid,rule_overrides,part_no_cnc').eq('room_id', R).eq('label', 'TC-01').single()
const { data: zones } = await sb.from('face_zones').select('col_index,y,dy').eq('cabinet_instance_id', cab.id)
const fg = { ...cab.face_grid, zones: cab.face_grid.zones.map(z => {
  const fz = zones.find(q => q.col_index === z.col_index)
  const top = Number(cab.pos_z) + Number(fz.y) + Number(fz.dy)
  return { ...z, handle_length: 450, handle_inset: Math.round((top - 1500) * 10) / 10, handle_drill: false }
}) }
console.log('zones', JSON.stringify(fg.zones.map(z => [z.col_index, z.handle_inset])))
const part_no_cnc = [...new Set([...(cab.part_no_cnc ?? []), 'case_lh:0', 'case_lh:1'])]
console.log('cab', (await sb.from('cabinet_instances').update({ face_grid: fg, rule_overrides: { ...cab.rule_overrides, HANDLE_DRILL: false }, part_no_cnc }).eq('id', cab.id)).error?.message ?? 'ok')

const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  console.log(JSON.stringify(await page.evaluate(() => window.__canvasApi.updateCabinet('TC-01', { dz: 421 })))); await sleep(4000)
  for (const ci of await page.evaluate(() => window.__canvasApi.getIssues())) for (const e of [...ci.errors, ...ci.warnings]) console.log(' ', ci.label, e.code, e.message)
} finally { await browser.close() }
const { data: parts } = await sb.from('case_parts').select('part_key,x,y,z,dx,dy,dz,material_id,lh').eq('cabinet_instance_id', cab.id).like('part_key', 'lh:%')
console.log(JSON.stringify(parts))
const { data: fz2 } = await sb.from('face_zones').select('col_index,x,dx,handle').eq('cabinet_instance_id', cab.id)
for (const z of fz2) console.log(z.col_index, z.x, z.dx, JSON.stringify(z.handle?.strip), z.handle?.holes?.length)
