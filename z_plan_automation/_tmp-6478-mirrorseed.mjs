// z_faced_doors seed: blank 16.5 Whiteboard + 4mm Mirror, colour range "Mirror Door" (whiteboard back), style "Mirror Door",
// plus the small brushed nickel lip pull + handle schedule (RHK6478 Bath Linen, Mark 2026-11-01).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const one = async (q, what) => { const { data, error } = await q; if (error) throw new Error(`${what}: ${error.message}`); console.log(what, data.id); return data }
const cat = await one(sb.from('door_catalogue').insert({ name: '16mm Whiteboard + 4mm Mirror', thickness_mm: 16.5, construction: 'solid_panel', substrate: 'Whiteboard',
  description: 'Whiteboard door cut on the CNC, 4mm mirror cut to the same size and stuck on its face (bought in)', facing_name: '4mm Mirror', facing_thickness_mm: 4,
  edge_band_top: true, edge_band_bottom: true, edge_band_left: true, edge_band_right: true, sort_order: 80 }).select().single(), 'blank')
const range = await one(sb.from('door_material_schedules').insert({ name: 'Mirror Door', brand: 'Bought-in mirror', description: '16.5 Whiteboard back + 4mm mirror face', sort_order: 80 }).select().single(), 'range')
const colour = await one(sb.from('door_schedule_materials').insert({ schedule_id: range.id, colour_name: 'Mirror (Whiteboard back)', brand: 'Bought-in mirror', finish: 'Mirror',
  material_id: 'd081b2a1-38a8-472c-a415-f179699a1347', edgeband_id: '95cf1afd-2c19-4df5-b491-4af91295c570', is_default: true, is_active: true, sort_order: 0 }).select().single(), 'colour')
await one(sb.from('door_styles').insert({ name: 'Mirror Door', door_catalogue_id: cat.id, door_material_schedule_id: range.id, default_material_id: colour.id,
  description: '16.5 Whiteboard + 4mm mirror face (z_faced_doors)', is_active: true, sort_order: 80 }).select().single(), 'style')
const lip = await one(sb.from('hardware_handles').insert({ name: 'Lip Pull 50 Brushed Nickel (small)', handle_type: 'Lip pull', grip_kind: 'hardware', length: 50, finish: 'Brushed Nickel',
  active: true, notes: 'Small lip pull on the door edge, screwed on - not machine drilled (RHK6478)' }).select().single(), 'lip pull')
const sched = await one(sb.from('handle_schedules').insert({ name: 'Lip Pull 50 Brushed Nickel', description: 'Small brushed nickel lip pull on the meeting / non-hinged edge', active: true, is_default: false, handle_id: lip.id }).select().single(), 'schedule')
const { error } = await sb.from('handle_schedule_entries').insert(['door_base', 'door_wall', 'door_tall', 'drawer'].map(role =>
  ({ schedule_id: sched.id, role, handle_id: lip.id, offset_from_edge_mm: role === 'door_tall' ? 1262 : 50, inset_from_side_mm: role === 'drawer' ? null : 0, orientation: role === 'drawer' ? 'horizontal' : 'vertical' })))
console.log('entries', error?.message ?? 'ok')
