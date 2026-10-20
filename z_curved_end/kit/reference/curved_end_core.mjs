// Vanity Curved End — geometry + S2M DXF core (pure functions, no UI / three.js).
// Extracted verbatim from the live "Vanity Curved End" page (artifact v31, 2026-10-09) so it can be
// ported into RHK-CADcam. Units: mm. See ../SPEC.md for the rules and coordinate conventions.
//
//   import { calc, dxfParts, DEF } from './curved_end_core.mjs'
//   const p = { ...DEF, hand:'RH', lighten:false, onion:false, blkS:false, blkF:false }
//   const { c, files } = dxfParts(p)    // c = all derived geometry, files = { partKey: dxfText }
//   partName('FaceBoard') -> 'ext_FaceBoard'  (file name = part name in NC Center)
const DEF={W:170,D:500,H:500,R:150,FT:18,SK:2,T:16.5,B:60,OS:0.3,OL:0,OR:0,OG:0,SBK:0,SBT:0,STP:0};
const BLOCK_WIDE=100, BLOCK_NARROW=60;
const POCK_EXT=3, OVER=8, HOLE_D=5, INSET=50, BACK_INSET=40, MAX_PITCH=250;
function spread(len,inset,maxP){const span=len-2*inset; if(span<=0) return [len/2];
  const n=Math.max(1,Math.ceil(span/maxP-1e-9)); return Array.from({length:n+1},(_,i)=>inset+span*i/n);}
