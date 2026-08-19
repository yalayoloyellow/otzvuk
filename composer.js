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
import {genMaterial} from './material.js';

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
    fam:[ {kF:[38,46], kDec:[.55,.95], kSweep:[1.6,2.4], kDrive:[.75,.95]},  // длинный 808
          {kF:[46,58], kDec:[.22,.45], kSweep:[2.6,3.8], kDrive:[.5,.75]},   // короткий панч
          {kF:[34,42], kDec:[.7,1.2],  kSweep:[1.2,1.9], kDrive:[.85,1]} ],  // глубокий гул
    k:['1000000010000000','1000000010010000','1000001000100000','1001000010000000'],
    h:['1010101010101010','1111111111111111','1010111010101110','1110101011101010'],
    c:['0000100000001000'],
    kF:[40,54], kDec:[.38,.95], kSweep:[2.2,3.4], kDrive:[.6,.95],
    kLvl:[.95,1.3], hDec:[.012,.035], hLvl:[.35,.6], cLvl:[.5,.85], hRoll:[.12,.4]
  },
  'техно':{
    fam:[ {kF:[42,50], kDec:[.22,.38], kSweep:[1.8,2.6], kDrive:[.5,.7]},    // ровный
          {kF:[38,44], kDec:[.32,.5],  kSweep:[1.4,2.1], kDrive:[.7,.9]},    // тяжёлый
          {kF:[48,58], kDec:[.14,.24], kSweep:[2.6,3.6], kDrive:[.4,.65]} ], // сухой
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
    life:[96,192],                 // сколько тактов живёт тема
    plan(n){                       // n — номер фразы
      const m=n%8;
      if(m===0) return {hook:1,bass:0,kick:0,hat:0,clap:0};   // тема одна
      if(m===1) return {hook:1,bass:1,kick:1,hat:1,clap:1};   // бит вошёл
      if(m===4) return {hook:1,bass:0,kick:1,hat:1,clap:1};   // яма: без баса
      if(m===6) return {hook:1,bass:1,kick:0,hat:1,clap:0};   // без бочки
      if(m===7) return {hook:1,bass:1,kick:1,hat:1,clap:1};
      return {hook:1,bass:1,kick:1,hat:1,clap:1};
    }
  },
  'техно':{
    phrase:8,                      // техно дышит длиннее
    life:[160,320],
    plan(n){
      const m=n%8;
      if(m===0) return {hook:1,bass:0,kick:1,hat:0,clap:0};   // только бочка и тема
      if(m===1) return {hook:1,bass:0,kick:1,hat:1,clap:0};   // вошли хэты
      if(m===2) return {hook:1,bass:1,kick:1,hat:1,clap:0};   // вошёл низ
      if(m===5) return {hook:1,bass:1,kick:0,hat:1,clap:1};   // брейкдаун
      if(m===6) return {hook:1,bass:1,kick:1,hat:1,clap:1};   // всё вернулось
      return {hook:1,bass:1,kick:1,hat:1,clap:1};
    }
  }
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

  const material=seed=>genMaterial(env.ctx(),seed,profile,tasteW);
  const form=(bars,bpm)=>env.onForm({sec:curSec,mat:curMat,bars,bpm,tension});

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

  function sendTilt(){ post({t:'tilt',v:TILTS[profile]}); }

  // Заполнение: кит тот же, меняется только рисунок хэтов и клэпа. Это то,
  // чем живой бит отличается от петли — вариация внутри, а не смена всего.
  function fillDrums(){
    const K=KITS[profile]; if(!K) return;
    const P=a=>a.split('').map(Number);
    post({t:'drums', mode: profile==='техно'?2:1,
      pK:P(curKit.k), pH:P(pick(K.h)), pC:P(pick(K.c)),
      hRoll:rnd(K.hRoll[0],K.hRoll[1])});
  }
  function sendDrums(){
    const K=KITS[profile];
    if(!K){ post({t:'drums',mode:0}); return; }
    const P=a=>a.split('').map(Number);
    curKit.k=pick(K.k);
    const fam=K.fam?pick(K.fam):K;
    post({t:'drums', mode: profile==='техно'?2:1,
      pK:P(curKit.k), pH:P(pick(K.h)), pC:P(pick(K.c)),
      kF:rnd(fam.kF[0],fam.kF[1]), kDec:rnd(fam.kDec[0],fam.kDec[1]),
      kSweep:rnd(fam.kSweep[0],fam.kSweep[1]), kDrive:rnd(fam.kDrive[0],fam.kDrive[1]),
      kLvl:rnd(K.kLvl[0],K.kLvl[1]), hDec:rnd(K.hDec[0],K.hDec[1]),
      hLvl:rnd(K.hLvl[0],K.hLvl[1]), cLvl:rnd(K.cLvl[0],K.cLvl[1]),
      hRoll:rnd(K.hRoll[0],K.hRoll[1])});
  }

  function genreStep(){
    const A=ARR[profile];
    // тема живёт долго и меняется редко — на ней и держится запоминаемость
    if(hookSeed===null || curBar-hookBar>rnd(A.life[0],A.life[1])){
      hookSeed=(Math.random()*4294967295)>>>0; hookBar=curBar; phraseN=0;
      curSeed=hookSeed;
      post({t:'xf',sec:rnd(1.5,4)});
      post({t:'preset',seed:hookSeed,layer:0});
      post({t:'preset',seed:(hookSeed^0x5bf03635)>>>0,layer:1});
      const mm=material(hookSeed); curMat=mm.name; env.swap(mm.buf,2.5);
      post({t:'bpm',lock:1,hard:1,
        v:Math.round(rnd(PROFILES[profile].bpm[0],PROFILES[profile].bpm[1])),mul:1});
      sendDrums(); sendTilt();
      curSec='тема';
    } else {
      const st=A.plan(phraseN);
      post(Object.assign({t:'mute'},st));
      // фишечки: одноразовые выходки, не ломающие бит
      const r=Math.random();
      if(r<.18) fillDrums();
      else if(r<.26) pushSR(clamp(curCrunch+3,0,SRD.length-1)),
                     setTimeout(()=>setCrunch(0,true),rnd(300,900));
      else if(r<.31) post({t:'rhy',v:1,lvl:rnd(.8,1.4)});
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
    sendDrums(); sendTilt();

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
  }

  return {start, stepSection, vote, refresh, nextProfile, onBar,
          get profile(){return profile}, get started(){return started},
          get curSec(){return curSec}, get curMat(){return curMat}};
}
