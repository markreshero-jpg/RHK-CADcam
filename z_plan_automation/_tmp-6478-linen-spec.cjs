// RHK6478 linen/broom spec blocks: HANDLES line -> live {handles} field (K-Push Tech). Pass go to write.
const fs=require('fs');const {createClient}=require('@supabase/supabase-js')
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim().replace(/^"|"$/g,'')]))
;(async()=>{const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({email:env.AUTOMATION_EMAIL,password:env.AUTOMATION_PASSWORD})
const ids=['b6377e60-bed3-4e5c-af80-7ea320db6ff5','02ce23c0-9b53-454f-8bcf-f0f81daa1dc8','f1953ab4-a03b-4439-a777-d39476156f31']
const {data}=await sb.from('room_annotations').select('*').in('room_id',ids).ilike('text','%HANDLES%')
for(const a of data){console.log(a.room_id.slice(0,8),JSON.stringify(Object.fromEntries(Object.entries(a).filter(([k])=>!['text','id','room_id','created_at','updated_at'].includes(k)))))
 const nt=a.text.replace(/HANDLES\n[Pp]ush [Tt]o [Oo]pen\n/,'HANDLES\n{handles}\n')
 if(nt!==a.text&&process.argv[2]==='go'){const {error}=await sb.from('room_annotations').update({text:nt}).eq('id',a.id);console.log(error?error.message:'  -> {handles}')}}
})()