// Geometry is described as closed loops in plan coords (x across, d = depth from front, front at d=0),
// each vertex [x, d, bulge]; bulge = tan(angle/4) of the arc to the next vertex, + = anticlockwise (d drawn upward).
const TB=Math.tan(Math.PI/8);
// Where the rib cut-out's rounded corner meets its rectangle (inset by the border).
function cornerArc(x0,x1,d0,d1,CX,CD,r){
  const cl=v=>Math.max(-1,Math.min(1,v));
  if(r<=0||x1<=CX) return null;
  const a=(x0-CX)/r; if(a>=1) return {cutFront:true};
  const tFront=Math.asin(cl((d0-CD)/r)), tLeft=a<=-1?-Infinity:-Math.acos(a);
  const ts=Math.max(tFront,tLeft), te=-Math.acos(cl((x1-CX)/r));
  if(te<=ts) return null;
  return {ts,te,b:Math.tan((te-ts)/4),onLeft:tLeft>tFront,
    ps:[CX+r*Math.cos(ts),CD+r*Math.sin(ts)], pe:[x1,CD+r*Math.sin(te)]};
}
// Rib cut-out: rib outline brought in by the border B (the rib, ignoring its small shoulders, is convex).
function ribCutout(p,c){
  const {W,D,FT,T,B}=p, r=c.RI-B;
  if(c.double){
    const x0=FT+B+(c.blkSide?T:0), x1=W-FT-B-(c.blkSide?T:0), d0=FT+B+(c.blkFront?T:0), d1=c.Dc-T-B, xm=W/2;
    if(x1-x0<30||d1-d0<30) return null;
    const k=cornerArc(xm,x1,d0,d1,c.CX,c.CD,r);
    if(!k) return [[x0,d0,0],[x1,d0,0],[x1,d1,0],[x0,d1,0]];
    if(k.cutFront) return null;
    const m=([x,d])=>[W-x,d], pe=k.pe, ps=k.ps, mpe=m(pe), mps=m(ps);
    const L=[[x0,d1,0],[mpe[0],mpe[1],k.b]];
    if(Math.abs(mps[0]-ps[0])>0.01) L.push([mps[0],mps[1],0]);
    L.push([ps[0],ps[1],k.b],[pe[0],pe[1],0],[x1,d1,0]);
    return L;
  }
  let x0=T+B, x1=W-FT-B-(c.blkSide?T:0), d0=FT+B+(c.blkFront?T:0), d1=c.Dc-T-B;
  if(x1-x0<30||d1-d0<30) return null;
  const rect=()=>[[x0,d0,0],[x1,d0,0],[x1,d1,0],[x0,d1,0]];
  const k=cornerArc(x0,x1,d0,d1,c.CX,c.CD,r);
  if(!k) return rect();
  if(k.cutFront){ d0=Math.max(d0,c.CD); return d1-d0<30?null:rect(); }
  const L=[]; if(!k.onLeft) L.push([x0,d0,0]);
  L.push([k.ps[0],k.ps[1],k.b],[k.pe[0],k.pe[1],0],[x1,d1,0],[x0,d1,0]);
  return L;
}
// hand: RH / LH = one curved end beside a vanity (fixing panel on the vanity side);
// DOUBLE = one cabinet, curve on both front corners, no fixing panel.
function calc(p){
  const {W,D,H,R,FT,SK,T}=p, c={...p}, E=POCK_EXT;
  // scribes: the face board keeps the full D x H; the carcass finishes short of the wall (Dc) and sits up off the floor (y0)
  const SBK=p.SBK||0, SBT=p.SBT||0, STP=p.STP||0, Dc=D-SBK, Hc=H-SBT-STP; c.Dc=Dc; c.Hc=Hc; c.y0=SBT;   // top scribe: carcass also stops STP below the top of the face board
  c.double=p.hand==='DOUBLE';
  c.CX=W-R; c.CD=R; c.RI=R-SK;
  c.maxGap=SK<=2?170:250;
  let g=1; while((Hc-(g+1)*T)/g>=c.maxGap && g<60) g++;
  c.gaps=g; c.pitch=(Hc-T)/g; c.clear=(Hc-(g+1)*T)/g;
  c.levels=Array.from({length:g+1},(_,i)=>i*c.pitch);
  c.holeY=c.levels.map(y=>y+T/2);
  c.arc=Math.PI/2*R;
  const RI=c.RI, CX=c.CX;
  if(c.double){
    const side=D-R, flat=W-2*R;
    // face board runs from the left wall end (X0) to the right wall end, plus the back overhangs to trim after glue-up
    const OL=p.OL||0, OR=p.OR||0; c.ovL=OL; c.ovR=OR;
    c.wrapLen=OL+2*side+2*c.arc+flat+OR;
    c.pockets=[[OL+side-E,OL+side+c.arc+E],[OL+side+c.arc+flat-E,OL+side+2*c.arc+flat+E]];
    if(c.pockets[0][1]>=c.pockets[1][0]) c.pockets=[[c.pockets[0][0],c.pockets[1][1]]];
    c.fixDepth=0; c.backX0=FT; c.backW=W-2*FT; c.formerX0=SK; c.formerW=W-2*SK; c.formerD=Dc-T-SK;
    c.fixToFormerX=[]; c.fixToBackY=[];
    // a full half-round front (width = 2 x radius) has no flat, so no front shoulders
    c.formerLoop=flat>0.01
      ? [[FT,Dc-T,0],[FT,R,0],[SK,R,TB],[R,SK,0],[R,FT,0],[W-R,FT,0],[W-R,SK,TB],[W-SK,R,0],[W-FT,R,0],[W-FT,Dc-T,0]]
      : [[FT,Dc-T,0],[FT,R,0],[SK,R,TB],[R,SK,TB],[W-SK,R,0],[W-FT,R,0],[W-FT,Dc-T,0]];
    c.wrapLoop=[[0,D+OL,0],[0,R,TB],[R,0,0],[W-R,0,TB],[W,R,0],[W,D+OR,0],[W-FT,D+OR,0],[W-FT,R+E,0],[W-SK,R+E,0],[W-SK,R,-TB],
      ...(flat>=2*E?[[W-R,SK,0],[W-R-E,SK,0],[W-R-E,FT,0],[R+E,FT,0],[R+E,SK,0],[R,SK,-TB]]:flat>0.01?[[W-R,SK,0],[R,SK,-TB]]:[[R,SK,-TB]]),[SK,R,0],[SK,R+E,0],[FT,R+E,0],[FT,D+OL,0]];
    c.pocketLines=flat>=2*E?[[R+E,FT],[W-R-E,FT],[FT,R+E],[W-FT,R+E]]:[[FT,R+E],[W-FT,R+E]];
  } else {
    // single end: X0 is the front end; only the wall end gets an overhang (right for RH, left for LH)
    // plus a gable overhang on the front (vanity-side) end, X0
    const OV=p.hand==='LH'?(p.OL||0):(p.OR||0), OG=p.OG||0; c.ovL=p.hand==='LH'?OV:0; c.ovR=p.hand==='LH'?0:OV; c.ovG=OG;
    c.wrapLen=OG+CX+c.arc+(D-R)+OV;
    c.pockets=[[OG+CX-E,OG+CX+c.arc+E]];
    c.fixDepth=Dc-FT; c.backX0=T; c.backW=W-FT-T; c.formerX0=T; c.formerW=W-SK-T; c.formerD=Dc-T-SK;
    c.fixToFormerX=spread(Dc-T-FT,INSET,MAX_PITCH);
    c.fixToBackX=Dc-T/2-FT; c.fixToBackY=spread(Hc,INSET,MAX_PITCH);
    c.formerLoop=[[T,FT,0],[CX,FT,0],[CX,SK,TB],[W-SK,R,0],[W-FT,R,0],[W-FT,Dc-T,0],[T,Dc-T,0]];
    c.wrapLoop=[[-OG,0,0],[CX,0,TB],[W,R,0],[W,D+OV,0],[W-FT,D+OV,0],[W-FT,R+E,0],[W-SK,R+E,0],[W-SK,R,-TB],[CX,SK,0],[CX-E,SK,0],[CX-E,FT,0],[-OG,FT,0]];
    c.pocketLines=[[CX-E,FT],[W-FT,R+E]];
  }
  c.backToFormerX=spread(c.backW,BACK_INSET,MAX_PITCH);
  // Fixing blocks: carcass-board strips, full carcass height, lying flat against the back of the face board's
  // full-thickness straights, checked into (notched through) the top, bottom and ribs. 100 wide if the straight
  // allows, otherwise 60. Side block sits hard against the back; front block hard against the fixing panel
  // (both-ends cabinet: a block on each side, and the front block centred).
  c.warn=[]; c.notes=[];   // notes are shown but don't block the export
  c.blocks=[]; c.blkSide=false; c.blkFront=false;
  const pickW=avail=>[BLOCK_WIDE,BLOCK_NARROW].find(v=>v<=avail+1e-9);
  if(p.blkS){ const wb=pickW((Dc-T)-(R+E));
    if(!wb) c.notes.push(`No room for a side fixing block: the flat side behind the curve is only ${f1(Math.max(0,(Dc-T)-(R+E)))} long (needs ${BLOCK_NARROW}).`);
    else { c.blkSide=true; const d0=Dc-T-wb, d1=Dc-T;
      c.blocks.push({name:c.double?'Block_SideR':'Block_Side',face:'side',dir:1,x0:W-FT-T,x1:W-FT,d0,d1,wb});
      const L=c.formerLoop, i=L.findIndex(v=>v[0]===W-FT&&v[1]===Dc-T);
      L.splice(i,1,[W-FT,d0,0],[W-FT-T,d0,0],[W-FT-T,d1,0]);
      if(c.double){ c.blocks.push({name:'Block_SideL',face:'side',dir:-1,x0:FT,x1:FT+T,d0,d1,wb});
        const j=L.findIndex(v=>v[0]===FT&&v[1]===Dc-T); L.splice(j,1,[FT+T,d1,0],[FT+T,d0,0],[FT,d0,0]); } } }
  if(p.blkF){ const avail=c.double?(W-R-E)-(R+E):(CX-E)-T, wb=pickW(avail);
    if(!wb) c.notes.push(`No room for a front fixing block: the flat front is only ${f1(Math.max(0,avail))} wide (needs ${BLOCK_NARROW}).`);
    else { c.blkFront=true; const L=c.formerLoop;
      if(c.double){ const a=W/2-wb/2, b=W/2+wb/2, i=L.findIndex(v=>v[0]===R&&v[1]===FT);
        c.blocks.push({name:'Block_Front',face:'front',dir:1,x0:a,x1:b,d0:FT,d1:FT+T,wb});
        L.splice(i+1,0,[a,FT,0],[a,FT+T,0],[b,FT+T,0],[b,FT,0]); }
      else { c.blocks.push({name:'Block_Front',face:'front',dir:1,x0:T,x1:T+wb,d0:FT,d1:FT+T,wb});
        const i=L.findIndex(v=>v[0]===T&&v[1]===FT); L.splice(i,1,[T,FT+T,0],[T+wb,FT+T,0],[T+wb,FT,0]); } } }
  c.blockHoleY=spread(Hc,INSET,MAX_PITCH);
  // each block: face holes up the centre (screw out into the face board) plus end holes on the top and bottom
  // formers' centrelines (screw back into their edges in the notch): 2 holes 25 in on a 100 block, 1 centred on a 60
  // former holes on every former's centreline (top, bottom and each rib) to screw back into them;
  // a face hole that would land within 20 of a former hole is dropped
  c.blocks.forEach(k=>{ const ex=k.wb>=80?[25,k.wb-25]:[k.wb/2];
    k.endHoles=c.holeY.flatMap(y=>ex.map(x=>[x,y]));
    k.faceHoles=c.blockHoleY.map(y=>[k.wb/2,y]).filter(([x,y])=>!k.endHoles.some(([a,b])=>Math.hypot(a-x,b-y)<20));
    k.holes=[...k.faceHoles,...k.endHoles]; k.holeX=[...new Set([k.wb/2,...ex])].sort((a,b)=>a-b);
    k.holeYs=[...new Set([...c.holeY,...k.faceHoles.map(h=>h[1])].map(v=>Math.round(v*100)/100))].sort((a,b)=>a-b); });
  c.cut=p.lighten?ribCutout(p,c):null; c.cutDepth=T-(p.OS||0);
  
  if(c.double){
    if(W<2*R) c.warn.push(`Radius too big for the width: two R${f1(R)} corners need at least ${f1(2*R)} wide.`);
  } else if(CX-E<T) c.warn.push(`Radius too big for the width: the pocket would start over the fixing panel. Needs at least ${f1(T+E)} mm of flat front, has ${f1(CX)}.`);
  if(R+E>Dc-T-20) c.warn.push('Radius too big for the depth (after the back scribe).');
  if(Hc<3*T+40) c.warn.push('The top and bottom scribes leave too little carcass height.');
  if(SK>=FT) c.warn.push('Skin must be thinner than the face board.');
  return c;
}
// reverse a loop's direction: each bulge moves to the new start of its segment and flips sign
function revLoop(L){ const n=L.length, o=[]; for(let i=0;i<n;i++){ const j=(n-i)%n, prev=(j-1+n)%n; o.push([L[j][0],L[j][1],-L[prev][2]]); } return o; }
function mirLoop(L,w){ return revLoop(L.map(([x,y,b])=>[w-x,y,-b])); }   // mirror across x, keep direction
const f1=n=>(Math.round(n*10)/10).toString(), f2=n=>(Math.round(n*100)/100).toString();

