// Draw a room in the CAD canvas from a layout JSON, headlessly.
//
//   node z_plan_automation/draw-plan.mjs <layout.json>
//
// Creates the room + walls in Supabase, then drives the dev app's
// window.__canvasApi bridge through headless Chrome so cabinets go through the
// real placement/resolve pipeline. Verifies the result from the DB afterwards.
//
// Layout schema: see layouts/*.json and the .claude/skills/draw-plan skill.
//   room:     roomHeight [,roomRules {TOEH..}, wallCabinetTop]
//   walls:    x,y,length,angle [,thickness,height,soffit,type:'island',detached]
//   cabinets: def,wall,offset,dx [,dy,dz,flip,note]
//     flip: place on the wall's BACK side (island far side) — rotation +180.
//     Flipped cabinets are placed in a first pass, flipped in the DB, then the
//     page reloads before the face-side pass so overlap logic sees them as
//     back-side.
//
// Requirements: dev server on 3001 (`npm run dev`); Chrome (CHROME_PATH to override).
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

// ── Load layout + env ─────────────────────────────────────────────────────────
const layoutPath = process.argv[2]
if (!layoutPath) die('usage: node z_plan_automation/draw-plan.mjs <layout.json>')
const layout = JSON.parse(fs.readFileSync(layoutPath, 'utf8'))

const env = Object.fromEntries(
  fs.readFileSync(path.join(REPO, '.env.local'), 'utf8')
    .split('\n').filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
// No anonymous DB access (z_access_control) — sign in as the automation account.
{ const { error } = await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD }); if (error) { console.error("automation sign-in failed (AUTOMATION_EMAIL/PASSWORD in .env.local):", error.message); process.exit(1) } }

// ── Sanity-check the wall loop is head-to-tail clockwise ─────────────────────
// Shop rule: walls drawn head-to-tail in a clockwise rotation. Detached walls
// (islands, separate runs) are exempt from the continuity check.
{
  const rad = a => (a * Math.PI) / 180
  for (let i = 0; i < layout.walls.length - 1; i++) {
    const w = layout.walls[i], n = layout.walls[i + 1]
    if (w.detached || n.detached) continue
    const ex = w.x + w.length * Math.cos(rad(w.angle))
    const ey = w.y + w.length * Math.sin(rad(w.angle))
    if (Math.hypot(ex - n.x, ey - n.y) > 1)
      die(`walls not head-to-tail: wall ${i + 1} ends at (${ex.toFixed(1)},${ey.toFixed(1)}) but wall ${i + 2} starts at (${n.x},${n.y})`)
    const cross = Math.cos(rad(w.angle)) * Math.sin(rad(n.angle)) - Math.sin(rad(w.angle)) * Math.cos(rad(n.angle))
    if (cross < 0)
      die(`walls ${i + 1}->${i + 2} turn counterclockwise — redraw the loop clockwise`)
  }
}

// ── Dev server up? ────────────────────────────────────────────────────────────
try {
  const res = await fetch(`http://localhost:${PORT}/`, { headers: { 'x-dev-automation': '1' } })
  if (!res.ok) throw new Error(`status ${res.status}`)
} catch {
  die(`dev server not responding on port ${PORT} — start it with: npm run dev  (in-session: ! npm run dev)`)
}

// ── Resolve project ───────────────────────────────────────────────────────────
let projectId = layout.projectId ?? null
if (!projectId && layout.projectName) {
  const { data } = await sb.from('projects').select('id').ilike('name', layout.projectName).limit(1).maybeSingle()
  if (data) projectId = data.id
  else if (layout.createProject) {
    // Clone job-level defaults (schedules, door style/colour, class dims) from
    // the most recent project so materials cascade sensibly.
    const { data: tpl } = await sb.from('projects').select('*').order('created_at', { ascending: false }).limit(1).single()
    const { id, created_at, updated_at, name, job_number, client_name, client_address, client_id, notes, ...defaults } = tpl
    const { data: created, error } = await sb.from('projects').insert({
      ...defaults,
      name: layout.projectName,
      job_number: layout.jobNumber ?? null,
      client_name: layout.clientName ?? null,
      client_address: layout.clientAddress ?? null,
      notes: 'Created by draw-plan automation',
    }).select('id').single()
    if (error) die(`project create failed: ${error.message}`)
    projectId = created.id
    console.log('created project', layout.projectName, projectId)
  }
}
if (!projectId) die('no project — set projectId, or projectName (+ createProject: true)')

