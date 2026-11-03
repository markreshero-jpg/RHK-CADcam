// RHK6478 Laundry: room finishes before the draw - bases / talls 2 Pac Flat 18 (colour TBC), overheads Lx Sublime Teak Chalk, sharknose handles.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = 'fc12bc7d-53ee-46ee-a302-3411f5129bcc'
const PAC = 'bd2b9178-5b77-4a52-b7a1-cc3765ed4bb4', PAC_TBC = '827dfe38-7cb7-4c02-aa87-6916b09876f5', PAC_BOARD = 'b07a7e40-facd-4cdf-8856-60712e940b44'
const LX = '8ffd3162-6b06-4abf-9f00-e05caf04eb79', TEAK = '5fdb0fa7-e212-49aa-b8e6-044210033c85', TEAK_BOARD = '67ecbeff-98ac-41e1-9b1a-618a5bf6a96b'
const SHARK = '243a2e18-5966-409f-8fec-f056006d5a61'
chk('room', await sb.from('rooms').update({
  base_door_style_id: PAC, base_door_colour_id: PAC_TBC, tall_door_style_id: PAC, tall_door_colour_id: PAC_TBC,
  wall_door_style_id: LX, wall_door_colour_id: TEAK, handle_schedule_id: SHARK,
}).eq('id', R))
chk('rm del', await sb.from('room_materials').delete().eq('room_id', R))
chk('rm ins', await sb.from('room_materials').insert([
  { room_id: R, assembly_class: 'base', material_role: 'exposed', material_id: PAC_BOARD },
  { room_id: R, assembly_class: 'tall', material_role: 'exposed', material_id: PAC_BOARD },
  { room_id: R, assembly_class: 'wall', material_role: 'exposed', material_id: TEAK_BOARD },
]))
console.log(chk('check', await sb.from('materials').select('id,name').in('id', [PAC_BOARD, TEAK_BOARD])))