// ---------- DXF (R12, S2M layer names) ----------
const THROUGH_EXTRA=0.2, OUTLINE_EXTRA=0;   // outlines cut to exactly the board thickness; through-holes 0.2 mm past it
const lnum=v=>String(+(+v).toFixed(2)).replace('.','P');
const r3=v=>Math.round(v*1000)/1000;
function dxfDoc(layers,ents){
  const L=[]; const g=(c,v)=>L.push(String(c),String(v));
  g(0,'SECTION');g(2,'HEADER');g(9,'$ACADVER');g(1,'AC1009');g(0,'ENDSEC');
  g(0,'SECTION');g(2,'TABLES');
  g(0,'TABLE');g(2,'LTYPE');g(70,1);g(0,'LTYPE');g(2,'CONTINUOUS');g(70,0);g(3,'Solid line');g(72,65);g(73,0);g(40,0);g(0,'ENDTAB');
  const all=['0',...layers];
  g(0,'TABLE');g(2,'LAYER');g(70,all.length);
  all.forEach(n=>{g(0,'LAYER');g(2,n);g(70,0);g(62,7);g(6,'CONTINUOUS');});
  g(0,'ENDTAB');g(0,'ENDSEC');
  g(0,'SECTION');g(2,'BLOCKS');g(0,'ENDSEC');
  g(0,'SECTION');g(2,'ENTITIES');
  ents.forEach(e=>{
    if(e.type==='circle'){ g(0,'CIRCLE');g(8,e.layer);g(10,r3(e.x));g(20,r3(e.y));g(30,0);g(40,e.r); }
    else { g(0,'POLYLINE');g(8,e.layer);g(66,1);g(10,0);g(20,0);g(30,0);g(70,1);
      e.pts.forEach(([x,y,b])=>{g(0,'VERTEX');g(8,e.layer);g(10,r3(x));g(20,r3(y));g(30,0);if(b)g(42,b);});
      g(0,'SEQEND');g(8,e.layer); }
  });
  g(0,'ENDSEC');g(0,'EOF');
  return L.join('\r\n')+'\r\n';
}
const partName=nm=>(nm==='FaceBoard'?'ext_':'int_')+nm;
const rectCCW=(L,H)=>[[0,0],[L,0],[L,H],[0,H]], rectCW=(L,H)=>[[0,0],[0,H],[L,H],[L,0]];
function dxfParts(p){
  const c=calc(p), {H,FT,SK,T}=p, out={};
  const lo=`OUTLINEZ${lnum(FT+OUTLINE_EXTRA)}L`, lp=`PKZ${lnum(FT-SK)}`;
  const lo16=`OUTLINEZ${lnum(T+OUTLINE_EXTRA)}L`, lb=`VBOREZ${lnum(T+THROUGH_EXTRA)}`;
  const rect=(L,H,layer)=>[{type:'poly',layer:'PART',pts:rectCCW(L,H)},{type:'poly',layer,pts:rectCW(L,H)}];
  const r2=v=>Math.round(v*100)/100;
  const circ=(x,y)=>({type:'circle',layer:lb,x:r2(x),y:r2(y),r:HOLE_D/2});
  // Face board, back face up. Single: front end at X0. Double: one side's wall end at X0.
  // (Face board, fixing panel and back are the same part for either hand: they are fitted the other way round.)
  const L=r2(c.wrapLen);
  out.FaceBoard=dxfDoc(['PART',lo,lp],[...rect(L,H,lo),...c.pockets.map(([a,b])=>({type:'poly',layer:lp,
    pts:[[r2(a),-OVER],[r2(b),-OVER],[r2(b),H+OVER],[r2(a),H+OVER]]}))]);
  if(!c.double){
    const fh=[]; c.holeY.forEach(y=>c.fixToFormerX.forEach(x=>fh.push([x,y]))); c.fixToBackY.forEach(y=>fh.push([c.fixToBackX,y]));
    out.FixingPanel=dxfDoc(['PART',lo16,lb],[...rect(r2(c.fixDepth),r2(c.Hc),lo16),...fh.map(([x,y])=>circ(x,y))]);
  }
  const bh=[]; c.holeY.forEach(y=>c.backToFormerX.forEach(x=>bh.push([x,y])));
  out.Back=dxfDoc(['PART',lo16,lb],[...rect(r2(c.backW),r2(c.Hc),lo16),...bh.map(([x,y])=>circ(x,y))]);
  // Formers: top view, front at Y0. Outline clockwise (left comp = outside); cut-out anticlockwise (cutter in the waste).
  const fw=r2(c.formerW), fd=r2(c.formerD), tx=([x,d,b])=>[x-c.formerX0,d-SK,b];
  let ccw=c.formerLoop.map(tx);
  if(p.hand==='LH') ccw=mirLoop(ccw,fw);
  const formerEnts=[{type:'poly',layer:'PART',pts:rectCCW(fw,fd)},{type:'poly',layer:lo16,pts:revLoop(ccw)}];
  const former=dxfDoc(['PART',lo16],formerEnts);
  let rib=former;
  if(c.cut){
    const lr=`ROUTEZ${lnum(c.cutDepth)}L`;   // leaves the onion skin, if set
    let loop=c.cut.map(tx); if(p.hand==='LH') loop=mirLoop(loop,fw);
    rib=dxfDoc(['PART',lo16,lr],[...formerEnts,{type:'poly',layer:lr,pts:loop}]);
  }
  out.Bottom=former; for(let i=1;i<c.gaps;i++) out['Rib'+i]=rib; out.Top=former;
  // fixing blocks: wb x carcass height, Ø5 through-holes up the centre for screwing out into the face board
  c.blocks.forEach(k=>{ out[k.name]=dxfDoc(['PART',lo16,lb],[...rect(r2(k.wb),r2(c.Hc),lo16),...k.holes.map(([x,y])=>circ(x,y))]); });
  return {c,files:out};
}
export { DEF, BLOCK_WIDE, BLOCK_NARROW, POCK_EXT, OVER, HOLE_D, INSET, BACK_INSET, MAX_PITCH, THROUGH_EXTRA, OUTLINE_EXTRA,
  spread, cornerArc, ribCutout, calc, revLoop, mirLoop, lnum, dxfDoc, partName, dxfParts, f1, f2 };
