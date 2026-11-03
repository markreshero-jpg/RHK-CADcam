// RHK6542 Danny's Robe rev4b: AV shelf setback 22 (2 clear of the flap's back).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '830e087b-d817-4843-b766-5fbdd8ee6c4a'
const { data: c } = await sb.from('cabinet_instances').select('id,internal_grid').eq('room_id', R).eq('label', 'TC-03').single()
const t = c.internal_grid.tree
t.children[0].section.fittings = t.children[0].section.fittings.map(f => f.type === 'fixed_shelf' ? { ...f, setback_front: 22 } : f)
console.log((await sb.from('cabinet_instances').update({ internal_grid: { ...c.internal_grid, tree: t } }).eq('id', c.id)).error?.message ?? 'ok')
