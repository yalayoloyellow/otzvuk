// ОКРАС — автоэквализация к профилю шума. Мера прямая: энергия восьми
// октавных полос выхода. У розового профиля полосы должны выровняться,
// у белого — удваиваться с каждой, у коричневого — падать вдвое.
// Контроль — окрас в нуле: естественный наклон прибора, какой уж есть.
import {readFileSync} from 'fs';
globalThis.sampleRate=48000; let K=null;
globalThis.registerProcessor=(n,k)=>K=k;
globalThis.AudioWorkletProcessor=class{constructor(){this.port={postMessage(){},set onmessage(f){this._f=f},get onmessage(){return this._f}};}};
new Function(readFileSync('./chaos.worklet.js','utf8'))();
const БАЗА={sway:.55,depth:.75,gryzn:0,golos:0,petlya:0,
 kuda:0,zhat:0,drive:.15,master:1,pit:1,sboy:0,gnut:0,derzhi:0,
 takt:0,razved:0,slip:0,chop:0,skru:0,okras:0,profil:0};
const ГРАН=[80,160,320,640,1280,2560,5120];
// Полосы — каскадом из трёх, как в приборе, но написаны здесь заново:
// мерило обязано быть независимым, а не одолженным. Одиночный однополюсник
// в мериле размазывал собственный замер — юбки в шесть децибел на октаву.
function полосы(y){
  const лп=new Float32Array(21), a=ГРАН.map(f=>1-Math.exp(-2*Math.PI*f/48000));
  const e=new Float64Array(8);
  for(const v of y){
    let пред=0;
    for(let k=0;k<7;k++){
      const о=k*3;
      лп[о]+=(v-лп[о])*a[k]; лп[о+1]+=(лп[о]-лп[о+1])*a[k]; лп[о+2]+=(лп[о+1]-лп[о+2])*a[k];
      const б=лп[о+2]-пред; e[k]+=б*б; пред=лп[о+2];
    }
    const б=v-пред; e[7]+=б*б;
  }
  return e;
}
function прогон(п, сек=10){
  const c=new K(); c.port.onmessage({data:{t:'seed',v:7}});
  c.port.onmessage({data:{t:'p',v:{...БАЗА,...п}}});
  const n=128,L=new Float32Array(n),R=new Float32Array(n),вх=new Float32Array(n);
  const y=[];
  for(let b=0;b<Math.round(48000*сек/n);b++){
    c.process([[вх]],[[L,R]]);
    if(b>Math.round(48000*4/n)) for(let i=0;i<n;i++) y.push(L[i]);
  }
  return полосы(y);
}
// Наклон: средний шаг (дБ на полосу) по линейной подгонке.
function наклон(e){
  const л=[...e].map(v=>10*Math.log10(Math.max(v,1e-14)));
  let n=8, sx=0, sy=0, sxy=0, sxx=0;
  for(let k=0;k<n;k++){ sx+=k; sy+=л[k]; sxy+=k*л[k]; sxx+=k*k; }
  return (n*sxy-sx*sy)/(n*sxx-sx*sx);
}
console.log('Наклон спектра, дБ на октавную полосу. Цели: белый +3, розовый 0, коричневый −3.\n');
const св=прогон({});
console.log('  окрас 0 (контроль)   наклон '+наклон(св).toFixed(1).padStart(5)+'   ← природный');
for(const [пр,имя,цель] of [[0,'белый',3],[.5,'розовый',0],[1,'коричневый',-3]]){
  const e=прогон({okras:1, profil:пр});
  const н=наклон(e);
  console.log('  '+имя.padEnd(19)+'  наклон '+н.toFixed(1).padStart(5)+'   цель '+String(цель).padStart(3)+
    (Math.abs(н-цель)<1.2?'  ✓':'  ×'));
}
console.log('\n  полглубины (okras .5, розовый): наклон '+наклон(прогон({okras:.5, profil:.5})).toFixed(1)+
            ' — между природным и целью');
