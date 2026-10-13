// Handles H1 check (z_handles/HANDLES-SPEC.md): re-resolves every cabinet in a
// room through the real canvas pipeline (no-op dy update → resolve + persist),
// then reads face_zones.handle back and checks role / placement per front.
//
//   node z_plan_automation/verify-handles-h1.mjs <roomId>
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer-core'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = process.env.DEV_PORT ?? '3001'
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const die = msg => { console.error('ERROR:', msg); process.exit(1) }

const roomId = process.argv[2]
if (!roomId) die('usage: node z_plan_automation/verify-handles-h1.mjs <roomId>')

const env = Object.fromEntries(
  fs.readFileSync(path.join(REPO, '.env.local'), 'utf8')
    .split('\n').filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
{ const { error } = await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD }); if (error) die(`automation sign-in failed: ${error.message}`) }

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-first-run', '--disable-gpu'] })
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:${PORT}/canvas/${roomId}`, { waitUntil: 'networkidle2', timeout: 60000 })
  await page.waitForFunction('!!window.__canvasApi?.getState', { timeout: 30000 })
  await sleep(800)
  const cabs = await page.evaluate(() => window.__canvasApi.getState().cabinets)
  for (const c of cabs) {
    const dy = Number(String(c.dims ?? '').split('x')[1]) || c.dy
    await page.evaluate((id, dy) => window.__canvasApi.updateCabinet(id, { dy }), c.id, dy)
    await sleep(500)
  }
  await sleep(3000)   // persist runs in the background
} finally {
  await browser.close()
}

const { data: cabRows } = await sb.from('cabinet_instances').select('id,label,assembly_class').eq('room_id', roomId)
const byId = new Map((cabRows ?? []).map(c => [c.id, c]))
const { data: zones } = await sb.from('face_zones')
  .select('cabinet_instance_id,row_index,col_index,face_type,hinge_side,dx,dy,handle')
  .in('cabinet_instance_id', [...byId.keys()]).in('face_type', ['door', 'drawer_face'])

let bad = 0
const counts = {}
for (const z of zones ?? []) {
  const c = byId.get(z.cabinet_instance_id)
  const h = z.handle
  const tag = `${c.label} ${c.assembly_class} ${z.face_type}[${z.row_index},${z.col_index}] hinge=${z.hinge_side ?? '-'} ${Math.round(z.dx)}x${Math.round(z.dy)}`
  if (!h) { console.log(`MISSING ${tag}`); bad++; continue }
  if (h.none) { console.log(`NONE ${tag}`); continue }
  counts[h.name] = (counts[h.name] ?? 0) + 1
  const cls = c.assembly_class
  const expRole = z.face_type === 'drawer_face' ? 'drawer' : cls.startsWith('wall') ? 'door_wall' : cls.startsWith('tall') ? 'door_tall' : 'door_base'
  const problems = []
  if (h.role !== expRole) problems.push(`role ${h.role} ≠ ${expRole}`)
  if (h.grip_kind === 'hardware') {
    if (h.x == null || h.x < 0 || h.x > z.dx) problems.push(`x ${h.x} outside 0..${z.dx}`)
    if (h.y == null || h.y < 0 || h.y > z.dy) problems.push(`y ${h.y} outside 0..${z.dy}`)
  }
  if (problems.length) bad++
  console.log(`${problems.length ? 'BAD ' : 'OK  '} ${tag} → ${h.name} (${h.role}, ${h.grip_edge}, ${h.orientation}) @ ${h.x == null ? '—' : `${Math.round(h.x)},${Math.round(h.y)}`}${problems.length ? '  ' + problems.join('; ') : ''}`)
}
console.log('\nCounts:', counts)
console.log(`${(zones ?? []).length} fronts — ${bad} problem(s)`)
process.exit(bad ? 3 : 0)
