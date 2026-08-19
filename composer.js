// ============================================================================
//  КОМПОЗИТОР
//
//  Здесь нет сценария. Форма выводится процессом, поэтому её нельзя выучить.
//
//  1. НАПРЯЖЕНИЕ. Ходит по своей траектории (подъём — удержание — обвал), тип
//     секции выбирается из того, где оно сейчас и куда движется.
//  2. ЭПОХИ. Раз в несколько минут смещаются сами диапазоны внутри границ
//     профиля — у трека появляются периоды, а не однородность.
//  3. ТАБУ. Система помнит недавние конфигурации и уводит выбор от них.
//     Равномерный рандом приедается именно потому, что этого не делает.
//  4. МНОГО ЧАСОВ. События живут на такте, фразе, секции и эпохе разом —
//     ухо не может синхронизироваться с одной сеткой.
//  5. РЕДКОЕ. Раз в десятки секций случается то, чего ещё не было.
//
//  Профиль задаёт границы и склонности, а не последовательность.
//
//  DOM здесь запрещён: наружу — фабрика makeComposer(env), где env даёт
//  движок (post), контекст (ctx), подмену материала (swap) и строку формы
//  (onForm). Так композитора можно гонять в стенде без страницы.
// ============================================================================
import {genMaterial, mul32} from './material.js';
import {pickGroove} from './groove.js';
import {extract} from './feat.js';
import {emptyModel, score as vscore, fitness} from './vkus.js';

const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const rnd=(a,b)=>a+Math.random()*(b-a);
const pick=a=>a[(Math.random()*a.length)|0];

export const PROFILES={
  'авангард':{
    // Здесь сила в плавности и в богатстве материала, а не в сломах:
    // резкое допускается редко, переходы длинные, дрон не доминирует.
    bpm:[64,124], barsBase:[6,22], rhyProb:.45, rhyLvl:[.35,.85],
    xfLo:[5,20], xfHi:[1.5,6], crunch:[0,7], stability:.55,
    hardProb:.15,                   // как часто вообще случается резкое
    pat:null,                       // рисунок из семени
    tension:{rise:.045, fall:.07, hold:.5}
  },
  'хип-хоп':{
    bpm:[132,164], barsBase:[8,16], rhyProb:.92, rhyLvl:[.75,1.25],
    xfLo:[2,7], xfHi:[.5,1.6], crunch:[0,6], stability:.82, hardProb:.3,
    // рейдж: удар на раз и синкопы, редко и жирно
    pat:[['1000000010000000','0000100000001000'],
         ['1000001000100000','0000100000001000'],
         ['1000000010010000','0000100000101000'],
         ['1001000000100000','0000100000001000']],
    tension:{rise:.075, fall:.30, hold:.62}
  },
  'техно':{
    bpm:[126,142], barsBase:[16,32], rhyProb:1, rhyLvl:[.7,1.15],
    xfLo:[6,20], xfHi:[.2,1], crunch:[0,8], stability:.92, hardProb:.35,
    pat:[['1000100010001000','0010001000100010'],
         ['1000100010001000','0000101000001010'],
         ['1000100010001010','0010001000100000']],
    tension:{rise:.035, fall:.14, hold:.75}
  }
};

