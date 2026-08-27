// УВОД И УДЕРЖАНИЕ — то, ради чего затевалась розовая зона.
//
// УВОД: генераторы гнут друг друга через резисторы, кольцом. Проверяем, что
// они садятся в ЦЕЛЫЕ отношения, а не просто уезжают.
// УДЕРЖАНИЕ: качели замирают. Проверяем, что разброс частоты падает.
import {readFileSync} from 'fs';
globalThis.sampleRate=48000; let K=null;
globalThis.registerProcessor=(n,k)=>K=k;
globalThis.AudioWorkletProcessor=class{constructor(){this.port={postMessage(){},set onmessage(f){this._f=f},get onmessage(){return this._f}};}};
new Function(readFileSync('./chaos.worklet.js','utf8'))();
const Б={sway:.55,tone:.5,depth:.75,range:.5,gryzn:0,golos:0,gen1:1,gen2:1,gen3:1,dirt:0,petlya:0,kuda:0,zhat:0,drive:.15,master:1,pit:1,set:0,sboy:0,gnut:0,derzhi:0};
function прогон(правки, seed, сек=8){
  const c=new K(); c.port.onmessage({data:{t:'seed',v:seed}});
  c.port.onmessage({data:{t:'p',v:{...Б,...правки}}});
  const n=128,L=new Float32Array(n),R=new Float32Array(n);
  const f=[[],[],[]]; let nan=0;
  for(let b=0;b<Math.round(48000*сек/n);b++){
    c.process([[]],[[L,R]]);
    for(let i=0;i<n;i++) if(!(L[i]===L[i])) nan++;
    if(b>Math.round(48000*2/n) && b%8===0)
      for(let g=0;g<3;g++){ const v=c.pr.cells[g].f; if(v>5&&v<8000) f[g].push(v); }
  }
  const мед=a=>{const b=a.slice().sort((x,y)=>x-y);return b[b.length>>1]||0;};
  const разб=a=>{ if(a.length<4) return 0; const m=мед(a);
    return Math.sqrt(a.reduce((s,v)=>s+(v-m)*(v-m),0)/a.length)/m; };
  return {f:f.map(мед), разброс:f.map(разб), nan};
}
// ближайшее ЦЕЛОЕ отношение пары, только точное
const отн=(a,b)=>{ if(!(a>0&&b>0)) return '—'; const r=Math.max(a,b)/Math.min(a,b);
  for(const [p,q] of [[1,1],[2,1],[3,1],[3,2],[4,3],[5,4],[5,3],[5,2],[7,4],[7,5],[8,5]]){
    if(Math.abs(r-p/q)/(p/q)<.02) return (a>b?p+':'+q:q+':'+p); }
  return r.toFixed(3); };

console.log('УВОД — как глубина связи ставит голоса в отношения\n');
for(const seed of [1626943591,139297718]){
  const св=прогон({},seed);
  console.log('══ сборка '+seed+'  свободно '+св.f.map(v=>v.toFixed(0)).join(' / ')+' Гц');
  console.log('   увод    частоты            1↔2      2↔3      1↔3    NaN');
  for(const g of [0,.15,.35,.6,.85,1]){
    const р=прогон({gnut:g},seed);
    console.log('   '+g.toFixed(2).padStart(5)+'   '+р.f.map(v=>v.toFixed(0).padStart(6)).join('')
      +'  '+отн(р.f[0],р.f[1]).padStart(7)+отн(р.f[1],р.f[2]).padStart(9)
      +отн(р.f[0],р.f[2]).padStart(9)+String(р.nan).padStart(6));
  }
  console.log('');
}
console.log('УДЕРЖАНИЕ — насколько прибор замирает');
for(const seed of [1626943591,139297718,770901]){
  const б=прогон({},seed), д=прогон({derzhi:1},seed);
  console.log('  сборка '+seed
    +'   разброс частоты: свободно '+(б.разброс[0]*100).toFixed(1)
    +'% → удержано '+(д.разброс[0]*100).toFixed(1)+'%'
    +'   (вдесятеро лучше = '+(б.разброс[0]/Math.max(1e-6,д.разброс[0])).toFixed(1)+'×)');
}
