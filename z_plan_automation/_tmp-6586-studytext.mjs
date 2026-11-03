// Temp: study CAD note + spec block text after the corner shelf change.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'd4fdad8f-bcbf-4c38-a6ad-b6e0cee7ca8d'
const { data: wf } = await sb.from('room_annotations').select('id,text').eq('room_id', R).ilike('text', '%W/F%')
console.log(wf)
for (const a of wf) console.log((await sb.from('room_annotations').update({ text: 'OPEN CORNER SHELF\n45° OPEN FACE' }).eq('id', a.id).select('id')).error?.message ?? 'note ok')
const { data: sp } = await sb.from('room_annotations').select('text').eq('id', 'acb18523-deba-4342-b626-25cf900bae68').single()
let t = sp.text
for (const [o, n] of [
  ['500 deep, 45 deg waterfall end.', '500 deep, 40 apron on the 45 end too. Open corner shelf under the 45 end (Boston Oak, 2 fixed shelves).'],
  ['Push to open doors, finger pull drawers', 'Push to open doors, finger pull drawers. Study drawer: no handle, opens from underneath'],
]) { if (!t.includes(o)) console.log('MISSING', o); t = t.replace(o, n) }
console.log((await sb.from('room_annotations').update({ text: t }).eq('id', 'acb18523-deba-4342-b626-25cf900bae68').select('id')).error?.message ?? 'spec ok')
