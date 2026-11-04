// RHK6478 Kitchen: TALL DRAWER / BIN notes down to 330 AFF, clear of the Site notes text.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'dd6c9440-6664-4e87-8ea9-4d88b7a9b1b6'
for (const t of ['TALL DRAWER', 'BIN']) {
  const { data: a } = await sb.from('room_annotations').select('id,geom').eq('room_id', R).eq('text', t).single()
  const r = await sb.from('room_annotations').update({ geom: { ...a.geom, at: { ...a.geom.at, y: -330 } } }).eq('id', a.id); console.log(t, r.error?.message ?? 'ok')
}
{
  const { data: a } = await sb.from('room_annotations').select('id,geom').eq('room_id', R).eq('text', 'MICROWAVE (model TBC) on the 1550 shelf, behind the pocket doors').maybeSingle()
  if (a) { const r = await sb.from('room_annotations').update({ text: 'MICROWAVE', geom: { ...a.geom, at: { x: 1060, y: -1660 }, width: 30 } }).eq('id', a.id); console.log('mw note', r.error?.message ?? 'ok') }
}