// ── Create room + walls (direct DB — walls need no resolver) ─────────────────
const { data: siblings } = await sb.from('rooms').select('sort_order').eq('project_id', projectId)
const { data: room, error: roomErr } = await sb.from('rooms').insert({
  project_id: projectId,
  name: layout.roomName ?? 'Room',
  sort_order: (siblings ?? []).reduce((m, r) => Math.max(m, r.sort_order + 1), 0),
  room_dy: layout.roomHeight ?? 2400,
  // Room-level construction rule overrides (e.g. { TOEH: 100 } for a 100 kick
  // job) — set before placement so every cabinet resolves with them.
  ...(layout.roomRules ? { rule_overrides: layout.roomRules } : {}),
  ...(layout.wallCabinetTop != null ? { wall_cabinet_top: layout.wallCabinetTop } : {}),
}).select().single()
if (roomErr) die(`room create failed: ${roomErr.message}`)
console.log('created room', room.name, room.id)

const wallIds = []
for (let i = 0; i < layout.walls.length; i++) {
  const w = layout.walls[i]
  const { data: row, error } = await sb.from('walls').insert({
    room_id: room.id,
    name: `Wall ${i + 1}`,
    sort_order: i,
    length: w.length, angle: w.angle, pos_x: w.x, pos_y: w.y,
    thickness: w.thickness ?? (w.type === 'island' ? 0 : 90),
    height: w.height ?? layout.roomHeight ?? 2400,
    soffit_height: w.soffit ?? null,
    wall_type: w.type === 'island' ? 'island' : 'standard',
  }).select('id,name').single()
  if (error) die(`wall insert failed: ${error.message}`)
  wallIds.push(row.id)
  console.log('wall:', row.name, w.type ?? 'standard', `${w.length}mm @${w.angle}deg`)
}

// ── Drive the canvas ──────────────────────────────────────────────────────────
const flipped = layout.cabinets.filter(c => c.flip)
const faceSide = layout.cabinets.filter(c => !c.flip)

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-first-run', '--disable-gpu'],
})
let state, issues
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  const openCanvas = async () => {
    await page.goto(`http://localhost:${PORT}/canvas/${room.id}`, { waitUntil: 'networkidle2', timeout: 60000 })
    await page.waitForFunction('!!window.__canvasApi', { timeout: 30000 })
    await sleep(800)
  }
  const api = (fn, args) => page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, args])
  const place = async c => {
    const r = await api('placeCabinet', [{ def: c.def, wall: `Wall ${c.wall}`, offset: c.offset, dx: c.dx }])
    console.log('placed:', JSON.stringify(r))
    await sleep(400)
  }
  // placeCabinet rounds dx to whole mm (819.5 -> 820), so match with tolerance.
  const matchPlaced = (st, c) => st.cabinets.find(s =>
    s.wall === `Wall ${c.wall}` && Math.abs(s.offset - c.offset) <= 1 && Math.abs(s.dx - c.dx) <= 1 && !s._claimed)

  await openCanvas()

  // Pass 1: back-side (flipped) cabinets — place face-side, flip in DB, reload
  // so the face-side pass sees them on the back side (no false overlaps).
  if (flipped.length) {
    for (const c of flipped) await place(c)
    const st = await api('getState', [])
    for (const c of flipped) {
      const p = matchPlaced(st, c)
      if (!p) die(`flip: cannot find placed cabinet ${JSON.stringify(c)}`)
      p._claimed = true
      const { data: row } = await sb.from('cabinet_instances').select('rotation').eq('id', p.id).single()
      await sb.from('cabinet_instances').update({ rotation: ((row.rotation + 180) % 360 + 360) % 360 }).eq('id', p.id)
      console.log('flipped to back side:', p.label)
    }
    await openCanvas()
  }

  // Pass 2: face-side cabinets.
  for (const c of faceSide) await place(c)

  // Island cabinets get back scribe 0 (shop rule: the island's back panel sits
  // on the far side of the island wall, screwed through the cabinet backs).
  // Written to the DB first so the re-resolve below picks it up.
  state = await api('getState', [])
  const islandWalls = new Set(layout.walls.map((w, i) => w.type === 'island' ? `Wall ${i + 1}` : null).filter(Boolean))
  for (const c of layout.cabinets) {
    const p = matchPlaced(state, c)
    if (!p) die(`cannot find placed cabinet for override: ${JSON.stringify(c)}`)
    p._claimed = true
    c._id = p.id; c._label = p.label
    // Per-cabinet `rules` (e.g. sink cabinets: { RAIL_ORIENT: 'vertical' }).
    const extra = { ...(islandWalls.has(`Wall ${c.wall}`) ? { SCRBK: 0 } : {}), ...(c.rules ?? {}) }
    if (Object.keys(extra).length) {
      const { data: row } = await sb.from('cabinet_instances').select('rule_overrides').eq('id', p.id).single()
      await sb.from('cabinet_instances').update({ rule_overrides: { ...(row?.rule_overrides ?? {}), ...extra } }).eq('id', p.id)
      c._touch = true   // force a re-resolve even if no dim change
    }
  }

  // Dimension overrides (updateCabinet re-resolves parts, reading rule_overrides fresh).
  for (const c of layout.cabinets) {
    const p = state.cabinets.find(s => s.id === c._id)
    const patch = {}
    if (c.dy != null && p.dy !== c.dy) patch.dy = c.dy
    if (c.dz != null && p.dz !== c.dz) patch.dz = c.dz
    if (c._touch && !Object.keys(patch).length) patch.dy = p.dy
    if (Object.keys(patch).length) {
      const r = await api('updateCabinet', [p.id, patch])
      console.log('updated:', JSON.stringify(r))
      await sleep(400)
    }
  }
  await sleep(1000)
  state = await api('getState', [])

  // Final resolver check: re-resolve every cabinet through the real pipeline
  // and collect its errors/warnings (reported in the verify section below).
  issues = await api('getIssues', [])
} finally {
  await browser.close()
}

