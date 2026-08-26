// МЕТАЛЛ НА ПЛОЩАДКАХ (⇧V). Проверяем не «стало ли громче», а изменилась ли
// ТОПОЛОГИЯ: одна точка под металлом обязана не делать НИЧЕГО — предмету
// некуда деть ток, — а пара обязана сваривать. Пальцем наоборот: одна точка
// уже слышна, потому что ладонь держит тело на общем проводе.
//
// Двенадцать точек:
//   1 2 3   узлы заряда          4 5 6   выходы генераторов
//   7 качели   8 гул   9 сумм. точка   10 накал   11 шина   12 земля
//   13 — пробел, ладонь на корпусе
import {readFileSync} from 'fs';
globalThis.sampleRate=48000; let K=null;
globalThis.registerProcessor=(n,k)=>K=k;
globalThis.AudioWorkletProcessor=class{constructor(){this.port={postMessage(){},set onmessage(f){this._f=f},get onmessage(){return this._f}};}};
new Function(readFileSync('/Users/yala/otzvuk/chaos.worklet.js','utf8'))();
const Б={volt:.5,bak:.5,sway:.55,tone:.5,depth:.75,pulse:.2,hit:.35,spread:.15,drift:0,
 range:.5,gryzn:0,golos:0,gen1:1,gen2:1,gen3:1,dirt:0,petlya:0,kuda:0,zhat:0,drive:.15,master:1,pit:1,set:0,sboy:0};
const СЛУЧАИ=[['ничего',[]],['одна: узел 1',[1]],['узел1 + ладонь',[1,13]],
              ['узел1+узел2',[1,2]],['узел1+земля',[1,12]],['узел1+шина',[1,11]],
              ['выход1→узел2',[4,2]],['гул→узел3',[8,3]],['сумм.точка+узел1',[9,1]],
              ['все три узла',[1,2,3]]];
function прогон(мет, площ, seed){
  const c=new K(); c.port.onmessage({data:{t:'seed',v:seed}});
  c.port.onmessage({data:{t:'p',v:{...Б,sboy:мет?1:0}}});
  const n=128,L=new Float32Array(n),R=new Float32Array(n);
  const пл=new Array(14).fill(0); for(const i of площ) пл[i]=1;
  for(let b=0;b<Math.round(48000*2/n);b++) c.process([[]],[[L,R]]);
  c.port.onmessage({data:{t:'pads',v:пл}});
  let kv=0,k=0; const f=[];
  for(let b=0;b<Math.round(48000*8/n);b++){
    c.process([[]],[[L,R]]);
    for(let i=0;i<n;i++){ kv+=L[i]*L[i]; k++; }
    if(b%8===0) f.push(c.pr.cells[0].f||0);
  }
  const мед=a=>{const b=a.slice().sort((x,y)=>x-y);return b[b.length>>1]||0;};
  return {скз:Math.sqrt(kv/k), f:мед(f.filter(v=>v>5))};
}
for(const seed of [1626943591,139297718]){
  console.log('\n══ сборка '+seed+' ══');
  const эт=прогон(0,[],seed);
  console.log('  что нажато            палец: дБ / f1        металл: дБ / f1');
  for(const [имя,пл] of СЛУЧАИ){
    const п=прогон(0,пл,seed), м=прогон(1,пл,seed);
    const дб=x=>20*Math.log10(Math.max(1e-9,x.скз)/эт.скз);
    console.log('  '+имя.padEnd(20)
      +(дб(п).toFixed(1)+' / '+п.f.toFixed(0)+' Гц').padStart(18)
      +(дб(м).toFixed(1)+' / '+м.f.toFixed(0)+' Гц').padStart(20));
  }
}
