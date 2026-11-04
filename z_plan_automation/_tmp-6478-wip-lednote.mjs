import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'cb47d462-90eb-4ba0-8e6e-ca4d978628ae'
const { data: a } = await sb.from('room_annotations').select('id,geom').eq('room_id', R).like('text', 'LED STRIP under WC-02%').single()
const r = await sb.from('room_annotations').update({ geom: { ...a.geom, at: { ...a.geom.at, y: -1505 } } }).eq('id', a.id).select('geom')
console.log(r.error?.message ?? JSON.stringify(r.data))
// what spec blocks exist in the WIP + an appliance spec block anywhere to copy
const { data: blk } = await sb.from('room_annotations').select('room_id,kind,view,geom,text,style').not('style->>block', 'is', null).limit(400)
const kinds = {}; for (const b of blk) (kinds[b.style.block] ??= []).push(b.room_id.slice(0, 8))
console.log(Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, v.length])))
console.log('WIP blocks', blk.filter(b => b.room_id === R).map(b => b.style.block))
const ap = blk.find(b => /appliance/i.test(b.style.block)); console.log(JSON.stringify(ap))