// ---- жанровая партия ударных ----------------------------------------------
// Рисунки не случайные: это то, из чего жанр собственно и состоит. Случайность
// живёт в выборе варианта, в раскатах и в окраске, а не в самой сетке.
export const KITS={
  'хип-хоп':{
    // Семейства бочки: без них тембр всегда один и тот же и приедается
    fam:[ // щелчок и форма спада высоты — то, чем 808 читается в миксе
          {kF:[38,46], kDec:[.55,.95], kSweep:[1.6,2.4], kDrive:[.75,.95],
           kClick:[.5,.9],  kClkMs:[.003,.006], kDropMs:[.03,.07]},   // длинный 808
          {kF:[46,58], kDec:[.22,.45], kSweep:[2.6,3.8], kDrive:[.5,.75],
           kClick:[.7,1.2], kClkMs:[.002,.004], kDropMs:[.012,.03]},  // короткий панч
          {kF:[34,42], kDec:[.7,1.2],  kSweep:[1.2,1.9], kDrive:[.85,1],
           kClick:[.25,.55],kClkMs:[.004,.008], kDropMs:[.05,.11]} ], // глубокий гул
    k:['1000000010000000','1000000010010000','1000001000100000','1001000010000000'],
    h:['1010101010101010','1111111111111111','1010111010101110','1110101011101010'],
    c:['0000100000001000'],
    kF:[40,54], kDec:[.38,.95], kSweep:[2.2,3.4], kDrive:[.6,.95],
    kLvl:[.95,1.3], hDec:[.012,.035], hLvl:[.35,.6], cLvl:[.5,.85], hRoll:[.12,.4]
  },
  'техно':{
    fam:[ {kF:[42,50], kDec:[.22,.38], kSweep:[1.8,2.6], kDrive:[.5,.7],
           kClick:[.35,.7], kClkMs:[.002,.004], kDropMs:[.014,.03]},  // ровный
          {kF:[38,44], kDec:[.32,.5],  kSweep:[1.4,2.1], kDrive:[.7,.9],
           kClick:[.2,.5],  kClkMs:[.003,.006], kDropMs:[.03,.06]},   // тяжёлый
          {kF:[48,58], kDec:[.14,.24], kSweep:[2.6,3.6], kDrive:[.4,.65],
           kClick:[.6,1.1], kClkMs:[.0015,.003],kDropMs:[.008,.018]} ], // сухой
    k:['1000100010001000'],
    h:['0010001000100010','0010101000101010','0010001010100010'],
    c:['0000000000000000','0000100000000000'],
    // ниже, длиннее и с меньшим обвалом: при коротком спаде и большом
    // обвале бочка почти всю жизнь проводит выше 110 Гц и низа не даёт
    kF:[40,50], kDec:[.20,.42], kSweep:[1.8,3], kDrive:[.5,.85],
    kLvl:[1.15,1.5], hDec:[.02,.07], hLvl:[.3,.55], cLvl:[0,.35], hRoll:[0,.08]
  }
};
// Наклон целевой кривой: чистая розовая — для авангарда, жанрам нужен
// заметно более тяжёлый низ и придержанная верхняя середина.
export const TILTS={
  'авангард':[1,1,1,1,1,1.05,1.1,1.15],
  'хип-хоп': [.75,.8,.9,1,1.15,1.5,2.2,3.2],
  'техно':   [.8,.85,.95,1.05,1.2,1.5,2.0,2.6]
};

// ============================================================================
//  ЖАНРОВАЯ АРАНЖИРОВКА
//  В хип-хопе и техно тема одна на весь трек, а развитие делается вычитанием
//  и добавлением, а не новым материалом. Поэтому здесь не процесс, а сетка
//  фраз с состоянием элементов: тема, бас, бочка, хэт, клэп.
// ============================================================================
export const ARR={
  'хип-хоп':{
    phrase:4,                      // сетка по четыре такта
    life:[48,112],                 // сколько тактов живёт тема
    // Цикл на шестнадцать фраз, а не на восемь: восьми хватало на минуту,
    // дальше начинался слышимый повтор — ровно та скука, на которую жалоба.
    plan(n){
      const m=n%16;
      switch(m){
        case 0:  return {hook:1,bass:0,kick:0,hat:0,clap:0};  // тема одна
        case 1:  return {hook:1,bass:1,kick:1,hat:1,clap:1};  // бит вошёл
        case 4:  return {hook:1,bass:0,kick:1,hat:1,clap:1};  // яма: без баса
        case 6:  return {hook:1,bass:1,kick:0,hat:1,clap:0};  // без бочки
        case 8:  return {hook:1,bass:1,kick:1,hat:0,clap:1};  // сняли хэты
        case 11: return {hook:1,bass:1,kick:1,hat:1,clap:0};  // без клэпа
        case 12: return {hook:1,bass:0,kick:1,hat:0,clap:0};  // голая бочка с темой
        case 14: return {hook:0,bass:1,kick:1,hat:1,clap:1};  // тема ушла, бит остался
        default: return {hook:1,bass:1,kick:1,hat:1,clap:1};
      }
    }
  },
  'техно':{
    phrase:8,                      // техно дышит длиннее
    life:[96,224],
    plan(n){
      const m=n%16;
      switch(m){
        case 0:  return {hook:1,bass:0,kick:1,hat:0,clap:0};  // только бочка и тема
        case 1:  return {hook:1,bass:0,kick:1,hat:1,clap:0};  // вошли хэты
        case 2:  return {hook:1,bass:1,kick:1,hat:1,clap:0};  // вошёл низ
        case 5:  return {hook:1,bass:1,kick:0,hat:1,clap:1};  // брейкдаун
        case 8:  return {hook:1,bass:1,kick:1,hat:0,clap:1};  // сняли хэты
        case 10: return {hook:1,bass:0,kick:1,hat:1,clap:1};  // яма без низа
        case 12: return {hook:0,bass:1,kick:1,hat:1,clap:0};  // тема ушла
        case 13: return {hook:1,bass:1,kick:1,hat:1,clap:0};  // вернулась
        default: return {hook:1,bass:1,kick:1,hat:1,clap:1};
      }
    }
  }
};

