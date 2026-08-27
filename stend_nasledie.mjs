// НАСЛЕДИЕ НОЙЗА — три фишки конституции, каждая против закола.
//
// Директива хозяина: фишки шумовых мастеров, от Мерцбоу до Pan Sonic, как
// зерно сборок — не как ручки. Проверяется само существование эффекта и то,
// что прибор с фишками не срывается: NaN, потолок и цена — в других стендах.
//
//   ПЕРЕМЫЧКА no-input — выход каскада в суммирующий узел (треть коробок).
//   ЖЕЛЕЗКА на корпусе — негармоничная звенючая мода (две коробки из пяти).
//   ХОЛОДНАЯ ПАЙКА — окисел в зарядной цепи одного голоса (четверть).
import {readFileSync} from 'fs';
globalThis.sampleRate=48000;
globalThis.AudioWorkletProcessor=class{constructor(){this.port={postMessage(){},set onmessage(f){this._f=f},get onmessage(){return this._f}};}};
const ИСХ = readFileSync('./chaos.worklet.js','utf8');
function ядро(п){ let С=ИСХ;
  for(const [а,б] of п){ if(!С.includes(а)) throw new Error('якорь: '+а); С=С.replace(а,б); }
  let К=null; globalThis.registerProcessor=(n,k)=>К=k; new Function(С)(); return К; }
const K0=ядро([]);
const БЕЗ_П=ядро([["this.perem = ж < .35 ? 1 : 0;","this.perem = 0;"]]);
const БЕЗ_Ж=ядро([["this.zhest = ж < .40 ? 1 : 0; }","this.zhest = 0; }"]]);
const БЕЗ_Д=ядро([["this.defekt = ж < .25 ? (к % this.nGen) : -1; }","this.defekt = -1; }"]]);
const СЕМЕНА=[1626943591,139297718,770901,7,42,777,3141592,99991,12345,555,8675309,20260820,31337,246810,987654,111];
function мера(K, seed, сек=4){
  const c=new K(); c.port.onmessage({data:{t:'seed',v:seed}});
  const n=128,L=new Float32Array(n),R=new Float32Array(n),вх=new Float32Array(n);
  for(let b=0;b<Math.round(48000*2/n);b++) c.process([[вх]],[[L,R]]);
  let кв=0,N=0,нулей=0,пп=0;
  for(let b=0;b<Math.round(48000*сек/n);b++){ c.process([[вх]],[[L,R]]);
    for(let i=0;i<n;i++){ const v=L[i]; кв+=v*v; N++; if(пп<=0&&v>0)нулей++; пп=v; } }
  return {скз:Math.sqrt(кв/N), нулей:нулей/(N/48000), sb:c.pr.sb, ср:c.sryvy};
}
function голос(K, seed, ветвь, сек=10){
  const c=new K(); c.port.onmessage({data:{t:'seed',v:seed}});
  const n=1,L=new Float32Array(n),R=new Float32Array(n),вх=new Float32Array(n);
  const окна=[]; let сч=0, было=0, вОкне=0;
  for(let s=0;s<48000*сек;s++){
    c.process([[вх]],[[L,R]]);
    if(s<48000*1.5) continue;
    const q=c.pr.cells[ветвь].q?1:0;
    if(было===0&&q===1) сч++; было=q;
    if(++вОкне>=4800){ окна.push(сч*10); сч=0; вОкне=0; }
  }
  const b=окна.slice().sort((x,y)=>x-y);
  return {мин:b[0], мед:b[b.length>>1], пров:окна.filter(v=>v<b[b.length>>1]*.45).length};
}
let сП=0,сЖ=0,сД=0,беда=0;
for(const s of СЕМЕНА){ const r=мера(K0,s,2);
  if(r.sb.perem)сП++; if(r.sb.zhest)сЖ++; if(r.sb.defekt>=0)сД++;
  if(r.ср || !(r.скз===r.скз)) беда++; }
console.log('раздача по шестнадцати семенам: перемычка '+сП+' · железка '+сЖ+' · дефект '+сД+
  ' · бед '+беда+'\n');
console.log('== ПЕРЕМЫЧКА против закола ==');
for(const s of СЕМЕНА){ const a=мера(K0,s); if(!a.sb.perem) continue;
  const b=мера(БЕЗ_П,s);
  console.log('  '+String(s).padStart(10)+'  R '+(a.sb.Rperem/1e3).toFixed(0).padStart(4)+'к'+
    '  скз '+a.скз.toFixed(4)+'/'+b.скз.toFixed(4)+'  нулей '+a.нулей.toFixed(0).padStart(5)+'/'+b.нулей.toFixed(0).padStart(5)); }
console.log('\n== ЖЕЛЕЗКА против закола (призвук в покое) ==');
for(const s of СЕМЕНА){ const a=мера(K0,s); if(!a.sb.zhest) continue;
  const b=мера(БЕЗ_Ж,s);
  console.log('  '+String(s).padStart(10)+'  скз +'+(Math.max(0,(a.скз/Math.max(b.скз,1e-9)-1))*100).toFixed(0).padStart(3)+'%'); }
console.log('\n== ХОЛОДНАЯ ПАЙКА: голос больной ветви, окна по 100 мс ==');
for(const s of СЕМЕНА){ const п=мера(K0,s,1).sb; if(п.defekt<0) continue;
  const a=голос(K0,s,п.defekt), b=голос(БЕЗ_Д,s,п.defekt);
  console.log('  '+String(s).padStart(10)+'  ветвь '+п.defekt+' Т '+п.Tdef.toFixed(0)+'с'+
    '  мин '+String(a.мин).padStart(5)+'/'+String(b.мин).padStart(5)+
    '  провалов-окон '+a.пров+'/'+b.пров); }
