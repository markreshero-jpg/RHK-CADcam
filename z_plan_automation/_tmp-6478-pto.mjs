// "Push To Open" handle schedule: every role -> the PTO product (as the sharknose schedule's door_tall row).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const S = '9440a3f0-63db-4085-9042-1c728298b49a', PTO = 'b199eb9d-a6e0-4b5f-95f6-c751f187db6c'
const { data: prod } = await sb.from('hardware_handles').select('*').eq('id', PTO).single()
console.log('product', prod?.name, prod?.grip_kind)
console.log((await sb.from('handle_schedules').update({ description: 'Push-to-open on every door + drawer (no handles)', active: true, is_default: false, handle_id: PTO }).eq('id', S)).error?.message ?? 'schedule ok')
await sb.from('handle_schedule_entries').delete().eq('schedule_id', S)
const r = await sb.from('handle_schedule_entries').insert(['door_base', 'door_wall', 'door_tall', 'drawer'].map(role =>
  ({ schedule_id: S, role, handle_id: PTO, offset_from_edge_mm: 0, inset_from_side_mm: null, orientation: role === 'drawer' ? 'horizontal' : 'vertical' })))
console.log(r.error?.message ?? 'entries ok')
