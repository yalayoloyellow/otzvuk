// КУДА ВХОДИТ ВНЕШНИЙ ЗВУК. Ручка КУДА ведёт его сквозь прибор по трём точкам,
// и в каждой он делает своё дело — это не оттенки одного, а три разных прибора.
//
//   накал   светит огибающей источника; сам источник не слышен вовсе
//   узлы    ток в частотозадающие конденсаторы: прибор ДЕЛИТ вход на целые
//   шина    качает питание: прибор захватывается высотой входа
//
// Мера однозначная. Слышен ли на выходе САМ вход (значит подмешался) и куда
// уехала частота прибора (значит воздействовал).
import {readFileSync} from 'fs';
globalThis.sampleRate=48000; let K=null;
globalThis.registerProcessor=(n,k)=>K=k;
globalThis.AudioWorkletProcessor=class{constructor(){this.port={postMessage(){},set onmessage(f){this._f=f},get onmessage(){return this._f}};}};
new Function(readFileSync('./chaos.worklet.js','utf8'))();
const БАЗА={sway:.55,depth:.75,gryzn:0,golos:0,petlya:0,
 kuda:0,zhat:0,drive:.15,master:1,pit:1,sboy:0,ist:0};
const N=8192;
function прогон(правки, seed, fвх){
  const c=new K(); c.port.onmessage({data:{t:'seed',v:seed}});
  c.port.onmessage({data:{t:'p',v:{...БАЗА,...правки}}});
  const n=128,L=new Float32Array(n),R=new Float32Array(n),вх=new Float32Array(n);
  const всего=Math.round(48000*6/n), греть=Math.round(48000*2/n);
  const буф=[]; let t=0;
  for(let b=0;b<всего;b++){
    for(let i=0;i<n;i++){ вх[i]= fвх ? Math.sin(2*Math.PI*fвх*t)*.5 : 0; t+=1/48000; }
    c.process([[вх]],[[L,R]]);
    if(b>=греть) for(let i=0;i<n;i++) буф.push(L[i]);
  }
  return {звук:буф, f:c.pr.cells.map(u=>u.f||0)};
}
function пф(re,im){ const N=re.length;
  for(let i=1,j=0;i<N;i++){ let b=N>>1; for(;j&b;b>>=1) j^=b; j^=b;
    if(i<j){ let t=re[i];re[i]=re[j];re[j]=t; t=im[i];im[i]=im[j];im[j]=t; } }
  for(let len=2;len<=N;len<<=1){ const a=-2*Math.PI/len,wr=Math.cos(a),wi=Math.sin(a);
    for(let i=0;i<N;i+=len){ let cr=1,ci=0;
      for(let k=0;k<len/2;k++){ const ur=re[i+k],ui=im[i+k];
        const vr=re[i+k+len/2]*cr-im[i+k+len/2]*ci, vi=re[i+k+len/2]*ci+im[i+k+len/2]*cr;
        re[i+k]=ur+vr; im[i+k]=ui+vi; re[i+k+len/2]=ur-vr; im[i+k+len/2]=ui-vi;
        const nr=cr*wr-ci*wi; ci=cr*wi+ci*wr; cr=nr; } } }
}
function спектр(x){ const мод=new Float64Array(N/2); let окон=0;
  const re=new Float64Array(N), im=new Float64Array(N);
  for(let o=0;o+N<=x.length;o+=N/2){
    for(let i=0;i<N;i++){ re[i]=x[o+i]*(.5-.5*Math.cos(2*Math.PI*i/N)); im[i]=0; }
    пф(re,im); for(let k=1;k<N/2;k++) мод[k]+=Math.sqrt(re[k]*re[k]+im[k]*im[k])/N; окон++; }
  for(let k=0;k<N/2;k++) мод[k]/=окон||1; return мод; }
const дб=v=>20*Math.log10(Math.max(1e-12,v));
const наF=(с,f)=>{ const k=Math.round(f*N/48000); let m=0;
  for(let i=Math.max(1,k-2);i<=k+2&&i<N/2;i++) m=Math.max(m,с[i]); return m; };
// ТОЛЬКО ЦЕЛЫЕ ДЕЛЕНИЯ И ТОЛЬКО ТОЧНО. Первая редакция искала ближайшую дробь
// со знаменателем до девяти и допуском в шесть процентов — такая находит дробь
// почти для любого числа, и по ней докладывались «деления», которых не было:
// частоты со входом и без него совпадали. Захват — это когда отношение входа к
// выходу ЦЕЛОЕ в пределах двух процентов, и никак иначе.
const бл=r=>{ if(!(r>0)) return '—'; const n=Math.round(1/r);
  return (n>=1&&n<=16&&Math.abs(1/r-n)/n<.02) ? ('1/'+n) : '—'; };

const FIN=900;
console.log('ВХОД '+FIN+' Гц, ГЛУБИНА XMOD 0.25 — три положения ручки КУДА\n');
for(const seed of [1626943591,139297718,770901]){
  const тихо=прогон({},seed,0);
  console.log('══ сборка '+seed+'   сам по себе '+тихо.f.map(v=>v.toFixed(0)).join(' / ')+' Гц');
  console.log('   куда        вход на выходе   частоты трёх ячеек      деления входа');
  for(const [имя,k] of [['накал',0],['узлы',.5],['шина',1]]){
    const р=прогон({golos:.25, kuda:k}, seed, FIN);
    const с=спектр(р.звук); let мк=0;
    for(let i=1;i<N/2;i++) мк=Math.max(мк,с[i]);
    console.log('   '+имя.padEnd(10)+(дб(наF(с,FIN))-дб(мк)).toFixed(1).padStart(9)+' дБ   '
      +р.f.map(v=>v.toFixed(0).padStart(5)).join('')+'      '
      +р.f.map(v=>бл(v/FIN)).join(' · '));
  }
  console.log('');
}
console.log('ЧТО ПЕРЕСТУПАЕТ ДЕЛЕНИЯ в положении «узлы»');
console.log('   TUNE     частоты трёх ячеек        деления входа');
for(const t of [.15,.3,.45,.5,.6,.75,.9]){
  const р=прогон({golos:.25, kuda:.5}, 1626943591, FIN);
  console.log('   '+t.toFixed(2).padStart(5)+'   '+р.f.map(v=>v.toFixed(0).padStart(6)).join('')
    +'        '+р.f.map(v=>бл(v/FIN)).join(' · '));
}
console.log('');
console.log('   для сравнения — БЕЗ входа, та же развёртка TUNE');
for(const t of [.15,.3,.45,.5,.6,.75,.9]){
  const р=прогон({range:t}, 1626943591, 0);
  console.log('   '+t.toFixed(2).padStart(5)+'   '+р.f.map(v=>v.toFixed(0).padStart(6)).join(''));
}
