// SLIP — РАСФАЗИРОВКА СЛОЁВ. Увод трёх медленных узлов чуть врозь.
//
// ЧТО ПОКАЗАЛ ПЕРВЫЙ ЗАМЕР (карта SYNC × SLIP): под тягой захвата увод
// НЕ живёт — язык при SYNC выше половины глотает и тринадцать процентов
// увода целиком, а у средних SYNC слои шатаются и без него. Проскальзывания
// «чуть мимо целого» из этой ручки не вышло, и это сказано прямо.
//
// ГДЕ ОРГАН НАСТОЯЩИЙ — свободный ход. Три почти одинаковых слоя, каждый
// уведён на свою долю процента, расходятся фазой ДРУГ ОТНОСИТЕЛЬНО ДРУГА:
// медленное биение слоёв без всякого входа. SLIP и SYNC — антагонисты по
// самой схеме: тяга к чужому ритму замораживает взаимный дрейф.
//
// Мера — ВЗАИМНЫЙ дрейф пар слоёв: оборотов фазы за двадцать секунд.
// Ноль — слои сварены, N — слой обгоняет соседа N раз.
import {readFileSync} from 'fs';
globalThis.sampleRate=48000; let K=null;
globalThis.registerProcessor=(n,k)=>K=k;
globalThis.AudioWorkletProcessor=class{constructor(){this.port={postMessage(){},set onmessage(f){this._f=f},get onmessage(){return this._f}};}};

// ЗАКОЛ КОНСТИТУЦИИ. Стенд механизма обязан мерить МЕХАНИЗМ, а не экземпляр:
// после переезда ручек в зерно у каждого семени своё гуляние и своя
// асимметрия, и сквозь них захват не виден. Подмена сохраняет розыгрыш
// (поток семени не сдвигается — скобочный трюк), но приколачивает значение.
function ядроСКонституцией(подмены){
  let ИСХ = readFileSync('./chaos.worklet.js','utf8');
  for(const [что, чем] of подмены){
    if(!ИСХ.includes(что)) throw new Error('якорь конституции устарел: '+что);
    ИСХ = ИСХ.replace(что, чем);
  }
  let ЯК=null; globalThis.registerProcessor=(n,k)=>ЯК=k;
  new Function(ИСХ)();
  return ЯК;
}
const БЕЗ_ГУЛЯНИЯ = [
  ["this.zDrift  = m(0, .50);", "this.zDrift  = (m(0, .50), 0);"],
  ["this.zHit    = m(.15, .65);", "this.zHit    = (m(.15, .65), .35);"],
  ["this.nGen = жр < .22 ? 2 : жр < .72 ? 3 : 4;", "this.nGen = (жр, 3);"],
];
let K2 = ядроСКонституцией(БЕЗ_ГУЛЯНИЯ); K = K2;
const БАЗА={sway:.55,depth:.75,gryzn:0,golos:0,petlya:0,
 kuda:0,zhat:0,drive:.15,master:1,pit:1,sboy:0,gnut:0,derzhi:0,
 takt:0,razved:0,slip:0,derzhi2:0,derzhi3:0};
function прогон(п, сек=26){
  const c=new K(); c.port.onmessage({data:{t:'seed',v:7}});
  c.port.onmessage({data:{t:'p',v:{...БАЗА, ...п}}});
  const n=128,L=new Float32Array(n),R=new Float32Array(n),вх=new Float32Array(n);
  const фр=[[],[],[]], было=[0,0,0], ниж=[1,1,1], вер=[0,0,0];
  const пропуск=Math.round(48000*6/n);
  for(let b=0;b<Math.round(48000*сек/n);b++){
    c.process([[вх]],[[L,R]]);
    const в=n/48000/3;
    for(let k=0;k<3;k++){
      const u=c.pr.swings[k].u;
      ниж[k]=Math.min(u,ниж[k]+(u-ниж[k])*в); вер[k]=Math.max(u,вер[k]+(u-вер[k])*в);
      const сер=(ниж[k]+вер[k])*.5;
      if(b>пропуск && вер[k]-ниж[k]>.02 && было[k]<=сер && u>сер) фр[k].push(b*n/48000);
      было[k]=u;
    }
  }
  // Взаимный дрейф пары: фаза фронтов слоя Б в сетке периодов слоя А.
  function дрейф(A, B){
    if(A.length<4 || B.length<4) return 0;
    const T=(A[A.length-1]-A[0])/(A.length-1);
    let наб=0, прош=null;
    for(const f of B){
      const φ=(f%T)/T;
      if(прош!==null) наб += ((φ-прош+.5)%1+1)%1 - .5;
      прош=φ;
    }
    return Math.abs(наб);
  }
  return {д01:дрейф(фр[0],фр[1]), д02:дрейф(фр[0],фр[2]), д12:дрейф(фр[1],фр[2]),
          n:фр.map(a=>a.length)};
}
console.log('Входа нет. Взаимный дрейф пар слоёв, оборотов за двадцать секунд.\n');
console.log('            пара 1-2   пара 1-3   пара 2-3');
for(const sl of [0,.25,.5,.75,1]){
  const r=прогон({slip:sl});
  console.log('  SLIP '+sl.toFixed(2)+'   '+[r.д01,r.д02,r.д12].map(v=>v.toFixed(1).padStart(7)).join('    ')+
    (sl?'':'    ← контроль: без увода слои сварены'));
}
console.log('\n  тот же увод под тягой — SYNC душит дрейф (это свойство схемы):');
for(const tk of [.4,.7]){
  const r=прогон({slip:1, takt:tk, golos:.6});
  console.log('  SLIP 1.00 SYNC '+tk.toFixed(1)+'   '+[r.д01,r.д02,r.д12].map(v=>v.toFixed(1).padStart(7)).join('    '));
}
