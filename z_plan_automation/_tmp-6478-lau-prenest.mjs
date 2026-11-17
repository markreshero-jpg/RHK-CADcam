// RHK6478 Laundry pre-nest fixes (Mark 2026-11-17):
//  1. Long 2pac panels/fillers TC-01 / TC-02 / TC-05 / TC-09 (2555) split at 2300 into bottom + top
//     custom parts, join edges untaped, part comment "JOIN" on both (TC-06 2655 left whole).
//  2. Back / wall edge untaped on panels + fillers (side panels: edge_left = back; front fillers: the
//     end against the wall / nib).
//  3. PTO doors -> Furnware K-Push Tech via a new handle schedule (the shop "Push To Open" one untouched).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const ROOM = 'fc12bc7d-53ee-46ee-a302-3411f5129bcc'
const die = (m, e) => { if (e) { console.log('ERR', m, e.message); process.exit(1) } }

const { data: cabs, error: ce } = await sb.from('cabinet_instances').select('id,label,part_comments,hardware_overrides').eq('room_id', ROOM); die('cabs', ce)
const byLabel = Object.fromEntries(cabs.map(c => [c.label, c]))
const { data: parts, error: pe } = await sb.from('cabinet_custom_parts').select('*').in('cabinet_instance_id', cabs.map(c => c.id)); die('parts', pe)
const partOf = l => { const ps = parts.filter(p => p.cabinet_instance_id === byLabel[l].id && /panel|filler/i.test(p.name)); if (ps.length !== 1) throw new Error(`${l}: ${ps.length} panel parts`); return ps[0] }

// 2. Back / wall edge untaped.
const UNTAPE = { 'TC-02': 'edge_left', 'TC-05': 'edge_left', 'TC-06': 'edge_left', 'TC-12': 'edge_left', 'BC-03': 'edge_left',
  'TC-01': 'edge_left', 'BC-06': 'edge_right', 'TC-09': 'edge_right', 'TC-10': 'edge_left', 'TC-11': 'edge_right' }
const untape = {}
for (const [l, e] of Object.entries(UNTAPE)) {
  const p = partOf(l); untape[l] = e
  const { error } = await sb.from('cabinet_custom_parts').update({ [e]: false, updated_at: new Date().toISOString() }).eq('id', p.id); die(l, error)
  console.log(`${l} ${p.name}: ${e} untaped`)
}

// 1. Split at 2300.
const CUT = 2300
for (const l of ['TC-01', 'TC-02', 'TC-05', 'TC-09']) {
  const p = partOf(l), ex = p.expressions ?? {}
  const yExpr = ex.y ?? '0', dyExpr = ex.dy ?? String(p.dy)
  const base = p.name
  const { error: ue } = await sb.from('cabinet_custom_parts').update({
    name: `${base} (split bottom)`, dy: CUT, edge_top: false,
    expressions: { ...ex, dy: String(CUT) }, updated_at: new Date().toISOString(),
  }).eq('id', p.id); die(l + ' bottom', ue)
  const { id: _i, created_at: _c, updated_at: _u, ...rest } = p
  const top = { ...rest, [untape[l]]: false, name: `${base} (split top)`, y: Number(p.y) + CUT, dy: Number(p.dy) - CUT,
    edge_top: p.edge_top, edge_bottom: false, sort_order: (p.sort_order ?? 0) + 1,
    expressions: { ...ex, y: `${yExpr} + ${CUT}`, dy: `${dyExpr} - ${CUT}` } }
  const { data: ins, error: ie } = await sb.from('cabinet_custom_parts').insert(top).select('id').single(); die(l + ' top', ie)
  const c = byLabel[l]
  const comments = { ...(c.part_comments ?? {}),
    [`custom_${p.id}`]: `JOIN · SPLIT BOTTOM ${CUT}, JOIN TO THE TOP PIECE ABOVE`,
    [`custom_${ins.id}`]: `JOIN · SPLIT TOP ${Number(p.dy) - CUT}, JOIN TO THE ${CUT} PIECE BELOW` }
  const { error: cme } = await sb.from('cabinet_instances').update({ part_comments: comments }).eq('id', c.id); die(l + ' comments', cme)
  console.log(`${l}: ${p.dy} -> ${CUT} + ${Number(p.dy) - CUT}, JOIN comments`)
}

// 3. K-Push Tech handle schedule.
const KPUSH = '3b00f8ae-4b4c-41c1-8973-b1225b899465'
let { data: sched } = await sb.from('handle_schedules').select('id').eq('name', 'Push To Open – K-Push Tech').maybeSingle()
if (!sched) {
  const { data, error } = await sb.from('handle_schedules').insert({ name: 'Push To Open – K-Push Tech', active: true, is_default: false, handle_id: KPUSH,
    description: 'Push-to-open on every door + drawer: Furnware K-Push Tech Long Concealed (buffer), White DPC5B.WH.FG' }).select('id').single(); die('schedule', error)
  sched = data
  const { data: src } = await sb.from('handle_schedule_entries').select('role,orientation,height_aff_mm,inset_from_side_mm,offset_from_edge_mm').eq('schedule_id', '9440a3f0-63db-4085-9042-1c728298b49a')
  const { error: ee } = await sb.from('handle_schedule_entries').insert(src.map(e => ({ ...e, schedule_id: sched.id, handle_id: KPUSH }))); die('entries', ee)
}
for (const c of cabs.filter(c => c.hardware_overrides?.handle_schedule_id === '9440a3f0-63db-4085-9042-1c728298b49a')) {
  const { error } = await sb.from('cabinet_instances').update({ hardware_overrides: { ...c.hardware_overrides, handle_schedule_id: sched.id } }).eq('id', c.id); die(c.label, error)
  console.log(`${c.label}: handle schedule -> K-Push Tech`)
}
process.exit(0)
