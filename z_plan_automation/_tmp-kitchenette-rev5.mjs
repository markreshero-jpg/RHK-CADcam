// Temp: RHK6586 kitchenette rev 5 (Mark 2026-10-28): overhead under panel 16.5, shaped round the range cupboard corner.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
{ const { error } = await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD }); if (error) throw error }
const ROOM = 'a496c328-cfda-4f74-8c6d-175edd8e5907'
const { data: cabs } = await sb.from('cabinet_instances').select('id,label,rule_overrides').eq('room_id', ROOM).in('label', ['WC-01', 'WC-02', 'WC-04', 'WC-09'])
const C = Object.fromEntries(cabs.map(c => [c.label, c]))
const ok = (w, { error }) => console.log(error ? 'ERR ' + w + ' ' + error.message : 'ok ' + w)
for (const l of ['WC-01', 'WC-02', 'WC-04'])
  ok(l, await sb.from('cabinet_instances').update({ rule_overrides: { ...C[l].rule_overrides, SCRBT: 16.5 } }).eq('id', C[l].id))
const W = 2128.5, D = 362, cx = 210, fx = 151.9   // same corner as WC-04 (tall side x - y = -420.06)
const seg = (p0, p1, id, role) => ({ type: 'line', p0, p1, p0_expr: { x: String(p0.x), y: String(p0.y) }, edge: { id, role } })
const F = [{ x: cx, y: 0 }, { x: W, y: 0 }, { x: W, y: D }, { x: fx, y: D }, { x: 0, y: cx }]
const ids = [['back', 'back'], ['right', 'side'], ['front', 'front'], ['angle', 'side'], ['back2', 'back']]
ok('WC-09', await sb.from('cabinet_instances').update({ dx: W, dy: 16.5,
  footprint: { params: {}, segments: F.map((p, i) => seg(p, F[(i + 1) % F.length], ...ids[i])) },
  notes: 'Under panel 16.5 under WC-04 / WC-01 / WC-02 (overheads scribed up 16.5); cut round the range cupboard corner; rangehood cut-out TBC' }).eq('id', C['WC-09'].id))
// Part shape: flat custom part frame x = depth (front = 362), y = along the wall.
const { data: [cp] } = await sb.from('cabinet_custom_parts').select('id').eq('cabinet_instance_id', C['WC-09'].id)
const P = F.map(p => ({ x: p.y, y: p.x }))
const band = [false, false, true, false, false]   // the front only
const segments = P.map((p, i) => ({ type: 'line', p0: p, p1: P[(i + 1) % P.length], edge: { band: band[i], profile: 'square' } }))
const key = `custom_${cp.id}`
await sb.from('part_shape_overrides').delete().eq('cabinet_id', C['WC-09'].id).eq('part_key', key)
ok('shape', await sb.from('part_shape_overrides').insert({ cabinet_id: C['WC-09'].id, part_key: key, revision: 1, segments,
  meta: { note: 'Cut round the range cupboard corner on the 45 (RHK6586 kitchenette)', bounds: { minX: 0, minY: 0, maxX: D, maxY: W }, closed: true,
    sizeSlots: { up: 'sh', across: 'sw' }, baseAtSave: { h: D, w: W }, bandedEdges: 1, originShift: { dx: 0, dy: 0 }, segmentCount: 5,
    tapeLengthMM: Math.round(W - fx) } }))
