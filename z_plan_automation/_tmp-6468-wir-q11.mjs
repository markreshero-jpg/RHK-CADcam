import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'dfa682a3-020b-4704-8661-3dbbd6cdf224'
const lay = (await sb.from('job_cad_layers').select('id,name,shop_layer_id').eq('project_id', '21601535-e1c8-4087-96b8-bb2506b96c3d')).data; console.log(lay)
const shop = (await sb.from('shop_cad_layers').select('id,name')).data; console.log(shop?.map(s => s.id.slice(0, 8) + ' ' + s.name).join(' | '))
const a = (await sb.from('room_annotations').select('*').eq('room_id', R).order('created_at')).data
for (const r of a.filter(r => r.user_edited_at || !(r.style?.src === 'markup-std' || ['PTO', 'HANGING RAIL'].includes(r.text))))
  console.log(r.id.slice(0, 8), r.view, r.kind, r.cad_layer_id?.slice(0, 8), r.wall_id?.slice(0, 8), JSON.stringify(r.text), JSON.stringify(r.geom).slice(0, 600))
