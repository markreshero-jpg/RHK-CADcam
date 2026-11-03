// RHK6586 kitchenette (Mark 2026-10-31): pantry down to 2120 + painted MDF bulkhead over it (WC-12 on the
// island-type "Pantry BH line"); overheads WC-04 / WC-01 / WC-02 = 5 equal doors (660 / 660 / 330).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
{ const { error } = await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD }); if (error) throw error }
const ROOM = 'a496c328-cfda-4f74-8c6d-175edd8e5907', MDF18 = '3b486c8f-ee1c-494d-b462-2dd206e3999d'
const C = Object.fromEntries((await sb.from('cabinet_instances').select('*').eq('room_id', ROOM)).data.map(c => [c.label, c]))
const upd = async (l, patch) => { const { error } = await sb.from('cabinet_instances').update(patch).eq('id', C[l].id); console.log(error ? 'ERR ' + l + ' ' + error.message : 'ok ' + l) }
const r45 = Math.SQRT1_2

// Pantry: 2120 like the other talls, false-panel row gone.
const fg = C['TC-02'].face_grid
await upd('TC-02', { dy: 2120, face_grid: { ...fg, rows: [{ row_index: 0, height_locked: false }], zones: fg.zones.filter(z => z.row_index === 0) } })

// Pantry bulkhead: fascia front on the pantry door face (y 1139.3 = pantry front 1120.8 + 18.5), back line 300 behind.
// Left end scribed 45 to the 45 wall (back meets it at (-839.3, 839.3)); right end 22.5 → 135 mitre with WC-07.
const bh = C['WC-08'].bulkhead
const xR = 877.5 - 1139.3                                  // WC-07 fascia front (x + y = 620.5·√2) meets y 1139.3
await upd('WC-12', { pos_x: -1139.3, pos_y: 839.3, dx: +(xR + 1139.3).toFixed(1), dz: 300, material_overrides: { exposed: MDF18 },
  notes: 'Pantry bulkhead (Mark 2026-10-31): painted MDF, fascia on the pantry door face, left end scribed 45 to the wall, right end mitred 22.5 to WC-07.',
  bulkhead: { ...bh, front: 'carcase', left: { on: false, depth: 600, joint: 'mitre', angle: 45 }, right: { on: false, depth: 600, joint: 'mitre', angle: 22.5 } } })
// WC-07: front starts where it meets the pantry fascia (offset 614.2 along Wall 1), left end 22.5.
const off = ((xR + 1134.93) * r45 + (1139.3 - 1134.93) * -r45)
const shift = 622 - off
await upd('WC-07', { pos_x: +(-1134.93 + off * r45).toFixed(3), pos_y: +(1134.93 - off * r45).toFixed(3), dx: +(686 + shift).toFixed(1),
  bulkhead: { ...C['WC-07'].bulkhead, left: { on: false, depth: 350, joint: 'mitre', angle: 22.5 } } })
console.log('WC-07 offset', off.toFixed(1), 'shift', shift.toFixed(1))

// Overheads: 5 equal 330 doors across 268.5 – 1918.5.
const grid = (n, hinge) => ({ cols: [...Array(n).keys()].map(i => ({ col_index: i, width_locked: false })), rows: [{ row_index: 0, height_locked: false }],
  zones: n === 2 ? [{ col_index: 0, row_index: 0, face_type: 'door', hinge_side: 'left' }, { col_index: 1, row_index: 0, face_type: 'door', hinge_side: 'right' }]
                 : [{ col_index: 0, row_index: 0, face_type: 'door', hinge_side: hinge }] })
await upd('WC-04', { pos_x: 268.5, dx: 660, face_grid: grid(2) })
await upd('WC-01', { pos_x: 928.5, dx: 660, face_grid: grid(2) })
await upd('WC-02', { pos_x: 1588.5, dx: 330, face_grid: grid(1, 'right') })

// PTO tags on Wall 2 overheads (y -1540): pairs at the meeting stiles 598.5 / 1258.5, single on WC-02's left edge.
const pto = (await sb.from('room_annotations').select('id,geom').eq('room_id', ROOM).eq('text', 'PTO').eq('wall_id', C['WC-04'].wall_id)).data
  .filter(a => a.geom.at.y === -1540).sort((a, b) => a.geom.at.x - b.geom.at.x)
const xs = [527, 607, 1187, 1267, 1597]
for (const [i, a] of pto.entries()) { const { error } = await sb.from('room_annotations').update({ geom: { ...a.geom, at: { ...a.geom.at, x: xs[i] } } }).eq('id', a.id); console.log(error ? 'ERR pto' : `pto ${a.geom.at.x} → ${xs[i]}`) }
