// RHK6586 (Mark 2026-10-30): finished top thicknesses — kitchen 60, vanity 60, lounge 40, study 40 + WF end.
// All 20 stone + mitred apron (surface heights unchanged); top drawers get the apron's finger gap, end panels stop under the apron.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
{ const { error } = await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD }); if (error) throw error }
const DRY = process.argv.includes('--dry')
const R = { study: 'd4fdad8f-bcbf-4c38-a6ad-b6e0cee7ca8d', lounge: 'ddc7d7e2-abd3-4f13-8b65-72eac0050bb6', vanity: 'a321bb6a-1ed6-428b-bcca-6d1946d16345', kitchen: 'a496c328-cfda-4f74-8c6d-175edd8e5907' }
const MA40 = 'adc278a8-5caa-45a4-ae38-045c21bce82f', MA60 = '59a7169d-761a-414d-82b0-bd8ea7123853'
const run = async (q, what) => { if (DRY) { console.log('DRY', what); return } const { error } = await q; console.log(error ? 'ERR ' + what + ' ' + error.message : 'ok ' + what) }
const top = async (room, edges, notes) => {
  const t = (await sb.from('benchtop_instances').select('id,segments').eq('room_id', room)).data[0]
  const segments = t.segments.map((s, i) => edges[i] ? { ...s, edge: { ...s.edge, wall: false, profile_id: edges[i] } } : s)
  await run(sb.from('benchtop_instances').update({ segments, notes }).eq('id', t.id), 'top ' + room.slice(0, 8) + ' ' + JSON.stringify(segments.map(s => s.edge.profile_id?.slice(0, 4) ?? (s.edge.wall ? 'W' : '-'))))
}
const cabs = async room => Object.fromEntries((await sb.from('cabinet_instances').select('id,label,dy,pos_z,kick_run_id,face_grid,rule_overrides').eq('room_id', room)).data.map(c => [c.label, c]))
const fingerGap = async (c, gap) => {
  const fg = c.face_grid, top = Math.max(...fg.rows.map(r => r.row_index))
  const zones = fg.zones.map(z => z.row_index === top && z.face_type === 'drawer_face' ? { ...z, finger_gap: gap } : z)
  await run(sb.from('cabinet_instances').update({ face_grid: { ...fg, zones } }).eq('id', c.id), `${c.label} finger_gap ${gap}`)
}
const set = async (c, patch) => run(sb.from('cabinet_instances').update(patch).eq('id', c.id), `${c.label} ${JSON.stringify(patch)} (was dy ${c.dy} z ${c.pos_z} run ${c.kick_run_id})`)
const roomRevt = async (room, v) => {
  const ro = (await sb.from('rooms').select('rule_overrides').eq('id', room)).data[0].rule_overrides ?? {}
  const BY = ro.BY_CLASS ?? {}
  await run(sb.from('rooms').update({ rule_overrides: { ...ro, BY_CLASS: { ...BY, base: { ...(BY.base ?? {}), REVT: v } } } }).eq('id', room), `room ${room.slice(0, 8)} base REVT ${v}`)
}

// Vanity: MA150 -> MA60 (785 top, apron to 725).
await top(R.vanity, [null, MA60, MA60, null], 'Vanity 60 finished: 20mm stone (colour TBC) + 60 mitred apron on the front + seen right end, 2100 x 500, top at 785 AFFL (basin rim 850). Semi-inset basin centred at 1050, wall spout 1050 AFFL.')
await roomRevt(R.vanity, 44)
{ const c = await cabs(R.vanity); for (const l of ['BC-01', 'BC-02', 'BC-03']) await fingerGap(c[l], 60); await set(c['BC-04'], { dy: 525 }) }

// Lounge: 40 apron on the front + both seen ends (450 top, apron to 410).
await top(R.lounge, [null, MA40, MA40, MA40], 'TV unit 40 finished: 20mm stone (colour TBC) + 40 mitred apron on the front + both ends, 3010 x 350, top at 450 AFFL. Overhangs 5 past the fronts and both end panels.')
await roomRevt(R.lounge, 24)
{ const c = await cabs(R.lounge); for (const l of ['BC-02', 'BC-03', 'BC-05', 'BC-06']) await fingerGap(c[l], 40); for (const l of ['BC-01', 'BC-07']) await set(c[l], { dy: 410 }) }

// Study: 40 apron on the front + seen right end, waterfall left (built-up face piece where the apron meets it).
await top(R.study, [null, MA40, MA40, null], 'Study desk 40 finished: 20mm stone (colour TBC) + 40 mitred apron on the front + right end, 600 deep, top at 750 AFFL. Waterfall end on the left at 45 deg, parallel to the 45 wall (mitred, to the floor), built up 40 where the apron meets it. Sits on the 32 end panels (cut to 710 under the apron).')
{ const c = await cabs(R.study)
  for (const l of ['BC-01', 'BC-02', 'BC-05', 'BC-06']) await set(c[l], { dy: 710 })
  // drawer: keep the 114 front below the apron — carcass 20 lower + 20 taller, 40 finger gap
  await set(c['BC-03'], { pos_z: 576, dy: 154 }); await fingerGap(c['BC-03'], 40) }

// Kitchen: already 20 + MA60 = 60 finished — notes only.
{ const t = (await sb.from('benchtop_instances').select('id,notes').eq('room_id', R.kitchen)).data[0]
  await run(sb.from('benchtop_instances').update({ notes: t.notes.replace('Kitchenette 20mm stone + 60 mitred apron', 'Kitchenette 60 finished: 20mm stone + 60 mitred apron') }).eq('id', t.id), 'kitchen notes') }
