// Golden-file check for a port: compares two folders of DXFs entity by entity (layer, closed flag,
// vertices with bulges, circles) to 0.01 mm, ignoring entity order and header/table differences.
//   node fixtures/check_dxf.mjs fixtures/dxf/05_rh_blocks  path/to/your/output/05_rh_blocks
import fs from 'node:fs'; import path from 'node:path';
function parse(text){
  const L=text.split(/\r?\n/); const ents=[]; let i=0, inEnt=false, cur=null;
  const pairs=[]; for(;i+1<L.length;i+=2) pairs.push([L[i].trim(),L[i+1].trim()]);
  for(let k=0;k<pairs.length;k++){ const [g,v]=pairs[k];
    if(g==='2'&&v==='ENTITIES'){ inEnt=true; continue; }
    if(!inEnt) continue;
    if(g==='0'&&v==='ENDSEC') break;
    if(g==='0'){ if(v==='POLYLINE'){ cur={type:'poly',layer:'',pts:[],closed:false}; ents.push(cur); }
      else if(v==='VERTEX'){ cur.pts.push({x:0,y:0,b:0}); cur._v=cur.pts[cur.pts.length-1]; }
      else if(v==='SEQEND'){ cur._v=null; }
      else if(v==='CIRCLE'){ cur={type:'circle',layer:'',x:0,y:0,r:0}; ents.push(cur); }
      else cur={type:v}; continue; }
    if(!cur) continue; const t=cur._v||cur;
    if(g==='8'&&!cur._v) cur.layer=v;
    if(g==='70'&&cur.type==='poly'&&!cur._v) cur.closed=(+v&1)===1;
    if(g==='10') t.x=+v; if(g==='20') t.y=+v; if(g==='40') t.r=+v; if(g==='42') t.b=+v; }
  return ents.filter(e=>e.type==='poly'||e.type==='circle').map(e=>{ delete e._v; return e; });
}
const key=e=>e.type==='circle'?`C|${e.layer}|${e.x.toFixed(2)}|${e.y.toFixed(2)}|${e.r.toFixed(2)}`
  :`P|${e.layer}|${e.closed}|`+e.pts.map(p=>`${p.x.toFixed(2)},${p.y.toFixed(2)},${p.b.toFixed(4)}`).join(';');
const [a,b]=process.argv.slice(2); let bad=0;
for(const f of fs.readdirSync(a).filter(f=>f.endsWith('.dxf'))){
  const pb=path.join(b,f); if(!fs.existsSync(pb)){ console.log('MISSING',f); bad++; continue; }
  const ka=parse(fs.readFileSync(path.join(a,f),'utf8')).map(key).sort(), kb=parse(fs.readFileSync(pb,'utf8')).map(key).sort();
  const onlyA=ka.filter(x=>!kb.includes(x)), onlyB=kb.filter(x=>!ka.includes(x));
  if(onlyA.length||onlyB.length){ bad++; console.log('DIFF',f,'\n  expected only:',onlyA.slice(0,4),'\n  yours only:',onlyB.slice(0,4)); } else console.log('ok  ',f);
}
for(const f of fs.readdirSync(b).filter(f=>f.endsWith('.dxf'))) if(!fs.existsSync(path.join(a,f))){ console.log('EXTRA',f); bad++; }
process.exit(bad?1:0);
