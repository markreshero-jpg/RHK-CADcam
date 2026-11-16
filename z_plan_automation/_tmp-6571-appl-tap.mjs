// RHK6571 Kitchen: mixer -> our standard gooseneck (Abey Lucia library item), spec line "Standard gooseneck mixer" (Mark 2026-11-16).
// Same pose; the one-off Linkware Elle library row (made earlier today, now unused) set inactive.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const BODY = ['category', 'kind', 'name', 'brand', 'model_no', 'width', 'depth', 'height', 'mount', 'colour', 'model_url', 'model_format', 'model_scale', 'model_rot_x', 'model_rot_y', 'model_off_x', 'model_off_y', 'model_off_z', 'cutout_shape', 'cutout_w', 'cutout_d', 'cutout_radius', 'cutout_off_x', 'cutout_off_y', 'cut_benchtop', 'bench_drop', 'plan_shape', 'elev_shape', 'resizable', 'stretch']
const lucia = chk('l', await sb.from('fixture_catalog').select('*').eq('id', '2d62af70-1116-49e5-97d7-9658d49d6af9').single())
chk('tap', await sb.from('room_fixtures').update({ ...Object.fromEntries(BODY.map(k => [k, lucia[k]])), catalog_id: lucia.id, label: 'Standard gooseneck mixer' }).eq('id', '4e8d8ddc-12cb-42d4-aff0-8218951aa98c'))
chk('cat', await sb.from('fixture_catalog').update({ active: false }).eq('id', '1e2cbada-0000-0000-0000-000000000000'.slice(0, 0) || (await sb.from('fixture_catalog').select('id').eq('name', 'Linkware Elle Stainless Steel Project Sink Mixer').single()).data.id))
console.log('ok')
