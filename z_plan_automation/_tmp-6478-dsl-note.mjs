// DS Linen: no back cut-out (Mark) - tundish shown on the elevation only; spec + note text updated.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'f1953ab4-a03b-4439-a777-d39476156f31'
const { data: rows } = await sb.from('room_annotations').select('id,text').eq('room_id', R).eq('kind', 'text')
for (const r of rows) {
  let t = r.text
  if (t.startsWith('TUNDISH')) t = 'TUNDISH - keep visible'
  t = t.replace('Tundish 1652-1722 H, 45-180 in (TBC)', 'Tundish 1652-1722 H, 45-180 from LH wall\n(shown on elevation, no cut-out)')
  if (t !== r.text) console.log((await sb.from('room_annotations').update({ text: t }).eq('id', r.id)).error?.message ?? 'updated ' + t.split('\n')[0])
}
