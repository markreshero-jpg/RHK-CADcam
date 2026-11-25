// Pre-nest checklist (Mark 2026-11-15, RHK6581 J11 — drawer fronts weren't grain matched
// because the rooms were drawn before the draw-plan rule). Run BEFORE every optimiser run:
//   node z_plan_automation/prenest-check.cjs <job number or project id> "<room name>" ["<room name>" …]
// Read-only. Prints FIX lines (must sort before nesting) and CHECK lines (ask / confirm).
const fs = require('fs'); const { createClient } = require('@supabase/supabase-js')
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const [job, ...roomNames] = process.argv.slice(2)
if (!job) { console.log('usage: node z_plan_automation/prenest-check.cjs <job no | project id> "<room>" …'); process.exit(1) }

;(async () => {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
  const isId = /^[0-9a-f-]{36}$/i.test(job)
  const { data: projs } = await sb.from('projects').select('id,job_number,name')[isId ? 'eq' : 'ilike'](isId ? 'id' : 'job_number', isId ? job : `%${job}%`)
  if (!projs?.length) throw new Error(`no project ${job}`)
  // Several projects can share a job number (pricing copies): take the one holding the rooms.
  const want = roomNames.map(n => n.toLowerCase())
  let proj = null, rooms = []
  for (const pr of projs) {
    const { data: rs } = await sb.from('rooms').select('id,name').eq('project_id', pr.id).is('deleted_at', null)
    const hit = (rs ?? []).filter(r => !want.length || want.includes(String(r.name).toLowerCase()))
    if (hit.length > rooms.length) { proj = pr; rooms = hit }
  }
  if (!rooms.length) throw new Error(`no rooms ${roomNames.join(', ')} in ${projs.map(p => p.name).join(' / ')}`)
  if (want.length && rooms.length !== want.length) console.log('WARN rooms not found:', want.filter(w => !rooms.some(r => r.name.toLowerCase() === w)))
  const roomName = new Map(rooms.map(r => [r.id, r.name]))
  const { data: cabs } = await sb.from('cabinet_instances')
    .select('id,label,room_id,updated_at,bulkhead,part_no_cnc,grain_match_group_id,internal_grid,no_cnc').in('room_id', rooms.map(r => r.id))
  const ids = cabs.map(c => c.id), cab = new Map(cabs.map(c => [c.id, c]))
  const where = c => `${roomName.get(c.room_id)} ${c.label}`
  const { data: mats } = await sb.from('materials').select('id,name,has_grain,sheet_dx,sheet_dy')
  const mat = new Map(mats.map(m => [m.id, m]))
  const sheetMax = id => { const m = mat.get(id); const l = Math.max(Number(m?.sheet_dx) || 0, Number(m?.sheet_dy) || 0); return l || 2415 }
  const sheetMin = id => { const m = mat.get(id); const w = Math.min(Number(m?.sheet_dx) || 0, Number(m?.sheet_dy) || 0); return w || 1211 }
  const q = async (t, cols) => (await sb.from(t).select(cols).in('cabinet_instance_id', ids)).data ?? []
  const [cp, tk, fz, cu] = await Promise.all([
    q('case_parts', 'cabinet_instance_id,part_key,dx,dy,material_id,material_override_id,output_to_cnc,created_at'),
    q('toekick_parts', 'cabinet_instance_id,part_key,dx,dy,material_id,output_to_cnc,created_at'),
    q('face_zones', 'cabinet_instance_id,face_type,material_id,material_override_id,dx,dy,output_to_cnc'),
    q('cabinet_custom_parts', 'cabinet_instance_id,name,orientation,dx,dy,edge_top,edge_bottom,edge_left,edge_right,no_cnc'),
  ])
  const out = { FIX: [], CHECK: [] }
  const add = (k, s) => out[k].push(s)

  // 1. Woodgrain drawer banks not grain matched (draw-plan rule, 2026-11-03).
  const banks = new Map()
  for (const z of fz) if (/drawer/i.test(z.face_type) && mat.get(z.material_id)?.has_grain) banks.set(z.cabinet_instance_id, (banks.get(z.cabinet_instance_id) ?? 0) + 1)
  for (const [id, n] of banks) if (n >= 2 && !cab.get(id).grain_match_group_id) add('FIX', `${where(cab.get(id))}: ${n} woodgrain drawer fronts, no grain-match group (one group per drawer stack, vertical)`)

  // 2. Parts longer than the sheet (unless No CNC).
  for (const [t, rows, pre] of [['case', cp, 'case_'], ['kick', tk, 'tk_']]) for (const p of rows) {
    const c = cab.get(p.cabinet_instance_id), L = Math.max(Number(p.dx), Number(p.dy))
    if (p.output_to_cnc === false || c.no_cnc || (c.part_no_cnc ?? []).includes(`${pre}${p.part_key}`)) continue
    if (L > sheetMax(p.material_override_id ?? p.material_id) - 10) add('FIX', `${where(c)}: ${p.part_key} ${L} long — over the sheet (seam / split / No CNC)`)
    // Short side wider than the sheet (RHK6478 Buffet WC-02 back 1439 x 1213, Mark 2026-11-22 nest: unplaced).
    const W = Math.min(Number(p.dx), Number(p.dy))
    if (W > sheetMin(p.material_override_id ?? p.material_id) - 10) add('FIX', `${where(c)}: ${p.part_key} ${Math.max(p.dx, p.dy)} x ${W} — wider than the sheet (split / bigger sheet / No CNC)`)
  }
  // Fronts too (RHK6478 US Hallway Linen doors 2574 high, Mark 2026-11-25) - a door can't be split: long sheet.
  for (const z of fz) {
    const c = cab.get(z.cabinet_instance_id), L = Math.max(Number(z.dx), Number(z.dy)), m = z.material_override_id ?? z.material_id
    if (z.output_to_cnc === false || c.no_cnc || !L) continue
    if (L > sheetMax(m) - 10) add('FIX', `${where(c)}: ${z.face_type} ${Math.max(z.dx, z.dy)} x ${Math.min(z.dx, z.dy)} - over the sheet (long sheet in Stage 3)`)
  }
  for (const p of cu) if (!p.no_cnc && Math.max(Number(p.dx), Number(p.dy)) > 2405) add('FIX', `${where(cab.get(p.cabinet_instance_id))}: ${p.name} ${Math.max(p.dx, p.dy)} long — over the sheet`)

  // 3. Parts older than the cabinet (edited since the last resolve).
  const newest = new Map()
  for (const p of [...cp, ...tk]) { const t = Date.parse(p.created_at); if (t > (newest.get(p.cabinet_instance_id) ?? 0)) newest.set(p.cabinet_instance_id, t) }
  for (const c of cabs) { const n = newest.get(c.id); if (n && Date.parse(c.updated_at) - n > 60000) add('FIX', `${where(c)}: edited after its parts were resolved — re-resolve (OPTI_RUN reresolve)`) }

  // 4. Custom panels / fillers taped on all four edges (Mark 2026-11-15: back edge untaped).
  // Applied end panels backing onto a wall: back edge untaped (Mark 2026-11-26, RHK6612 TC-01). Side-on parts run
  // dx back -> front, so edge_left is the back edge. Library BEPF / BEPK / TEPF / TEPK / WEP default to it since then.
  for (const p of cu) {
    if (p.orientation === 'side' && /applied panel/i.test(p.name) && p.edge_left)
      add('FIX', `${where(cab.get(p.cabinet_instance_id))}: ${p.name} back edge taped — untape it (edge_left) unless it's an island / open end`)
    else if (/panel|filler/i.test(p.name) && p.edge_top && p.edge_bottom && p.edge_left && p.edge_right)
      add('CHECK', `${where(cab.get(p.cabinet_instance_id))}: ${p.name} taped all 4 edges — back / wall edge normally untaped`)
  }

  // 5. Bulkheads without the +10 scribe (h_adjust).
  for (const c of cabs) if (c.bulkhead && c.bulkhead.kind !== 'shadowline' && !c.bulkhead.h_adjust) add('CHECK', `${where(c)}: bulkhead has no +10 scribe (h_adjust)`)

  // 6. Locked top hanging rails (should hang at the centre-support drop).
  const walk = (n, f) => { if (!n) return; if (n.section) f(n.section); if (n.type && n.fittings) f(n); for (const ch of n.children ?? []) walk(ch, f) }
  for (const c of cabs) {
    const rails = []; walk(c.internal_grid?.tree, s => { for (const f of s.fittings ?? []) if (/HANGING_RAIL/.test(f.key ?? '')) rails.push(f) })
    const top = rails.length ? rails.reduce((a, b) => ((b.y_position ?? 1e9) > (a.y_position ?? 1e9) ? b : a)) : null
    if (top && top.y_locked) add('CHECK', `${where(c)}: top hanging rail locked at ${top.y_position} — unlock so it hangs at the centre-support drop`)
  }

  // 7. No CNC parts — untick them in Stage 2 (the browser list doesn't drop them yet).
  for (const c of cabs) for (const k of c.part_no_cnc ?? []) add('CHECK', `${where(c)}: ${k} is No CNC — untick it in Stage 2`)

  console.log(`Pre-nest check ${proj.job_number ?? ''} ${proj.name} — ${rooms.map(r => r.name).join(', ')}`)
  for (const k of ['FIX', 'CHECK']) { console.log(`\n${k} (${out[k].length})`); for (const s of out[k]) console.log(' -', s) }
  if (!out.FIX.length && !out.CHECK.length) console.log('\nAll clear.')
})().catch(e => { console.error(e.message); process.exit(1) })
