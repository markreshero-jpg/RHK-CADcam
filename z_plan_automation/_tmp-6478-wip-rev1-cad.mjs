// RHK6478 WIP rev 1: fridge opening 950 -> 932 (TEPF TC-07 right of TC-02): patch the dim + notes in place (no delete / reinsert).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'cb47d462-90eb-4ba0-8e6e-ca4d978628ae'
const { data: rows, error } = await sb.from('room_annotations').select('id,kind,text,geom').eq('room_id', R).eq('view', 'elevation')
if (error) throw error
const inCab = (left, width) => ({ x: left + 30, w: (width - 60) / 20 })
for (const r of rows) {
  let patch = null
  if (r.kind === 'dim' && r.geom?.p1?.x === 268 && r.geom?.p2?.x === 1218) patch = { geom: { ...r.geom, p1: { ...r.geom.p1, x: 286 } } }
  else if (r.kind === 'text' && Math.abs((r.geom?.at?.x ?? 0) - 298) < 0.5) patch = { geom: { ...r.geom, at: { ...r.geom.at, x: inCab(286, 932).x }, width: inCab(286, 932).w }, text: r.text.replace('Opening 950 x 1850', 'Opening 932 x 1850') }
  if (!patch) continue
  const u = await sb.from('room_annotations').update(patch).eq('id', r.id)
  if (u.error) throw u.error
  console.log('patched', r.kind, (patch.text ?? '').slice(0, 60))
}
