// FAULT — ДЕРЖИМАЯ НЕИСПРАВНОСТЬ. Плохая пайка на дорожке, по которой течёт
// ток громкоговорителя; логика сидит на той же дорожке и получает на питание
// копию собственного выхода.
//
// Стенд отвечает на два вопроса.
//   1. Почему сопротивление именно такое: развёртка по омам.
//   2. Жив ли прибор на СВОИХ номиналах: прогон по сборкам.
//
// Меры выбраны так, чтобы ловить не громкость, а характер:
//   уровень      громче или тише выключенного
//   дыры         доля времени, когда прибор почти замолк
//   комедия      медленная полоса огибающей к зерну; выше двойки — шарик
//   рябь         насколько глубоко качается питание у самой логики
import {readFileSync} from 'fs';
globalThis.sampleRate = 48000; let K = null;
globalThis.registerProcessor = (n,k) => K = k;
globalThis.AudioWorkletProcessor = class { constructor(){ this.port={postMessage(){},set onmessage(f){this._f=f},get onmessage(){return this._f}}; } };
new Function(readFileSync('./chaos.worklet.js','utf8'))();

const БАЗА = {volt:.5,bak:.5,sway:.55,tone:.5,depth:.75,pulse:.2,hit:.35,spread:.15,
              drift:0,range:.5,gryzn:0,golos:0,gen1:1,gen2:1,gen3:0,link:0,dirt:0,
              petlya:0,kuda:0,naruzhu:0,zhat:0,drive:.15,master:1,pit:1,set:0,sboy:0};
const СЕМЕНА = [1626943591,139297718,3016926094,770901,4242424,909091,22001];

function прогон(seed, R, сек = 4){
  const c = new K();
  c.port.onmessage({data:{t:'seed', v:seed}});
  c.port.onmessage({data:{t:'p', v:{...БАЗА, sboy: R === null ? 0 : 1}}});
  if (R) c.pr.sb.Rdor = R;
  const n=128, L=new Float32Array(n), Rr=new Float32Array(n);
  const всего=Math.round(48000*сек/n), греть=Math.round(48000*1.2/n);
  const окно=Math.round(48000*.02/n);
  const ог=[]; let kv=0,k=0,ш=0, Vs=0,Vk=0,Vn=0, nan=0;
  for (let b=0;b<всего;b++){
    c.process([[]],[[L,Rr]]);
    if (b<греть) continue;
    for (let i=0;i<n;i++){ if(!(L[i]===L[i])) nan++; kv+=L[i]*L[i]; k++; }
    const v=c.pr.Vpit; Vs+=v; Vk+=v*v; Vn++;
    if (++ш>=окно){ ог.push(Math.sqrt(kv/k)); kv=0;k=0;ш=0; }
  }
  const m=Vs/Vn;
  return {ог, nan, Rdor:c.pr.sb.Rdor,
          скз: Math.sqrt(ог.reduce((a,b)=>a+b*b,0)/ог.length),
          рябь: Math.sqrt(Math.max(0,Vk/Vn-m*m))/m*100};
}
// энергия огибающей в полосе — прямым перебором частот, окон немного
function полоса(x,f1,f2){
  const N=x.length, ср=x.reduce((a,b)=>a+b,0)/N;
  let E=0,шт=0;
  for(let f=f1;f<=f2;f+=.2){ let re=0,im=0; const w=2*Math.PI*f/50;
    for(let i=0;i<N;i++){ const d=x[i]-ср; re+=d*Math.cos(w*i); im-=d*Math.sin(w*i); }
    E+=Math.sqrt(re*re+im*im)/N; шт++; }
  return E/шт/(ср||1e-9);
}
const свод = р => ({
  дыр: р.ог.filter(v=>v<р.эт*.03).length/р.ог.length*100,
  ком: полоса(р.ог,.3,3)/полоса(р.ог,5,20),
});

console.log('РАЗВЁРТКА ПО СОПРОТИВЛЕНИЮ ДОРОЖКИ (среднее по четырём сборкам)');
console.log('    Ом   уровень   дыры   комедия   рябь питания');
for (const R of [null, 5, 10, 25, 45, 70, 120]){
  let у=0,д=0,км=0,ряб=0;
  for (const s of СЕМЕНА.slice(0,4)){
    const эт=прогон(s,null), р=прогон(s,R);
    р.эт=эт.скз; const c2=свод(р);
    у+=20*Math.log10(Math.max(1e-9,р.скз)/Math.max(1e-9,эт.скз))/4;
    д+=c2.дыр/4; км+=c2.ком/4; ряб+=р.рябь/4;
  }
  console.log('  '+(R===null?'выкл':String(R).padStart(4))+'   '
    +((у>=0?'+':'')+у.toFixed(1)).padStart(5)+' дБ  '+д.toFixed(1).padStart(5)+' %   '
    +км.toFixed(2).padStart(5)+'    '+ряб.toFixed(1).padStart(5)+' %');
}
console.log('\nНА СВОИХ НОМИНАЛАХ, ПО СБОРКАМ');
console.log('  сборка        Rдор   уровень   дыры   NaN   рябь питания');
let плохо=0;
for (const s of СЕМЕНА){
  const эт=прогон(s,null), р=прогон(s,0);   // 0 — не трогать номинал сборки
  р.эт=эт.скз; const c2=свод(р);
  const дб=20*Math.log10(Math.max(1e-9,р.скз)/Math.max(1e-9,эт.скз));
  if (р.nan || c2.дыр>2) плохо++;
  console.log('  '+String(s).padStart(10)+'   '+р.Rdor.toFixed(0).padStart(4)+' Ом   '
    +((дб>=0?'+':'')+дб.toFixed(1)).padStart(5)+' дБ  '+c2.дыр.toFixed(1).padStart(5)+' %   '
    +String(р.nan).padStart(3)+'   '+р.рябь.toFixed(1).padStart(5)+' %');
}
console.log(плохо ? '  ПЛОХИХ СБОРОК: '+плохо : '  все сборки живы, дыр нет');
