// RHK6586 2026-11-20 (Mark): pantry front on the 618 site marks. Mark measured 618 from the TC-03 / 45 wall corner
// along the wall and along TC-03's face to the pantry front (drawing had 614.9). Pantry already cut, so TC-02 keeps its
// size and slides forward 2.17 (footprint translated); TC-07 / TC-08 face fillers widen 138.5 -> 140.67 so their front
// corners touch the marks; KICK 3 moves forward 2.17 (same 772.64, now 7.8 oversize each end). WC-12 bulkhead left.
// args: snap <file> | go
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer-core'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const must=r=>{if(r.error)throw new Error(r.error.message);return r.data}
const ROOM='a496c328-cfda-4f74-8c6d-175edd8e5907', TC02='b5a2e6b5-1cc5-4a3b-a5e3-08181b770137', L='c5f9b046-a70d-43a1-a52e-b6cdd6a2c157', R='1b80e509-bd9e-4499-bb53-a5548bbe60f8'
const S=Math.SQRT1_2, r3=v=>Math.round(v*1000)/1000
const FACE0=1129.93, FACE=r3(695.108+618*S), DY=r3(FACE-FACE0), DUV=r3(DY*S)   // world +y DY = local (-DUV, +DUV)
const TCX=r3(FACE-1390.216), FW=r3(TCX-(-398.79))
console.log({FACE,DY,DUV,TCX,fillerW:FW,leftX:-FACE})
const kick=must(await sb.from('cabinet_instances').select('id,pos_x,pos_y,dx,dz').eq('room_id',ROOM).eq('label','KICK 3').single())
const snap=async()=>{const out={}
 for(const id of [TC02,L,R,kick.id]){out[id]={cab:must(await sb.from('cabinet_instances').select('label,pos_x,pos_y,pos_z,dx,dy,dz,footprint').eq('id',id).single()),
  parts:must(await sb.from('case_parts').select('*').eq('cabinet_instance_id',id)).map(p=>[p.part_key??p.name,+(+p.dx).toFixed(2),+(+p.dy).toFixed(2),+(+p.dz).toFixed(2)]).sort((a,b)=>String(a).localeCompare(String(b))),
  custom:must(await sb.from('cabinet_custom_parts').select('name,dx,dy,dz').eq('cabinet_instance_id',id)),
  kick:must(await sb.from('toekick_parts').select('*').eq('cabinet_instance_id',id)).map(p=>[p.part_key,+(+p.dx).toFixed(2),+(+p.dy).toFixed(2)])}}
 return out}
if(process.argv[2]==='snap'){fs.writeFileSync(process.argv[3],JSON.stringify(await snap(),null,1));process.exit(0)}
if(process.argv[2]!=='go')process.exit(0)
const tc=must(await sb.from('cabinet_instances').select('footprint').eq('id',TC02).single())
if(Math.abs(tc.footprint.segments[0].p0.y)>0.01)throw new Error('TC-02 footprint already moved')
const fp=structuredClone(tc.footprint)
for(const s of fp.segments)for(const p of [s.p0,s.p1]){p.x=r3(p.x-DUV);p.y=r3(p.y+DUV)}
const note=`Pantry (Mark 2026-11-20): door face on the 618 site marks (618 from the TC-03 / wall corner each way), carcass as cut (592.64), slid 2.17 forward so the backs stand 1.5 off the 45 wall + TC-03. Ends square to the doors (120 deep). TFKW face fillers either side 140.67, scribe 45. 4 adj shelves EQ, PTO`
must(await sb.from('cabinet_instances').update({footprint:fp,notes:note}).eq('id',TC02).select('id'))
must(await sb.from('cabinet_instances').update({pos_x:-FACE,pos_y:r3(991.43+DY),dx:FW}).eq('id',L).select('id'))
must(await sb.from('cabinet_instances').update({pos_x:-398.79,pos_y:r3(991.43+DY),dx:FW}).eq('id',R).select('id'))
for(const id of [L,R]) must(await sb.from('cabinet_custom_parts').update({dx:FW}).eq('cabinet_instance_id',id).eq('name','Filler').select('id'))
const kgeom={pos_x:kick.pos_x,pos_y:r3(991.43+DY),dx:kick.dx,dz:120}
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const br=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',args:['--no-first-run','--disable-gpu'],protocolTimeout:900000})
const open=async()=>{const pg=await br.newPage();pg.on('dialog',d=>d.dismiss());await pg.setExtraHTTPHeaders({'x-dev-automation':'1'});await pg.goto(`http://localhost:3001/canvas/${ROOM}`,{waitUntil:'domcontentloaded',timeout:240000});await pg.waitForFunction('!!window.__canvasApi',{timeout:240000});await sleep(4000);return pg}
try{let pg=await open()
 const u=async(id,p)=>{const r=await pg.evaluate(([i,x])=>window.__canvasApi.updateCabinet(i,x),[id,p]).catch(e=>'ERR '+e.message);console.log(id.slice(0,8),JSON.stringify(r)?.slice(0,100));await sleep(1500)}
 await u(L,{dx:FW});await u(R,{dx:FW});await u(TC02,{dz:602})
 await pg.close()
 must(await sb.from('cabinet_instances').update(kgeom).eq('id',kick.id).select('id'))
 pg=await open()
 console.log('kick',JSON.stringify(await pg.evaluate(i=>window.__canvasApi.updateCabinet(i,{dz:120}),kick.id).catch(e=>e.message))?.slice(0,100));await sleep(2500)
 const iss=await pg.evaluate(()=>window.__canvasApi.getIssues());for(const c of iss)if(['TC-02','TC-07','TC-08','KICK 3'].includes(c.label))for(const e of [...c.errors,...c.warnings])console.log(c.label,e.code,e.message)
}finally{await br.close()}