// Евклидов рисунок (Bjorklund/Toussaint): k ударов, максимально равномерно
// разнесённых по n шагам. Порождает почти все мировые ритмические сетки,
// поэтому даёт разнообразие рисунков без списка вариантов.
export function euclid(k,n,rot){
  k=Math.max(0,Math.min(n,k|0));
  const p=new Array(n).fill(0);
  let bucket=0;
  for(let i=0;i<n;i++){ bucket+=k; if(bucket>=n){ bucket-=n; p[i]=1; } }
  if(rot){ const r=((rot%n)+n)%n; return p.slice(n-r).concat(p.slice(0,n-r)); }
  return p;
}

// Семейства хэта: тембр целиком, не громкость. hNz — доля шума (остальное
// верх дорожки), hRing — металл кольцевой модуляцией, hTone — яркость.
export const HATS={
  'хип-хоп':[
    {name:'шип',   hNz:.9,  hTone:.62, hRing:0,   hDec:[.012,.03], hRoll:[.15,.45]},
    {name:'сухой', hNz:.55, hTone:.80, hRing:0,   hDec:[.006,.014],hRoll:[.2,.5]},
    {name:'звон',  hNz:.35, hTone:.45, hRing:.75, hRingF:[2600,5200], hDec:[.02,.05], hRoll:[.1,.35]},
    {name:'песок', hNz:.25, hTone:.55, hRing:.3,  hRingF:[1800,3400], hDec:[.01,.03], hRoll:[.15,.4]}
  ],
  'техно':[
    {name:'острый',hNz:.85, hTone:.75, hRing:0,   hDec:[.008,.02], hRoll:[0,.08]},
    {name:'мягкий',hNz:.6,  hTone:.5,  hRing:0,   hDec:[.03,.08],  hRoll:[0,.05]},
    {name:'сталь', hNz:.3,  hTone:.5,  hRing:.8,  hRingF:[3000,6000], hDec:[.015,.045], hRoll:[0,.1]}
  ]
};
// Семейства клэпа: 808 — пачка быстрых разрядов плюс хвост.
export const CLAPS={
  'хип-хоп':[
    {name:'808',   cTapsN:3, cGap:[.008,.012], cFreq:[900,1300], cQ:.7,  cTail:[.09,.16], cNz:.85},
    {name:'узкий', cTapsN:2, cGap:[.005,.009], cFreq:[1400,2100],cQ:.5,  cTail:[.04,.08], cNz:.7},
    {name:'толпа', cTapsN:4, cGap:[.012,.02],  cFreq:[700,1100], cQ:.95, cTail:[.14,.26], cNz:.9}
  ],
  'техно':[
    {name:'рим',   cTapsN:1, cGap:[.004,.007], cFreq:[1600,2600],cQ:.4,  cTail:[.02,.05], cNz:.8},
    {name:'808',   cTapsN:3, cGap:[.008,.013], cFreq:[900,1400], cQ:.7,  cTail:[.08,.15], cNz:.85}
  ]
};

export const SRD=[1,2,4,8,12,24,32,48,96,192,320];

