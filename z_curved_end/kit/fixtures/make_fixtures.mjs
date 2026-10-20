// Regenerates fixtures/expected.json and fixtures/dxf/<case>/*.dxf from the reference core.
// node fixtures/make_fixtures.mjs
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { DEF, dxfParts, partName } from '../reference/curved_end_core.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const cases=JSON.parse(fs.readFileSync(path.join(here,'cases.json'),'utf8'));
const r2=v=>Math.round(v*100)/100;
const out={};
for(const k of cases){
  const p={...DEF,lighten:false,onion:false,blkS:false,blkF:false,...k.p}; if(!p.onion) p.OS=0;
  const {c,files}=dxfParts(p);
  out[k.id]={note:k.note,input:p,warnings:c.warn,notes:c.notes||[],
    derived:{wrapLen:r2(c.wrapLen),pockets:c.pockets.map(a=>a.map(r2)),gaps:c.gaps,ribs:c.gaps-1,pitch:r2(c.pitch),clear:r2(c.clear),
      carcass:{Dc:r2(c.Dc),Hc:r2(c.Hc),y0:r2(c.y0)},former:{w:r2(c.formerW),d:r2(c.formerD),R:r2(c.RI)},
      fixingPanel:c.double?null:{l:r2(c.fixDepth),h:r2(c.Hc)},back:{w:r2(c.backW),h:r2(c.Hc)},
      blocks:(c.blocks||[]).map(b=>({name:b.name,w:b.wb,holes:b.holes.length})),ribCutOut:!!c.cut},
    files:Object.keys(files).map(n=>partName(n)+'.dxf')};
  const dir=path.join(here,'dxf',k.id); fs.rmSync(dir,{recursive:true,force:true}); fs.mkdirSync(dir,{recursive:true});
  if(!c.warn.length) for(const [n,t] of Object.entries(files)) fs.writeFileSync(path.join(dir,partName(n)+'.dxf'),t);
}
fs.writeFileSync(path.join(here,'expected.json'),JSON.stringify(out,null,2));
console.log('wrote',Object.keys(out).length,'cases');
