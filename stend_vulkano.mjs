// ВУЛКАНО — фильтр с характером. Проверки:
// 1. CUT в нуле — обход (тракт прежний по скз/нулям).
// 2. Развёртка CUT закрывает: переходы через ноль падают монотонно.
// 3. SCREAM на упоре — самовозбуждение: фильтр поёт узким тоном, высоту
//    ведёт CUT (нулей/с ≈ 2·fc, узость — малый разброс периодов).
// 4. Потолок и NaN — не срывается ни в одном углу.
import {readFileSync} from 'fs';
globalThis.sampleRate=48000;
globalThis.AudioWorkletProcessor=class{constructor(){this.port={postMessage(){},set onmessage(f){this._f=f},get onmessage(){return this._f}};}};
let K=null; globalThis.registerProcessor=(n,k)=>K=k;
new Function(readFileSync('./chaos.worklet.js','utf8'))();
function мера(п, сек=4){
  const c=new K(); c.port.onmessage({data:{t:'seed',v:1626943591}});
  c.port.onmessage({data:{t:'p',v:{pit:1, ...п}}});
  const n=128,L=new Float32Array(n),R=new Float32Array(n),вх=new Float32Array(n);
  for(let b=0;b<Math.round(48000*2/n);b++) c.process([[вх]],[[L,R]]);
  let кв=0,N=0,нулей=0,пп=0,пик=0;
  for(let b=0;b<Math.round(48000*сек/n);b++){ c.process([[вх]],[[L,R]]);
    for(let i=0;i<n;i++){ const v=L[i]; кв+=v*v; N++; if(Math.abs(v)>пик)пик=Math.abs(v);
      if(пп<=0&&v>0)нулей++; пп=v; } }
  return {скз:Math.sqrt(кв/N), нулей:нулей/(N/48000), пик, ср:c.sryvy};
}
const без=мера({});
console.log('== развёртка CUT (SCREAM .3) ==   без фильтра: скз '+без.скз.toFixed(3)+' нулей/с '+без.нулей.toFixed(0));
for(const cut of [.15,.35,.55,.75,.95]){
  const r=мера({cut, krik:.3});
  const fc=8000*Math.pow(45/8000,cut);
  console.log('  CUT '+cut.toFixed(2)+' (fc '+fc.toFixed(0).padStart(4)+' Гц)  скз '+r.скз.toFixed(3)+
    '  нулей/с '+r.нулей.toFixed(0).padStart(5)+'  пик '+r.пик.toFixed(2)+(r.ср?' СРЫВ':''));
}
console.log('== SCREAM на упоре: вой, высоту ведёт CUT ==');
for(const cut of [.3,.5,.7]){
  const r=мера({cut, krik:1});
  const fc=8000*Math.pow(45/8000,cut);
  console.log('  CUT '+cut.toFixed(1)+'  fc '+fc.toFixed(0).padStart(4)+' Гц  нулей/с '+r.нулей.toFixed(0).padStart(5)+
    ' (вой ≈ fc: '+(r.нулей/fc).toFixed(2)+'×)  скз '+r.скз.toFixed(3)+(r.ср?' СРЫВ':''));
}