export function makeComposer(env){
  const post=env.post;

  let profile='авангард';
  // ---- состояние процесса --------------------------------------------------
  let tension=.2, tDir=1, era=null, eraEndBar=0, curMat='—', curSeed=null;
  let secEndBar=0, curSec='', memory=[], tabu=[], started=false;
  let phraseEnd=0, rareCd=14;
  let hookSeed=null, hookBar=0, phraseN=0;
  let holdCount=0;
  let curKit={k:'1000000010000000'};
  let srPlanT=null, curCrunch=0;
  let curBar=0, lastBpm=0;
  let curGroove=null, curPerc=null, curHat=null;
  // Отбор темы: кандидаты рендерятся беззвучно ЗАРАНЕЕ, пока играет текущая.
  // Иначе смена темы ждала бы пару секунд, а этого слышно нельзя.
  let nextTheme=null, picking=false, model=emptyModel(), lastPick=null;

  const material=seed=>genMaterial(env.ctx(),seed,profile,tasteW);
  const form=(bars,bpm)=>env.onForm({sec:curSec,mat:curMat,bars,bpm,tension,
    groove:curGroove?curGroove.name:null, perc:curPerc});

  // Эпоха: сдвиг самих диапазонов внутри границ профиля.
  function newEra(){
    const P=PROFILES[profile];
    const c=Math.random();               // центр эпохи по темпу
    era={
      bpm: P.bpm[0]+(P.bpm[1]-P.bpm[0])*(.25+c*.5),
      bpmSpread:(P.bpm[1]-P.bpm[0])*rnd(.05,.22),
      barsK: rnd(.7,1.5),                // эпоха длинных или коротких секций
      crunchBias: Math.random()<.35 ? rnd(.4,1) : rnd(0,.25),
      denseBias: rnd(-.25,.25),
      voiceHold: Math.random()<.4        // эпоха, где материал держится долго
    };
    eraEndBar=curBar+Math.round(rnd(60,190));
  }

  // Табу: не повторять недавнее. Держим огрублённые отпечатки конфигураций.
  function tabuOk(sig){ return tabu.indexOf(sig)<0; }
  function tabuAdd(sig){ tabu.push(sig); if(tabu.length>7) tabu.shift(); }

  // Тип секции выводится из напряжения, а не берётся из списка.
  function chooseSection(){
    const P=PROFILES[profile], T2=P.tension;
    if(tDir>0){ tension+=rnd(T2.rise*.4,T2.rise*1.6);
      if(tension>=1){ tension=1; tDir=-1; } }
    else { tension-=rnd(T2.fall*.4,T2.fall*1.6);
      if(tension<=.05){ tension=.05; tDir=1; } }
    if(Math.random()<.12) tDir=-tDir;          // излом траектории
    const t=tension;
    let cand;
    if(tDir>0) cand = t<.3 ? ['вступление','ход','дрейф'] :
                      t<.7 ? ['ход','нагнетание','слоение'] :
                             ['нагнетание','пик','слом'];
    else       cand = t>.7 ? ['сброс','пик','обвал'] :
                      t>.35? ['ход','сброс','дрейф'] :
                             ['уход','дрейф','вступление'];
    // выбор с оглядкой на вкус и на табу
    for(let i=0;i<8;i++){
      const c=pick(cand);
      if(!tabuOk('s'+c)) continue;
      if(Math.random()<Math.min(.9,tasteW('sec',c)/4)||i>5){ tabuAdd('s'+c); return c; }
    }
    return pick(cand);
  }

  // Как секция звучит: не таблица настроек, а смещения от текущей эпохи.
  function sectionShape(name){
    const P=PROFILES[profile];
    const hardName = name==='слом'||name==='обвал'||name==='сброс'||name==='пик';
    const hard = hardName && Math.random()<(P.hardProb!==undefined?P.hardProb:.7);
    const quiet= name==='вступление'||name==='уход'||name==='дрейф';
    return {
      bars: Math.max(2, Math.round(rnd(P.barsBase[0],P.barsBase[1])*era.barsK*
            (hard?rnd(.35,.7):1))),
      rhy: quiet ? (Math.random()<P.rhyProb*.35?1:0)
                 : (Math.random()<P.rhyProb?1:0),
      rhyLvl: rnd(P.rhyLvl[0],P.rhyLvl[1])*(name==='пик'?1.25:1)*(quiet?.6:1)
              *(profile==='авангард'?1:.7),    // в жанрах низ ведёт кит, но слой не глушим
      xf: hard ? rnd(P.xfHi[0],P.xfHi[1]) : rnd(P.xfLo[0],P.xfLo[1]),
      crunch: Math.random()<(era.crunchBias*(hard?1.4:1)) ?
              (1+(Math.random()*P.crunch[1])|0) : 0,
      newVoice: era.voiceHold ? Math.random()<.25 :
                Math.random()<(profile==='авангард'?.75:.45)
    };
  }

  // Грув: карман выводится из семени пресета, поэтому он свойство темы,
  // а не глобальная настройка. Жанр задаёт рамки, семя — точку внутри.
  function sendGroove(seed){
    curGroove=pickGroove(profile,mul32((seed^0x7f4a7c15)>>>0));
    post({t:'groove',g:curGroove});
  }

  // Беззвучный рендер голой темы: тот же движок, тот же материал, без
  // ударных и баса — оцениваем саму тему, а не бит вокруг неё.
  async function renderCandidate(seed,secs){
    const sr=44100, dur=secs||4.5;
    const off=new OfflineAudioContext(2,Math.ceil(sr*dur),sr);
    await off.audioWorklet.addModule(env.workletUrl);
    const nd=new AudioWorkletNode(off,'otzvuk',
      {numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2]});
    nd.connect(off.destination);
    const mm=genMaterial(off,seed,profile,tasteW);
    const src=off.createBufferSource(); src.buffer=mm.buf; src.loop=true;
    src.connect(nd); src.start();
    const p=m=>nd.port.postMessage(m);
    p({t:'preset',seed:seed>>>0,layer:0});
    p({t:'preset',seed:(seed^0x5bf03635)>>>0,layer:1});
    p({t:'xf',sec:.25}); p({t:'lufs',v:-14});
    p({t:'drums',mode:0}); p({t:'rhy',v:0,lvl:0});
    p({t:'run',v:1});
    await new Promise(r=>setTimeout(r,20));
    return {buf:await off.startRendering(), mat:mm.name};
  }

  // Кандидаты готовятся впрок, по одному, чтобы не грузить машину пачкой.
  async function prepareTheme(n){
    if(picking||!env.workletUrl||!ARR[profile]) return;
    picking=true;
    const forProfile=profile, out=[];
    try{
      for(let i=0;i<(n||3);i++){
        const seed=(Math.random()*4294967295)>>>0;
        const r=await renderCandidate(seed);
        if(profile!==forProfile) return;          // профиль сменили — бросаем
        const f=extract(r.buf);
        out.push({seed,f,mat:r.mat,s:vscore(model,f),ok:fitness(model,f)});
        await new Promise(r2=>setTimeout(r2,30));
      }
      out.sort((a,b)=>b.s-a.s);
      if(out.length) nextTheme=out[0], lastPick={best:out[0],all:out};
    }catch(e){ /* отбор — роскошь: если не вышло, играем случайное семя */ }
    finally{ picking=false; }
  }

  function sendTilt(){ post({t:'tilt',v:TILTS[profile]}); }

  // Заполнение: кит тот же, меняется только рисунок хэтов и клэпа. Это то,
  // чем живой бит отличается от петли — вариация внутри, а не смена всего.
  function fillDrums(){
    const K=KITS[profile]; if(!K) return;
    const P=a=>a.split('').map(Number);
    post({t:'drums', mode: profile==='техно'?2:1,
      pK:P(curKit.k), pH:hatPattern(K), pC:P(pick(K.c)),
      // раскаты берём у семейства хэта, а не у кита: иначе заполнение
      // затирало характер семейства своим значением
      hRoll:rnd((curHat||K).hRoll[0],(curHat||K).hRoll[1])});
  }
  // Рисунок хэта: половина случаев — евклидов, половина — жанровый из списка.
  // Список держит узнаваемость, евклид даёт сетки, которых в списке нет.
  function hatPattern(K){
    if(Math.random()<.5) return pick(K.h).split('').map(Number);
    if(profile==='техно'){
      // техно живёт офбитом: поворот на 2 ставит удары между долями
      return euclid(pick([4,4,4,6,8,8]),16,2);
    }
    // Реже, чем было: сплошные шестнадцатые утомляют за пару минут, а в
    // рэпе густой хэт — приём на несколько тактов, а не постоянный фон.
    return euclid(pick([4,4,6,6,7,8,9,11]),16,pick([0,0,0,1,2]));
  }
  // Ворота фактуры и бас должны идти ПО БОЧКЕ. Без этого они брались из
  // семени пресета (евклидов остов), часто выходили ровной четвёркой и жили
  // своей жизнью — отсюда «прямая бочка» и «кик выбивается из остального».
  function sendPat(kickPat){
    const pS=kickPat.split('').map(Number);
    // подбивки баса: редкие, только там, где бочки нет
    const extra=euclid(pick([2,3,3,4]),16,pick([2,3,5,6]));
    const pB=pS.map((v,i)=>v?0:(extra[i]||0));
    post({t:'pat',lock:1,pS,pB});
  }
  function sendDrums(){
    const K=KITS[profile];
    if(!K){ post({t:'drums',mode:0}); return; }
    const P=a=>a.split('').map(Number);
    curKit.k=pick(K.k);
    sendPat(curKit.k);
    const fam=K.fam?pick(K.fam):K;
    const H=pick(HATS[profile]), C=pick(CLAPS[profile]);
    curHat=H;
    curPerc=H.name+'/'+C.name;
    post({t:'drums', mode: profile==='техно'?2:1,
      hNz:H.hNz, hTone:H.hTone, hRing:H.hRing,
      hRingF:H.hRingF?rnd(H.hRingF[0],H.hRingF[1]):3200,
      cTapsN:C.cTapsN, cGap:rnd(C.cGap[0],C.cGap[1]),
      cFreq:rnd(C.cFreq[0],C.cFreq[1]), cQ:C.cQ,
      cTail:rnd(C.cTail[0],C.cTail[1]), cNz:C.cNz,
      pK:P(curKit.k), pH:hatPattern(K), pC:P(pick(K.c)),
      kF:rnd(fam.kF[0],fam.kF[1]), kDec:rnd(fam.kDec[0],fam.kDec[1]),
      kSweep:rnd(fam.kSweep[0],fam.kSweep[1]), kDrive:rnd(fam.kDrive[0],fam.kDrive[1]),
      kClick:fam.kClick?rnd(fam.kClick[0],fam.kClick[1]):0,
      kClkMs:fam.kClkMs?rnd(fam.kClkMs[0],fam.kClkMs[1]):.004,
      kDropMs:fam.kDropMs?rnd(fam.kDropMs[0],fam.kDropMs[1]):.03,
      kLvl:rnd(K.kLvl[0],K.kLvl[1]), hDec:rnd(H.hDec[0],H.hDec[1]),
      hLvl:rnd(K.hLvl[0],K.hLvl[1]), cLvl:rnd(K.cLvl[0],K.cLvl[1]),
      hRoll:rnd(H.hRoll[0],H.hRoll[1])});
  }

  function genreStep(){
    const A=ARR[profile];
    // тема живёт долго и меняется редко — на ней и держится запоминаемость
    if(hookSeed===null || curBar-hookBar>rnd(A.life[0],A.life[1])){
      // берём отобранное заранее; если не готово — обычное случайное
      hookSeed=nextTheme?nextTheme.seed:(Math.random()*4294967295)>>>0;
      nextTheme=null;
      hookBar=curBar; phraseN=0;
      prepareTheme();                       // готовим следующую впрок
      curSeed=hookSeed;
      post({t:'xf',sec:rnd(1.5,4)});
      post({t:'preset',seed:hookSeed,layer:0});
      post({t:'preset',seed:(hookSeed^0x5bf03635)>>>0,layer:1});
      const mm=material(hookSeed); curMat=mm.name; env.swap(mm.buf,2.5);
      sendGroove(hookSeed);
      post({t:'bpm',lock:1,hard:1,
        v:Math.round(rnd(PROFILES[profile].bpm[0],PROFILES[profile].bpm[1])),mul:1});
      sendDrums(); sendTilt();
      curSec='тема';
    } else {
      const st=A.plan(phraseN);
      post(Object.assign({t:'mute'},st));
      // фишечки: одноразовые выходки, не ломающие бит
      const r=Math.random();
      if(r<.22) fillDrums();
      else if(r<.30) pushSR(clamp(curCrunch+3,0,SRD.length-1)),
                     setTimeout(()=>setCrunch(0,true),rnd(300,900));
      else if(r<.35) post({t:'rhy',v:1,lvl:rnd(.8,1.4)});
      // Раз в четыре фразы окружение темы меняется всерьёз: сама тема живёт
      // долго, и без этого она к третьей минуте становится обоями.
      if(phraseN%4===3){
        const w=Math.random();
        if(w<.4) sendDrums();                        // новый кит и тембры
        else if(w<.7){                               // новый верхний слой
          post({t:'xf',sec:rnd(1,4),layer:1});
          post({t:'preset',seed:(Math.random()*4294967295)>>>0,layer:1});
        } else setCrunch(1+(Math.random()*4|0),true);
      }
      curSec = st.bass&&st.kick ? 'бит' : st.bass ? 'без бочки' : st.kick ? 'яма' : 'тема';
    }
    phraseN++;
    secEndBar=curBar+A.phrase;
    phraseEnd=secEndBar;
    form(A.phrase, Math.round(lastBpm||140));
  }

  function stepSection(){
    // жанры аранжируются вычитанием, авангард живёт процессом
    if(ARR[profile]) return genreStep();
    if(!era||curBar>=eraEndBar) newEra();
    const name=chooseSection(), sh=sectionShape(name);
    curSec=name;

    // РЕЖИМ УДЕРЖАНИЯ. Рэп-бит держится повторением: если пересобирать всё
    // каждую секцию, бит не успевает стать битом. Поэтому в жанрах большинство
    // секций меняют только мелочи — заполнения, хэты, уровень, — а сам бит
    // и кит остаются. Пересборка случается только когда пора.
    const P0=PROFILES[profile];
    const hold = started && holdCount<6 && holdCount!==99 && Math.random()<(P0.stability||0);
    if(hold){
      holdCount++;
      secEndBar=curBar+sh.bars;
      phraseEnd=curBar+Math.max(1,Math.round(sh.bars/rnd(2,4)));
      post({t:'rhy',v:sh.rhy,lvl:sh.rhyLvl});
      if(Math.random()<.5) fillDrums();      // только заполнение, кит тот же
      if(Math.random()<.3) setCrunch(sh.crunch, true);
      form(sh.bars, Math.round(lastBpm||120));
      return;
    }
    holdCount=0;

    // возврат к раннему материалу делает форму слышимой, но не по расписанию
    let seed;
    if(T().seeds.length && Math.random()<.20) seed=pick(T().seeds);
    else if(memory.length && Math.random()<.22) seed=pick(memory);
    else { seed=(Math.random()*4294967295)>>>0;
           memory.push(seed); if(memory.length>6) memory.shift(); }

    const P=PROFILES[profile];
    const bpm=Math.round(clamp(era.bpm+rnd(-era.bpmSpread,era.bpmSpread),P.bpm[0],P.bpm[1]));

    post({t:'xf',sec:sh.xf});
    post({t:'rhy',v:sh.rhy,lvl:sh.rhyLvl});
    post({t:'bpm',lock:1,v:bpm,mul:1});
    if(P.pat){ const pp=pick(P.pat);
      post({t:'pat',lock:1,
        pS:pp[0].split('').map(Number), pB:pp[1].split('').map(Number)}); }
    else post({t:'pat',lock:0});
    curSeed=seed;
    post({t:'preset',seed,layer:0});
    // Верхний слой живёт своей жизнью: меняется реже и в свой момент, поэтому
    // сочетания получаются такие, каких одна цепочка не даёт.
    if(Math.random()<.45){
      const s2=(Math.random()*4294967295)>>>0;
      post({t:'xf',sec:rnd(2,12),layer:1});
      post({t:'preset',seed:s2,layer:1});
    }
    // Дискретизация по слоям и художественно: низ чистый, верх крошим.
    // Общее крошево на всё превращает звук просто в низкокачественный.
    const cr=curCrunch;
    post({t:'lofi',
      l0: cr>6 ? SRD[Math.min(SRD.length-1,cr-4)] : 1,
      l1: SRD[Math.min(SRD.length-1, cr + (Math.random()<.5?2:0))],
      lvl0: rnd(.85,1.15), lvl1: rnd(.35,.9)});
    setCrunch(sh.crunch, sh.xf>2);
    sendDrums(); sendTilt(); sendGroove(seed);

    if(sh.newVoice) { const mm=material(seed); curMat=mm.name; env.swap(mm.buf,Math.min(3,sh.xf)); }

    secEndBar=curBar+sh.bars;
    phraseEnd=curBar+Math.max(1,Math.round(sh.bars/rnd(2,4)));   // своя, более частая сетка

    // редкое: раз в десятки секций то, чего ещё не было
    if(--rareCd<=0 && Math.random()<.5){ rareCd=Math.round(rnd(12,40)); rareEvent(); }

    form(sh.bars, bpm);
  }

  // Частота дискретизации: переход вниз-вверх сам по себе красив, поэтому он
  // не мгновенный, а ведётся — иногда плавно, иногда ступенями.
  function setCrunch(level,smooth){
    if(srPlanT) clearInterval(srPlanT);
    const target=level, from=curCrunch;
    if(!smooth || Math.abs(target-from)<2){ pushSR(target); return; }
    let v=from;
    const step=target>from?1:-1, ms=Math.round(rnd(180,900));
    srPlanT=setInterval(()=>{ v+=step; pushSR(v);
      if(v===target){ clearInterval(srPlanT); srPlanT=null; } }, ms);
  }
  function pushSR(v){
    curCrunch=clamp(v|0,0,SRD.length-1);
    // низу крошево достаётся только на сильных значениях — так это читается
    // как приём, а не как поломка тракта
    post({t:'lofi',
      tex:SRD[curCrunch], rhy:SRD[Math.max(0,curCrunch-2)],
      l0: curCrunch>6 ? SRD[Math.min(SRD.length-1,curCrunch-4)] : 1,
      l1: SRD[curCrunch]});
  }

  function rareEvent(){
    const what=(Math.random()*5)|0;
    if(what===0){ post({t:'rhy',v:0,lvl:0});          // внезапная пустота
      setTimeout(()=>post({t:'rhy',v:1,lvl:1}),rnd(1500,4000)); }
    else if(what===1){ pushSR(SRD.length-1); setTimeout(()=>setCrunch(0,true),rnd(800,2500)); }
    else if(what===2) post({t:'bpm',lock:1,v:0,mul:pick([.5,2])});
    else if(what===3){ const mm=material((Math.random()*4294967295)>>>0); curMat=mm.name; env.swap(mm.buf,.15); }
    else post({t:'xf',sec:.15});
  }

  // ==========================================================================
  //  ОБРАТНАЯ СВЯЗЬ
  //  Лайк — не отметка, а смещение вероятностей: материал, тип секции и
  //  область темпа, которые понравились, начинают выпадать чаще, а их семена
  //  попадают в пул возвратов. Дизлайк уводит в табу и меняет секцию.
  // ==========================================================================
  // Вкус хранится отдельно по каждому профилю: «нравится» в рейдже и в
  // авангарде означает разное, общий счёт был бы просто необъективен.
  let tastes={}, saveT=null;
  function T(){ return tastes[profile]||(tastes[profile]={mat:{},sec:{},seeds:[],bad:[]}); }
  function tasteW(kind,key){                 // множитель вероятности
    const v=T()[kind][key]||0;
    return Math.max(.15, Math.min(4, Math.pow(1.6, v)));
  }
  function vote(good){
    if(!started) return false;
    const k=good?1:-1, t=T();
    t.mat[curMat]=(t.mat[curMat]||0)+k;
    t.sec[curSec]=(t.sec[curSec]||0)+k*.6;
    if(good){
      if(curSeed!==null && t.seeds.indexOf(curSeed)<0){
        t.seeds.push(curSeed); if(t.seeds.length>24) t.seeds.shift(); }
    } else {
      t.bad.push(curSeed); if(t.bad.length>40) t.bad.shift();
      tabuAdd('s'+curSec);
      post({t:'xf',sec:.5});
      stepSection();                          // не то — уходим сразу
    }
    saveTaste();
    return true;
  }
  function saveTaste(){ if(saveT) clearTimeout(saveT);
    saveT=setTimeout(()=>{ fetch('/state',{method:'PUT',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({tastes})}).catch(()=>{}); },600); }
  async function loadTaste(){
    try{ const r=await fetch('/state',{cache:'no-store'}); const d=await r.json();
      if(d.tastes) tastes=d.tastes;

      else if(d.taste&&d.taste.mat) tastes['авангард']=d.taste;  // перенос прежнего
    }catch(e){}
  }

  // Обновление: сорвать текущее и выдать другое немедленно. Не «следующая
  // секция по расписанию», а именно скачок — чтобы быстро цеплять фрагменты.
  function refresh(){
    if(!started) return;
    // В жанрах простой шаг аранжировки давал «чуть-чуть иное», потому что
    // тема живёт сотню тактов. Поэтому рвём всё: тему, материал, темп, кит
    // и диапазоны эпохи.
    era=null; holdCount=99; hookSeed=null; phraseN=0;
    tension=clamp(tension+rnd(-.5,.5),.05,1);
    post({t:'xf',sec:rnd(.2,1.2)});
    post({t:'mute',hook:1,bass:1,kick:1,hat:1,clap:1});
    stepSection();
    holdCount=0;
  }

  function nextProfile(){
    const ks=Object.keys(PROFILES);
    profile=ks[(ks.indexOf(profile)+1)%ks.length];
    hookSeed=null; phraseN=0; holdCount=0;
    post({t:'mute',hook:1,bass:1,kick:1,hat:1,clap:1});
    // Явно: режим удержания выходит раньше, чем дошло бы до отключения кита,
    // и после техно в авангарде оставалась прямая бочка.
    post({t:'drums',mode:0});
    post({t:'groove',g:null});
    if(!KITS[profile]) post({t:'pat',lock:0});
    era=null; tabu=[]; memory=[]; tension=.2; tDir=1;
    // Переход берётся не из нового профиля (там бывает до 20 секунд), а
    // осмысленно быстрый — иначе смена режима просто не слышна.
    if(started){ stepSection(); post({t:'xf',sec:1.2}); }
    else sendDrums();
    return profile;
  }

  // Каждый отчёт движка: счёт тактов, шаг секций, внутрифразовые события.
  function onBar(d,playing){
    curBar=d.bar; lastBpm=d.bpm;
    if(started&&playing&&curBar>=secEndBar) stepSection();
    else if(started&&playing&&curBar>=phraseEnd){
      // Внутрифразовые события: секция не должна быть однородной, иначе
      // смена секций читается как метроном.
      phraseEnd=curBar+Math.max(1,Math.round(rnd(1,5)));
      const r=Math.random();
      if(r<.22) pushSR(clamp(curCrunch+(Math.random()<.5?-2:2),0,SRD.length-1));
      else if(r<.38) post({t:'rhy',v:1,lvl:rnd(.3,1.2)});
      else if(r<.46) post({t:'xf',sec:rnd(.15,1)});
    }
  }

  // Запуск: первый материал, вкус, первая секция.
  function start(){
    const seed=(Math.random()*4294967295)>>>0;
    const mm=material(seed); curMat=mm.name; env.swap(mm.buf,.2);
    loadTaste();
    stepSection();
    started=true;
    setTimeout(()=>prepareTheme(),1500);
  }

  return {start, stepSection, vote, refresh, nextProfile, onBar,
          get groove(){return curGroove}, get perc(){return curPerc},
          get pick(){return lastPick},
          setModel(m){ model=m; },
          get model(){return model},
          renderCandidate,
          get profile(){return profile}, get started(){return started},
          get curSec(){return curSec}, get curMat(){return curMat}};
}
