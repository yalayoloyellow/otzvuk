// ГРОСБИТ — резак по грубому метроному. Три проверки:
// 1. CHOP: внутри доли звук ПОВТОРЯЕТ своё начало — корреляция выхода со
//    сдвигом на окно запинки высокая; без CHOP (контроль) — низкая.
// 2. SCREW: высота падает вместе со скоростью — переходы через ноль реже
//    ровно в меру замедления.
// 3. Прозрачность: обе ручки в нуле — тракт статистически прежний
//    (проверяется отдельно, stend_regr против прежнего ядра).
import {readFileSync} from 'fs';
globalThis.sampleRate=48000; let K=null;
globalThis.registerProcessor=(n,k)=>K=k;
globalThis.AudioWorkletProcessor=class{constructor(){this.port={postMessage(){},set onmessage(f){this._f=f},get onmessage(){return this._f}};}};
new Function(readFileSync('./chaos.worklet.js','utf8'))();
const БАЗА={volt:.5,bak:.5,sway:.55,tone:.5,depth:.75,pulse:.2,hit:.35,spread:.15,
 drift:.2,range:.5,gryzn:0,golos:0,gen1:1,gen2:1,gen3:1,dirt:0,petlya:0,
 kuda:0,zhat:0,drive:.15,master:1,pit:1,set:0,sboy:0,gnut:0,derzhi:0,
 takt:0,razved:0,slip:0,tilt:0,chop:0,skru:0,okras:0,profil:0};
const BPM=120, ДОЛЯ=Math.round(48000*60/BPM);
function прогон(п, сек=6){
  const c=new K(); c.port.onmessage({data:{t:'seed',v:7}});
  c.port.onmessage({data:{t:'p',v:{...БАЗА,...п}}});
  c.port.onmessage({data:{t:'metr',v:BPM}});
  const n=128,L=new Float32Array(n),R=new Float32Array(n),вх=new Float32Array(n);
  const y=[];
  for(let b=0;b<Math.round(48000*сек/n);b++){
    c.process([[вх]],[[L,R]]);
    if(b>Math.round(48000*2/n)) for(let i=0;i<n;i++) y.push(L[i]);
  }
  return y;
}
function корр(y, сдвиг){
  let s=0, sa=0, sb=0;
  for(let i=сдвиг;i<y.length;i++){ s+=y[i]*y[i-сдвиг]; sa+=y[i]*y[i]; sb+=y[i-сдвиг]*y[i-сдвиг]; }
  return s/Math.max(1e-12, Math.sqrt(sa*sb));
}
function нулей(y){ let n=0; for(let i=1;i<y.length;i++) if(y[i-1]<=0&&y[i]>0) n++; return n/(y.length/48000); }
console.log('Метроном '+BPM+', доля '+ДОЛЯ+' отсчётов.\n');
console.log('== CHOP: корреляция со сдвигом на окно запинки ==');
const без=прогон({});
for(const [ручка, имя, дел] of [[0,'выкл (контроль)',.5],[.15,'1/2 доли',.5],[.4,'1/4 доли',.25],[.6,'1/8 доли',.125]]){
  const y=ручка?прогон({chop:ручка}):без;
  const W=Math.round(ДОЛЯ*дел);
  console.log('  CHOP '+имя.padEnd(16)+' корр(окно) '+корр(y,W).toFixed(3)+
              '   корр(окно·0.77, контроль сдвига) '+корр(y,Math.round(W*.77)).toFixed(3));
}
console.log('\n== SCREW: переходы через ноль ==');
const н0=нулей(без);
for(const sk of [0,.5,1]){
  const y=sk?прогон({skru:sk}):без;
  const ожид=1-sk*.5;
  console.log('  SCREW '+sk.toFixed(1)+'   нулей/с '+нулей(y).toFixed(0).padStart(5)+
    '   отношение к сухому '+(нулей(y)/н0).toFixed(2)+'   ожидание '+ожид.toFixed(2));
}
