#!/usr/bin/env node
// Finds the fewest keystrokes that collect every gem on a gem isle, using only the keys
// unlocked by that isle. Use the result as the isle's `par`.
// Run: npm run pars            (all gem isles, can take a minute)
//      node tools/compute-pars.js 3 5   (just isles 3 and 5)
// Leaves out ; , n and N, so a clever player can sometimes beat par. That is fine.
const { Vim } = require('../src/engine.js');
const { LEVELS, parseMap, allowedFor } = require('../src/levels.js');
function par(i){
  const L=LEVELS[i], m=parseMap(L.map), A=allowedFor(i);
  const v=new Vim(m.buf,m.start,A);
  const gemIdx=new Map(m.gems.map((g,k)=>[g.r+','+g.c,k])); const full=(1<<m.gems.length)-1;
  const acts=[]; // {key,arg,count,hasCount,cost}
  const motions=['h','j','k','l','w','b','e','W','B','E','0','^','$','gg','G','{','}','%','*'].filter(k=>A.has(k));
  const maxC = A.has('count')?60:1;
  for(const k of motions){
    const base=k==='gg'?2:1;
    if(k==='G'||k==='gg'){ acts.push({motion:{key:k},count:1,hasCount:false,cost:base}); if(A.has('count')) for(let n=1;n<=m.buf.length;n++) acts.push({motion:{key:k},count:n,hasCount:true,cost:base+String(n).length}); continue; }
    for(let n=1;n<=maxC;n++) acts.push({motion:{key:k},count:n,hasCount:n>1,cost:base+(n>1?String(n).length:0)});
  }
  const chars=new Set(m.buf.join(''));
  for(const k of ['f','F','t','T'].filter(k=>A.has(k))) for(const ch of chars) for(let n=1;n<=(A.has('count')?6:1);n++) acts.push({motion:{key:k,arg:ch},count:n,hasCount:n>1,cost:2+(n>1?1:0)});
  if(A.has('/')){ const words=new Set(m.buf.join(' ').match(/\w+/g)); for(const w of words){ for(let p=1;p<=w.length;p++){ const pre=w.slice(0,p); acts.push({search:pre,dir:1,cost:p+2}); if(A.has('?')) acts.push({search:pre,dir:-1,cost:p+2}); } } }
  const dist=new Map(); const buckets=[]; const push=(s,d)=>{ (buckets[d]||(buckets[d]=[])).push(s); };
  const key=s=>`${s.r},${s.c},${s.want},${s.mask}`;
  let s0={r:m.start.r,c:m.start.c,want:m.start.c,mask:0}; const g0=gemIdx.get(s0.r+','+s0.c); if(g0!==undefined) s0.mask|=1<<g0;
  dist.set(key(s0),0); push(s0,0);
  for(let d=0;d<buckets.length+1&&d<400;d++){
    const B=buckets[d]; if(!B) continue;
    for(const s of B){
      if(dist.get(key(s))!==d) continue;
      if(s.mask===full) return d;
      for(const a of acts){
        v.r=s.r; v.c=s.c; v.want=s.want; v.mode='normal'; v.lastSearch=null;
        let t;
        if(a.search){ t=v.search(a.search,a.dir,{r:s.r,c:s.c}); if(t){v.r=t.r;v.c=t.c;v.want=t.c;} }
        else { t=v.doMotion(a.motion,a.count,a.hasCount,null); if(t){ v.moveTo(t); v.clampNormal(); } }
        if(!t) continue;
        const ns={r:v.r,c:v.c,want:v.want===Infinity?999:v.want,mask:s.mask};
        if(ns.want===999) v.want=Infinity;
        const g=gemIdx.get(ns.r+','+ns.c); if(g!==undefined) ns.mask|=1<<g;
        const nd=d+a.cost, k=key(ns);
        if(!dist.has(k)||dist.get(k)>nd){ dist.set(k,nd); push(ns,nd); }
      }
    }
  }
  return -1;
}
const only = process.argv.slice(2).map(n => +n - 1);
LEVELS.forEach((L, i) => {
  if (L.target || (only.length && !only.includes(i))) return;
  const best = par(i);
  const flag = best < 0 ? 'unreachable!' : best === L.par ? 'matches' : `level says ${L.par}`;
  console.log(`Isle ${i + 1} ${L.title}: fewest keys ${best} (${flag})`);
});
