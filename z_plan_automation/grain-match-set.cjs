// Test helper (z_grain_match): put cabinets of a room into one GM1 group, or clear the room's groups.
// node gm_set.cjs <room> <label> <horizontal|vertical|none>
const fs=require('fs');const {createClient}=require('@supabase/supabase-js')
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim().replace(/^"|"$/g,'')]))
const [room,label,dir]=process.argv.slice(2)
;(async()=>{const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY);await sb.auth.signInWithPassword({email:env.AUTOMATION_EMAIL,password:env.AUTOMATION_PASSWORD})
await sb.from('cabinet_instances').update({grain_match_group_id:null}).eq('room_id',room)
await sb.from('grain_match_groups').delete().eq('room_id',room)
if(dir!=='none'){const {data:g}=await sb.from('grain_match_groups').insert({room_id:room,name:'GM1',direction:dir}).select().single()
await sb.from('cabinet_instances').update({grain_match_group_id:g.id}).eq('room_id',room).in('label',label.split(','))}
console.log('set',label,dir)})()