// Notes (plain metadata — no resolve needed).
for (const c of layout.cabinets) {
  if (c.note && c._id) await sb.from('cabinet_instances').update({ notes: c.note }).eq('id', c._id)
}

// ── Verify from the DB ────────────────────────────────────────────────────────
let fail = 0
const { data: cabs } = await sb.from('cabinet_instances')
  .select('id,label,assembly_class,rotation,dx,dy,dz').eq('room_id', room.id).order('label')
for (const c of cabs) {
  const { count: cp } = await sb.from('case_parts').select('*', { count: 'exact', head: true }).eq('cabinet_instance_id', c.id)
  const { count: fz } = await sb.from('face_zones').select('*', { count: 'exact', head: true }).eq('cabinet_instance_id', c.id)
  const { count: cu } = await sb.from('cabinet_custom_parts').select('*', { count: 'exact', head: true }).eq('cabinet_instance_id', c.id)
  const ok = (cp > 0 && fz > 0) || cu > 0   // panels have only custom parts
  if (!ok) fail++
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${c.label} ${c.assembly_class} rot ${c.rotation} dims ${c.dx}x${c.dy}x${c.dz} parts:${cp} faces:${fz} custom:${cu}`)
}
if (cabs.length !== layout.cabinets.length) { fail++; console.log(`FAIL expected ${layout.cabinets.length} cabinets, room has ${cabs.length}`) }
for (const c of layout.cabinets) {
  const placed = state.cabinets.find(s => s.id === c._id)
  if (!placed) { fail++; console.log('FAIL not placed:', JSON.stringify(c)) }
  else {
    if (c.dy != null && placed.dy !== c.dy) { fail++; console.log(`FAIL ${placed.label} dy=${placed.dy}, wanted ${c.dy}`) }
    if (c.dz != null && placed.dz !== c.dz) { fail++; console.log(`FAIL ${placed.label} dz=${placed.dz}, wanted ${c.dz}`) }
  }
}
// ── Resolver report ───────────────────────────────────────────────────────────
// Errors count as failures; warnings are informational.
let warnTotal = 0
console.log('\nRESOLVER REPORT')
for (const c of issues ?? []) {
  warnTotal += c.warnings.length
  fail += c.errors.length
  const flag = c.errors.length ? 'ERROR' : c.warnings.length ? 'WARN ' : 'OK   '
  console.log(`${flag} ${c.label}  ${c.class}  ${c.dims}`)
  for (const e of c.errors) console.log(`        E ${e.code}: ${e.message}${e.part ? ` [${e.part}]` : ''}`)
  for (const w of c.warnings) console.log(`        W ${w.code}: ${w.message}${w.part ? ` [${w.part}]` : ''}`)
}
console.log(`resolver: ${(issues ?? []).reduce((n, c) => n + c.errors.length, 0)} error(s), ${warnTotal} warning(s)`)

console.log(fail === 0 ? `\nDONE room ${room.id} — all checks passed` : `\nDONE WITH ${fail} FAILURES — room ${room.id}`)
process.exit(fail === 0 ? 0 : 2)
