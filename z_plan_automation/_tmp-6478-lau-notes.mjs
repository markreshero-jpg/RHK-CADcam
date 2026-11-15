// RHK6478 Laundry: site notes text for 1822 talls recess + ceiling 2685 / 28 shadowline (Mark 2026-11-16); list other height text.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'fc12bc7d-53ee-46ee-a302-3411f5129bcc'
const { data: anns } = await sb.from('room_annotations').select('id,view,text').eq('room_id', R).not('text', 'is', null)
for (const a of anns) {
  const t = a.text.replace('Talls recess 1824 to Nib 1', 'Talls recess 1822 to Nib 1 (13.11)')
    .replace('Ceiling 2717 off slab - 20 floor allowance (TBC) = 2697, 18 shadowline', 'Ceiling 2685 (as Kitchen, CH 13.11), 28 shadowline')
  if (t !== a.text) console.log('upd', (await sb.from('room_annotations').update({ text: t }).eq('id', a.id)).error?.message ?? 'ok')
  else if (/26\d\d|2697|2679|1824|shadow/i.test(a.text)) console.log('CHECK', a.view, a.id.slice(0, 8), JSON.stringify(a.text).slice(0, 160))
}
process.exit(0)
