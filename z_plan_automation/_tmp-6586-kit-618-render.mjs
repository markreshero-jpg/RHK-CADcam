// RHK6586 2026-11-20 read-only: render kitchenette pantry geometry + Mark's markups to PNG
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer-core'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const ROOM='a496c328-cfda-4f74-8c6d-175edd8e5907'
const [x0,y0,x1,y1]=process.argv.slice(2,6).map(Number), out=process.argv[6]
const a=(await sb.from('room_annotations').select('kind,geom,text,cad_layer_id').eq('room_id',ROOM).eq('view','plan')).data
const W=1400,s=W/(x1-x0),H=Math.round((y1-y0)*s),T=p=>`${((p.x-x0)*s).toFixed(1)},${((p.y-y0)*s).toFixed(1)}`
const S=Math.SQRT1_2
const cab=(ox,oy,pts)=>pts.map(([u,v])=>({x:ox+(u+v)*S,y:oy+(v-u)*S}))
let g=''
// walls
g+=`<polyline fill="none" stroke="#888" stroke-width="6" points="${T({x:-1134.93,y:1134.93})} ${T({x:0,y:0})} ${T({x:1935,y:0})}"/>`
// TC-03 33 x 602
g+=`<polygon fill="#cfc" stroke="green" points="${cab(-695.108,695.108,[[0,0],[33,0],[33,602],[0,602]]).map(T).join(' ')}"/>`
// TC-02 footprint
const fp=[[182.94,0],[602,0],[602,419.06],[517.15,503.91],[98.09,84.85]]
g+=`<polygon fill="#ccf" stroke="blue" points="${cab(-1120.788,1120.788,fp).map(T).join(' ')}"/>`
// fillers TC-07/TC-08 (world rect y 1111.43..1129.93? dz 120 from 991.43)
for(const [px,dx] of [[-1129.93,138.5],[-398.79,138.5]]) g+=`<rect fill="#fcc" stroke="red" x="${(px-x0)*s}" y="${(991.43-y0)*s}" width="${dx*s}" height="${138.5*s}" opacity="0.5"/>`
g+=`<line stroke="purple" stroke-dasharray="6" x1="0" x2="${W}" y1="${(1129.93-y0)*s}" y2="${(1129.93-y0)*s}"/>`
for(const x of a){ const mk=x.cad_layer_id==='92754090-3956-4574-be95-06b1ec747685'
 if(x.geom.pts) g+=`<polyline fill="none" stroke="${mk?'black':'#bbb'}" stroke-width="${mk?3:1}" points="${x.geom.pts.map(T).join(' ')}"/>`
 if(x.kind==='text') g+=`<text x="${(x.geom.at.x-x0)*s}" y="${(x.geom.at.y-y0)*s}" font-size="22" fill="${mk?'black':'#bbb'}">${x.text}</text>`}
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="white"/>${g}</svg>`
const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new'})
const pg=await b.newPage();await pg.setViewport({width:W,height:H});await pg.setContent(svg);await pg.screenshot({path:out});await b.close()
