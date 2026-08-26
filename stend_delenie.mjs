// ТАКТ — ХОД ПО ДЕЛЕНИЯМ. Ручка не «сила синхронизации», а место в
// унтертоновом ряду: качели садятся на целую долю чужого ритма и
// переступают между делениями по мере глубины.
//
// Это то же самое, что уже померено по ВЫСОТЕ на входе в конденсатор —
// 1/8, 1/5, 1/4, 1/3, потом жёсткий захват один к одному. Здесь тот же ряд,
// только медленный: вместо высоты доля такта.
//
// Ничего не считается и не определяется. Деление рождается из захвата.
//
// Контрольный столбец обязателен: без него любая таблица убедительна. Здесь
// он — свободный ход при ТАКТЕ в нуле, и он ДОЛЖЕН не совпадать с входом.
//
// Положения ручки КАЧАНИЕ выбраны так, чтобы свободный ход ложился МЕЖДУ
// целыми долями. Стенд такта уже врал однажды именно на этом: качели там
// случайно шли почти в темп лупа, и таблица показала захват при выключенном
// такте. Совпасть должно от ручки ТАКТ, а не от удачи.
import {readFileSync} from 'fs';
globalThis.sampleRate=48000; let K=null;
globalThis.registerProcessor=(n,k)=>K=k;
globalThis.AudioWorkletProcessor=class{constructor(){this.port={postMessage(){},set onmessage(f){this._f=f},get onmessage(){return this._f}};}};
new Function(readFileSync('./chaos.worklet.js','utf8'))();
const БАЗА={volt:.5,bak:.5,sway:.55,tone:.5,depth:.75,pulse:.2,hit:.35,spread:.15,
 drift:0,range:.5,gryzn:0,golos:.6,gen1:1,gen2:1,gen3:1,link:0,dirt:0,petlya:0,
 kuda:0,naruzhu:0,zhat:0,drive:.15,master:1,pit:1,set:0,sboy:0,gnut:0,derzhi:0,takt:0};

function прогон(sway, takt, bpm, сек=18){
  const c=new K(); c.port.onmessage({data:{t:'seed',v:7}});
  c.port.onmessage({data:{t:'p',v:{...БАЗА, sway, takt}}});
  const n=128,L=new Float32Array(n),R=new Float32Array(n),вх=new Float32Array(n);
  const шаг=60/bpm; let t=0; const фронты=[]; let было=0;
  const пропуск=Math.round(48000*7/n);
  // Порог считается ЗДЕСЬ заново, а не берётся из прибора: замер обязан
  // быть независимым, иначе ошибка в ядре подтвердит сама себя. Правило то
  // же — середина собственного хода узла, потому что под сильным впрыском
  // он садится ниже середины шкалы и там качается.
  let ниж=1, вер=0;
  for(let b=0;b<Math.round(48000*сек/n);b++){
    for(let i=0;i<n;i++){ const ф=(t%шаг)/шаг;
      вх[i]=Math.exp(-ф*26)*Math.sin(2*Math.PI*70*t)*.8; t+=1/48000; }
    c.process([[вх]],[[L,R]]);
    const u=c.pr.swing.u;
    const в=n/48000/3;
    ниж=Math.min(u, ниж+(u-ниж)*в); вер=Math.max(u, вер+(u-вер)*в);
    const сер=(ниж+вер)*.5;
    if(b>пропуск){ if(вер-ниж>.02 && было<=сер && u>сер) фронты.push(b*n/48000); было=u; }
  }
  const пер=[]; for(let i=1;i<фронты.length;i++) пер.push(фронты[i]-фронты[i-1]);
  if(пер.length<2) return {T:0, сцепка:0};
  const s=пер.slice().sort((a,b)=>a-b);
  // Сцепка с долей по кругу: держится ли фронт на одном месте сетки.
  let sx=0, sy=0;
  for(const f of фронты){ const φ=2*Math.PI*((f%шаг)/шаг); sx+=Math.cos(φ); sy+=Math.sin(φ); }
  return {T:s[s.length>>1], сцепка:Math.sqrt(sx*sx+sy*sy)/фронты.length};
}
// На какое целое отношение к доле сел период. Только целые и только их
// обратные — подбирать дроби с допуском значит подгонять, это уже было.
function деление(T, доля){
  if(!T) return '—';
  const о=T/доля;
  let луч=null, пром=1;
  for(const k of [1,2,3,4,5,6,8]){
    for(const [и,в] of [[String(k)+':1', k], ['1:'+k, 1/k]]){
      const p=Math.abs(о-в)/в;
      if(p<пром){ пром=p; луч=и; }
    }
  }
  return пром<.05 ? луч : '('+о.toFixed(2)+')';
}
const BPM=110, доля=60/BPM;
console.log('Вход: удары '+BPM+' в минуту, доля '+доля.toFixed(3)+' с.');
console.log('«k:1» — качели длиннее доли в k раз. Контроль — ТАКТ в нуле.\n');
for(const sway of [.40, .625, .70, .78]){
  const св=прогон(sway, 0, BPM);
  console.log('  ручка КАЧАНИЕ '+sway.toFixed(2)+' · свободный ход '+св.T.toFixed(3)+
              ' с = '+деление(св.T, доля)+' · сцепка '+св.сцепка.toFixed(2));
  const ряд=[];
  for(const takt of [.15,.3,.45,.6,.75,.9,1]){
    const r=прогон(sway, takt, BPM);
    ряд.push('  ТАКТ '+takt.toFixed(2)+'  '+r.T.toFixed(3)+' с  '+
             деление(r.T, доля).padStart(6)+'  сцепка '+r.сцепка.toFixed(2));
  }
  console.log(ряд.join('\n')+'\n');
}
