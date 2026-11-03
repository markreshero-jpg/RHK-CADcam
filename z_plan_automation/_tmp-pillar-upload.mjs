import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const P = 'finista/Finista_Oval_Centre_Pillar_Chrome.glb'
const up = await sb.storage.from('accessory-models').upload(P, fs.readFileSync('z_accessories/models/hanging rail/Finista_Oval_Centre_Pillar_Chrome.glb'), { upsert: true, contentType: 'model/gltf-binary' })
console.log('upload', up.error?.message ?? 'ok')
if (!up.error) {
  const url = sb.storage.from('accessory-models').getPublicUrl(P).data.publicUrl + '?v=2'
  const r = await sb.from('hardware_accessories').update({ model_url: url, depth_mm: 10 }).eq('id', '4b8e3a1c-454e-4ea5-8767-d3b4d15c4743').select('model_url,width_mm,depth_mm,height_mm')
  console.log(r.error?.message ?? JSON.stringify(r.data))
}
