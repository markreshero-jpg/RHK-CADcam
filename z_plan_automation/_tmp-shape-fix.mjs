// Temp: turn the RHK6586 shape overrides into the horizontal shape frame (x along the part, y DOWN from the front).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
{ const { error } = await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD }); if (error) throw error }
const ids = ['ac121c56-da51-4828-a3ac-04a31d3483cf', 'b2cfbf0d-777c-41d1-9fa5-f106c4b39e42', '7dc37d69-aab4-405e-8ae1-0276d2bf406d']
const { data } = await sb.from('part_shape_overrides').select('id,segments,meta').in('id', ids)
for (const o of data) {
  const D = o.meta.bounds.maxX                         // old x = depth (front at D)
  const t = p => ({ x: p.y, y: Math.round((D - p.x) * 1000) / 1000 })
  const segments = o.segments.map(s => ({ ...s, p0: t(s.p0), p1: t(s.p1) }))
  const meta = { ...o.meta, bounds: { minX: 0, minY: 0, maxX: o.meta.bounds.maxY, maxY: D } }
  const { error } = await sb.from('part_shape_overrides').update({ segments, meta }).eq('id', o.id)
  console.log(error ? 'ERR ' + error.message : 'ok', o.id.slice(0, 8), JSON.stringify(segments.map(s => [s.p0.x, s.p0.y])))
}
