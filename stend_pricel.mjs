// ПРИЦЕЛ И ВПРЫСК — встают ли качели в такт от одного прокрута ручки.
//
// ТАКТ делает два дела: ВЕДЁТ период к измеренному и ВПРЫСКИВАЕТ удары.
// Ведение задаёт частоту, впрыск ловит фазу. Проверяется и то, и другое.
//
// Сила впрыска подбирается ЗДЕСЬ, а не на глаз. Слишком сильный впрыск не
// захватывает узел, а заменяет его ход своим: качели повторяют долю входа
// один в один вместо такта из четырёх. Слишком слабый не держит фазу.
// Контрольный прогон (ТАКТ в нуле) обязателен: без него любая таблица
// выглядит убедительно.
import {readFileSync} from 'fs';
const ИСХ = readFileSync('./chaos.worklet.js','utf8');
globalThis.sampleRate=48000;
globalThis.AudioWorkletProcessor=class{constructor(){this.port={postMessage(){},set onmessage(f){this._f=f},get onmessage(){return this._f}};}};
function ядро(vpr){
  let K=null; globalThis.registerProcessor=(n,k)=>K=k;
  new Function(ИСХ.replace('const VPRYSK = 8;','const VPRYSK = '+vpr+';'))();
  return K;
}
const БАЗА={volt:.5,bak:.5,sway:.55,tone:.5,depth:.75,pulse:.2,hit:.35,spread:.15,
 drift:0,range:.5,gryzn:0,golos:.6,gen1:1,gen2:1,gen3:1,link:0,dirt:0,petlya:0,
 kuda:0,naruzhu:0,zhat:0,drive:.15,master:1,pit:1,set:0,sboy:0,gnut:0,derzhi:0,takt:0};

function прогон(K, sway, takt, bpm, дать, сек=20){
  const c=new K(); c.port.onmessage({data:{t:'seed',v:7}});
  c.port.onmessage({data:{t:'p',v:{...БАЗА, sway, takt}}});
  if(дать) c.port.onmessage({data:{t:'temp', bpm, shag:60/bpm}});
  const n=128,L=new Float32Array(n),R=new Float32Array(n),вх=new Float32Array(n);
  const шаг=60/bpm; let t=0; const фронты=[]; let было=0;
  const пропуск=Math.round(48000*9/n);
  for(let b=0;b<Math.round(48000*сек/n);b++){
    for(let i=0;i<n;i++){ const ф=(t%шаг)/шаг;
      вх[i]=Math.exp(-ф*26)*Math.sin(2*Math.PI*70*t)*.8; t+=1/48000; }
    c.process([[вх]],[[L,R]]);
    const u=c.pr.swing.u;
    if(b>пропуск){ if(было<=.5 && u>.5) фронты.push(b*n/48000); было=u; }
  }
  const пер=[]; for(let i=1;i<фронты.length;i++) пер.push(фронты[i]-фронты[i-1]);
  if(пер.length<2) return {T:0, дрож:1};
  const s=пер.slice().sort((a,b)=>a-b), m=s[s.length>>1];
  // ФАЗА — ради неё впрыск и стоит. Период можно навести прицелом, но
  // попасть в ДОЛЮ прицел не умеет: он знает, как часто, и не знает, когда.
  // Меряем, куда фронт качелей падает относительно сетки долей входа, и
  // насколько это место держится. Разброс считается по кругу — иначе фаза у
  // самого края (0.99 и 0.01) прочтётся как разбежавшаяся, хотя это соседи.
  let sx=0, sy=0;
  for(const f of фронты){ const φ=2*Math.PI*((f%шаг)/шаг); sx+=Math.cos(φ); sy+=Math.sin(φ); }
  const сцепка = фронты.length ? Math.sqrt(sx*sx+sy*sy)/фронты.length : 0;
  return {T:m, дрож:Math.sqrt(пер.reduce((a,v)=>a+(v-m)*(v-m),0)/пер.length)/m, сцепка};
}
const ВХОДЫ=[90,128,160], РУЧКИ=[.40,.55,.70];
console.log('Качель = такт из четырёх долей: цель 240/bpm секунд.');
console.log('Промах вчетверо = схлопывание в унисон: качели пошли по доле.\n');
console.log('  впрыск   попало   дрожание   сцепка с долей   на что сел');
console.log('  (0 = прицел без впрыска, контроль)');
for(const vpr of [0, .3, .6, 1, 1.5, 2.2, 3]){
  const K=ядро(vpr); let ок=0, дрож=0, сц=0, n=0; const кратн={};
  for(const sway of РУЧКИ) for(const bpm of ВХОДЫ){
    const r=прогон(K, sway, 1, bpm, 1); n++;
    if(!r.T) continue;
    const цель=240/bpm, отн=r.T/цель;
    дрож+=r.дрож; сц+=r.сцепка;
    if(Math.abs(отн-1)<.06) ок++;
    // На каком делении сел: 1 — такт, 1/4 — доля.
    const бл=[1,.5,.25,2].reduce((a,b)=>Math.abs(отн-b)<Math.abs(отн-a)?b:a);
    const им = бл===1?'такт':бл===.5?'полтакта':бл===.25?'доля':'два такта';
    кратн[им]=(кратн[им]||0)+1;
  }
  console.log('  '+String(vpr).padStart(6)+'    '+(ок+'/'+n).padStart(5)+'   '+
    (дрож/n*100).toFixed(1).padStart(8)+'%   '+(сц/n).toFixed(3).padStart(13)+'   '+
    Object.entries(кратн).map(([k,v])=>k+'×'+v).join(' '));
}
// Контроль: без ТАКТА период задаёт только ручка, и он не обязан совпадать.
const K0=ядро(8);
console.log('\n  контроль — ТАКТ в нуле, вход тот же:');
for(const sway of РУЧКИ){
  const r=прогон(K0, sway, 0, 128, 0);
  console.log('    ручка '+sway.toFixed(2)+' → период '+r.T.toFixed(3)+
              ' с (цель была бы '+(240/128).toFixed(3)+')');
}
