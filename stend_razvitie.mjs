// РАЗВИТИЕ — макровремя прибора. Три механизма, каждый против закола.
//
//   Фраза A-A-A-B: четвёртый цикл узора — филл, отличный от основного.
//   Дребезг рисунка: раз в N тактов сетка на такт перещёлкивает рисунок.
//   Электролит: утечка платы блуждает — тембр плывёт за минуты сам.
import {readFileSync} from 'fs';
globalThis.sampleRate=48000;
globalThis.AudioWorkletProcessor=class{constructor(){this.port={postMessage(){},set onmessage(f){this._f=f},get onmessage(){return this._f}};}};
const ИСХ = readFileSync('./chaos.worklet.js','utf8');
function ядро(п){ let С=ИСХ;
  for(const [а,б] of п){ if(!С.includes(а)) throw new Error('якорь: '+а); С=С.replace(а,б); }
  let К=null; globalThis.registerProcessor=(n,k)=>К=k; new Function(С)(); return К; }
const K0=ядро([]);
const БЕЗ_Э=ядро([["this.elek = ж < .45 ? 1 : 0; }","this.elek = 0; }"]]);

// 1. Фраза: окна нулей по циклам — четвёртый отличен от первых трёх.
{
  const c=new K0(); c.port.onmessage({data:{t:'seed',v:1626943591}});
  c.port.onmessage({data:{t:'metr',v:120}});
  c.port.onmessage({data:{t:'p',v:{uzor:1}}});
  const n=128,L=new Float32Array(n),R=new Float32Array(n),вх=new Float32Array(n);
  for(let b=0;b<Math.round(48000*2/n);b++) c.process([[вх]],[[L,R]]);
  const ЦИКЛ=Math.round(48000*4/n);
  const проф=[[],[],[],[]]; let было=-1, сдвиг=-1;
  for(let b=0;b<ЦИКЛ*8;b++){
    c.process([[вх]],[[L,R]]);
    if(сдвиг<0 && c.uzTakt===0 && c.uzCikl!==было) сдвиг=b%ЦИКЛ;
    было=c.uzCikl;
    let s=0; for(let i=0;i<n;i++) s+=Math.abs(L[i]);
    проф[c.uzCikl].push(s/n);
  }
  // Мера прямая: провальные окна на цикл. Огибающая-скз слепа к узору.
  const пров=п=>{
    const мед=п.slice().sort((a,b)=>a-b)[п.length>>1]||1e-6;
    let к=0,в=0; for(const v of п){ const x=v<мед*.4; if(x&&!в)к++; в=x; } return к; };
  console.log('== фраза A-A-A-B (семя 1626943591, узор 1) ==');
  console.log('  провальных окон на цикл: '+проф.map(пров).join(' / ')+
    '   (четвёртый — филл, ему положено отличаться)');
}
// 2. Дребезг: рисунок сетки меняется раз в N тактов.
{
  let нашли=0, семя=0;
  for(const s of [1626943591,139297718,770901,7,777,12345,31337,555]){
    const c=new K0(); c.port.onmessage({data:{t:'seed',v:s}});
    if(c.pr.sb.sbivKest){ нашли=1; семя=s;
      const n=128,L=new Float32Array(n),R=new Float32Array(n),вх=new Float32Array(n);
      let смен=0, былоР=-1, тактов=0, былШ=0;
      for(let b=0;b<Math.round(48000*60/n);b++){
        c.process([[вх]],[[L,R]]);
        if(c.pr.setka.shag===0 && былШ!==0) тактов++;
        былШ=c.pr.setka.shag;
        const р=c.pr.setka.kod;
        if(былоР>=0 && р!==былоР) смен++;
        былоР=р;
      }
      console.log('== дребезг рисунка (семя '+s+', N='+c.pr.sb.sbivN+') ==');
      console.log('  за минуту: тактов '+тактов+', смен рисунка '+смен+
        ' (ожидание: примерно '+(2*Math.floor(тактов/c.pr.sb.sbivN))+')');
      break;
    }
  }
  if(!нашли) console.log('== дребезг: среди восьми семян нет коробки с дребезгом ==');
}
// 3. Электролит: центроид начала против конца, с заколом.
{
  function центр(K, seed){
    const c=new K(); c.port.onmessage({data:{t:'seed',v:seed}});
    const n=128,L=new Float32Array(n),R=new Float32Array(n),вх=new Float32Array(n);
    const нач=[], кон=[];
    let пп=0;
    for(let b=0;b<Math.round(48000*150/n);b++){
      c.process([[вх]],[[L,R]]);
      let нулей=0; for(let i=0;i<n;i++){ if(пп<=0&&L[i]>0)нулей++; пп=L[i]; }
      const t=b*n/48000;
      if(t>3&&t<30) нач.push(нулей);
      if(t>120) кон.push(нулей);
    }
    const ср=a=>a.reduce((x,v)=>x+v,0)/a.length;
    return Math.abs(ср(кон)-ср(нач))/ср(нач)*100;
  }
  console.log('== электролит: уход высоты за две минуты, % ==');
  for(const s of [1626943591,139297718,770901,7,777,12345,31337,555]){
    const c=new K0(); c.port.onmessage({data:{t:'seed',v:s}});
    if(!c.pr.sb.elek) continue;
    console.log('  семя '+String(s).padStart(10)+'  глубина '+c.pr.sb.elekGlub.toFixed(2)+
      '  с дыханием '+центр(K0,s).toFixed(1)+'%   закол '+центр(БЕЗ_Э,s).toFixed(1)+'%');
  }
}
