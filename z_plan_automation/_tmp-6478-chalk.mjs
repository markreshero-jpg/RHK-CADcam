// RHK6478 (Mark 2026-11-01): "Polytec Woodmatt TBA" -> Lx Sublime Teak Chalk throughout. New colour on the Laminex Colour 16mm range.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const { data: sib } = await sb.from('materials').select('*').eq('id', '956250dc-77e8-4d58-988d-99e4629e4f7f').single()
const { id, created_at, updated_at, ...base } = sib
const { data: mat, error: e1 } = await sb.from('materials').insert({ ...base, name: 'LX Colour 16mm – Sublime Teak (Chalk)', colour_name: 'Sublime Teak', finish: 'Chalk', brand: 'Laminex',
  has_grain: true, grain_direction: 'vertical', face_colour: '#8b6a4b', back_colour: base.back_colour, edge_colour: '#8b6a4b', is_default_colour: false, texture_path: null }).select().single()
if (e1) throw e1
console.log('material', mat.id)
const { data: col, error: e2 } = await sb.from('door_schedule_materials').insert({ schedule_id: 'e8128310-48ff-49c3-8c22-1e46e6d150f2', colour_name: 'Sublime Teak', colour_code: null, brand: 'Laminex', finish: 'Chalk',
  grain_direction: 'vertical', material_id: mat.id, edgeband_id: '972c661c-7e8b-45d2-8584-7f6cf8c4d411', is_default: false, is_active: true, sort_order: 50 }).select().single()
if (e2) throw e2
console.log('colour', col.id)
