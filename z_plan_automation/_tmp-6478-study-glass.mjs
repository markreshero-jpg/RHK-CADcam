// RHK6478 Study (Mark 2026-11-05): new library material "Glass 6mm - Clear Toughened" (no grain, no CNC tool), and the
// desk glass as 2 custom parts on BC-11 (no CNC, ordered in): 6 thick, top flush at 760 (y 56.5-62.5), z 90 (in the
// 10 x 6 back-strip rebate) to 600 (front of the front strip) = 510 deep, between the end caps 16.5-3005.5,
// joint over the BC-08 left gable centre (1266.75). Modelled at the opening size - deduct clearance when ordering.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = 'a04663c7-1402-4344-be00-3ad4ce3aeae9'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const NAME = 'Glass 6mm – Clear Toughened'
let mat = chk('m', await sb.from('materials').select('id').eq('name', NAME))[0]
if (!mat) mat = chk('mi', await sb.from('materials').insert({ name: NAME, brand: 'Generic', finish: 'Clear toughened', dz: 6, sheet_dx: 3660, sheet_dy: 2440,
  has_grain: false, grain_direction: null, active: true, notes: 'Bought-in glass (cut to size by the supplier, not CNC). Use for glass custom parts (desk / shelf tops); glass doors use the Glass Door tool sets.',
  face_colour: '#9cc3dd', back_colour: '#9cc3dd', edge_colour: '#5f8fb0', colour_name: 'Clear', cnc_tool_id: null }).select('id'))[0]
console.log('material', mat.id)
const cab = chk('c', await sb.from('cabinet_instances').select('id').eq('room_id', R).eq('label', 'BC-11'))[0]
const parts = chk('cp', await sb.from('cabinet_custom_parts').select('*').eq('cabinet_instance_id', cab.id))
if (!parts.some(p => p.name.startsWith('Desk glass'))) {
  const { id: _i, created_at: _c, updated_at: _u, ...base } = parts.find(p => p.name === 'Desk underside 1/2')
  const JN = 1258.5 + 8.25, A = 16.5, B = 3022 - 16.5
  const glass = (n, x, len) => ({ ...base, name: `Desk glass ${n}/2 (6mm toughened, by RHK)`, orientation: 'flat', x, y: 56.5, z: 90, dx: 510, dy: len, dz: 6,
    material_id: mat.id, material_override_id: null, no_cnc: true, grain_across: false, edge_top: false, edge_bottom: false, edge_left: false, edge_right: false, sort_order: 20 + n })
  chk('gi', await sb.from('cabinet_custom_parts').insert([glass(1, A, JN - A), glass(2, JN, B - JN)]))
}
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('dialog', d => d.dismiss())
const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
const api = async (fn, ...a) => { const r = await page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message); await sleep(1500); return r }
try {
  await open()
  console.log(JSON.stringify(await api('updateCabinet', 'BC-11', { dz: 600 })))
  await open()
  for (const p of chk('cp2', await sb.from('cabinet_custom_parts').select('name,x,y,z,dx,dy,dz,no_cnc').eq('cabinet_instance_id', cab.id).like('name', 'Desk glass%'))) console.log(JSON.stringify(p))
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
