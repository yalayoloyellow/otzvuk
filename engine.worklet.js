// ============================================================================
//  отзвук
//
//  ОДНО СЕМЯ РЕШАЕТ ВСЁ: фактуру, ударные, темп, ритмический рисунок,
//  басовую партию и внутренние пропорции. Ручек нет ни одной — пресет
//  либо нравится, либо листаешь дальше. Из-за общего семени и общих часов
//  фактура, ударные и бас складываются по построению, а не по настройке.
//
//  Фактура и ударные строятся одним и тем же механизмом: случайный граф
//  из девяти примитивов с обратными связями. Разнообразие живёт в топологии.
//
//  Бас — единственное исключение и сделан рецептом, а не графом: случайный
//  граф попадает в нужную породу звука примерно раз из двадцати. Внутри
//  рецепта всё варьируется семенем — ноты, глиссандо, грязь, длина, рисунок.
//
//  Правила, которые держат случайность в музыкальных берегах:
//    1. Все времена, несущие и сдвиги — с гармонической сетки от тона голоса.
//    2. Узел не идёт на выход, если путь от голоса не прошёл размазывание.
//    3. Петель не больше трёх, каждая демпфирована и ограничена.
//    4. Запас по громкости важнее громкости: первым от клиппинга гибнет бас.
// ============================================================================

const SR   = sampleRate;
const RING = Math.floor(SR*24);
const EBLK = 512, NEB = Math.ceil(RING/EBLK);
const NN   = 11, NBUF = 32768, NMASK = NBUF-1, MAXFB = 3;

const STN=4096, ST=new Float32Array(STN);
for(let i=0;i<STN;i++) ST[i]=Math.sin(2*Math.PI*i/STN);
const S = x => ST[((x*STN)|0)&(STN-1)];

function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0;
  let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t;
  return ((t^t>>>14)>>>0)/4294967296; }; }
const clamp=(v,a,b)=> v<a?a : v>b?b : v;

const T_LOOP=0,T_DEL=1,T_SVF=2,T_RING=3,T_SHAPE=4,T_PITCH=5,T_HOLD=6,T_MOD=7,T_VERB=8,T_HIT=9,
      T_FLNG=10,T_DIFF=11,T_GRAIN=12,T_FOLD=13;
const TNAME =['петля','задержка','фильтр','кольцо','насыщение','сдвиг','дробление','дыхание','зал','удар',
              'фленджер','рассеиватель','зерно','складка'];
const SMEARY=[1,1,0,0,0,1,0,0,1,1,1,1,1,0];
// какой параметр узла можно вести модуляцией; -1 — нечего вести
const MODT  =[ 1, 0, 0, 0, 0,-1,0, 0,0,-1, 2, 2, 1, 0];
const RATIOS=[1,9/8,6/5,5/4,4/3,3/2,8/5,5/3,9/5];
// Запретная зона 0.85-1.18 исключена намеренно: там речь остаётся речью.
const RATES =[.25,.333,.4,.5,.595,.667, 1.5,2,2.52,3,4];
const DIVS  =[.25,.5,1,2,4];
const LDIV  =[.25,.5,.5,1,1,2];   // доля такта для длинных петель фактуры

class Bank{
  constructor(){
    this.N=[];
    for(let i=0;i<NN;i++) this.N.push({ t:T_SVF, b:new Float32Array(NBUF), w:0,
      p:[0,0,0,0], q:[0,0,0,0], s:[0,0,0,0], rs:1,
      in1:-2,in2:-2,m1:1,m2:0,tap:0,smear:0,live:0,ph:0,
      ms:-1, md:0, mLp:0 });
    this.out=new Float32Array(NN); this.pre=new Float32Array(NN); this.fbLp=new Float32Array(NN);
    this.seed=0; this.sig=''; this.mode=0;
    this.gate=0; this.gateDec=.9999; this.gateSec=.3;
    this.pk=.02; this.lvl=1; this.age=0; this.rattle=1;
  }
  gridHz(r,rootHz){
    const oct=[.5,1,1,2,2,4][(r()*6)|0];
    return clamp(rootHz*oct*RATIOS[(r()*RATIOS.length)|0],28,2400);
  }
  build(seed,rootHz,mode){
    this.seed=seed>>>0; this.mode=mode|0;
    const r=mulberry32(this.seed), perc=this.mode===1;
    const nSrc = perc ? 1+(r()*2|0) : 1+(r()*3|0);
    for(let i=0;i<NN;i++){
      const n=this.N[i];
      n.t = i<nSrc ? (perc?T_HIT:T_LOOP) : (perc?this.pickTypeP(r):this.pickType(r));
      n.b.fill(0); n.w=0; n.s[0]=n.s[1]=n.s[2]=n.s[3]=0; n.ph=r();
      n.rs=(r()*4294967295)|0||1;
      this.config(n,r,rootHz);
      const srcOnly = n.t===T_LOOP||n.t===T_HIT;
      n.in1 = srcOnly ? -2 : (r()<(perc?.45:.3) ? (perc?(r()*nSrc)|0:-1) : (r()*NN)|0);
      n.in2 = (r()<.45) ? (r()<.25 ? (perc?(r()*nSrc)|0:-1) : (r()*NN)|0) : -2;
      n.m1=.6+r()*.6; n.m2=n.in2===-2?0:.3+r()*.6; n.tap=0;
    }
    this.gateSec = perc ? .07+r()*.30 : .3;
    // МОДУЛЯЦИОННЫЕ СВЯЗИ. До сих пор граф был только звуковым: узлы
    // передавали друг другу сигнал, но ничей параметр не вёлся. Отсюда
    // статичность внутри секции при любой палитре. Теперь выход одного узла
    // может вести срез, время, несущую или глубину другого.
    for(let i=0;i<NN;i++){
      const n=this.N[i];
      if(r()<.45 && MODT[n.t]>=0){
        n.ms=(r()*NN)|0;
        if(n.ms===i) n.ms=(i+1)%NN;
        n.md=(.15+r()*.85)*(r()<.5?-1:1);
      } else { n.ms=-1; n.md=0; }
    }
    this.capFeedback(r); this.markSmear(); this.markLive();
    const cand=[]; for(let i=0;i<NN;i++) if(this.N[i].smear&&this.N[i].live) cand.push(i);
    if(!cand.length) for(let i=0;i<NN;i++) if(this.N[i].live) cand.push(i);
    const nTap=Math.min(cand.length,2+(r()*2|0));
    for(let k=0;k<nTap;k++){ const i=cand.splice((r()*cand.length)|0,1)[0];
      this.N[i].tap=.45+r()*.75; }
    this.hasCalm=this.N.some(q=>q.tap>0&&q.t!==T_HOLD&&q.t!==T_RING);
    this.fbLp.fill(0); this.out.fill(0); this.pre.fill(0);
    this.pk=.02; this.lvl=1; this.age=0; this.gate=0;
    const c={}; for(let i=0;i<NN;i++){ const t=TNAME[this.N[i].t]; c[t]=(c[t]||0)+1; }
    this.sig=Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,3)
              .map(([k,v])=>v>1?k+'×'+v:k).join(' ');
  }
  pickType(r){
    // Четыре последних — новые: фленджер, рассеиватель, зерно, складка.
    // Без них палитра упиралась в один узкий стиль.
    const w=[0,13,15,2,6,9,1,10,12,0, 7,12,9,7];   // кольца и дробления меньше
    let s=0; for(let i=1;i<w.length;i++)s+=w[i]; let v=r()*s;
    for(let i=1;i<w.length;i++){ v-=w[i]; if(v<=0) return i; } return T_SVF; }
  // Кольцо и дробление дают металл и цифровую крошку — от них удар начинает
  // звучать хэтом или клэпом. Для ударных они исключены полностью.
  pickTypeP(r){ const w=[5,30,22,0,20,7,0,6,10];
    let s=0; for(let i=0;i<9;i++)s+=w[i]; let v=r()*s;
    for(let i=0;i<9;i++){ v-=w[i]; if(v<=0) return i; } return T_SVF; }
  trig(str){ for(let i=0;i<NN;i++){ const q=this.N[i];
      if(q.t===T_HIT){ q.s[0]=str; q.ph=0; } }
    if(str>this.gate) this.gate=str; }

  config(n,r,rootHz){
    switch(n.t){
      case T_LOOP:{ const sh=r()<.16; n.q[0]=sh?0:1;   // короткие петли жужжат
        // длина окна никогда не в 45-500 мс: там кусок речи остаётся речью
        n.p[0]=sh?SR*(.004+r()*.030):SR*(.55+r()*1.5);
        n.p[1]=RATES[(r()*RATES.length)|0]; n.p[2]=-1; n.p[3]=0;
        n.q[2]=(r()*LDIV.length)|0; break; }
      case T_DEL:{ const tu=r()<.55; n.q[0]=tu?1:0;
        n.p[0]=tu?clamp(SR/this.gridHz(r,rootHz),12,NBUF-8):clamp(SR*(.05+r()*.28),12,NBUF-8);
        n.p[1]=tu?.90+r()*.085:.55+r()*.36; n.p[2]=.12+r()*.6; break; }
      case T_SVF:
        n.p[0]=2*Math.sin(Math.PI*clamp(this.gridHz(r,rootHz)*(.5+r()*3),60,7000)/SR);
        n.p[1]=1/(.6+r()*7); n.p[2]=r()<.55?0:r()<.9?1:2; break;
      case T_RING: n.p[0]=this.gridHz(r,rootHz)/SR; n.p[1]=.35+r()*.65; break;
      case T_SHAPE: n.p[0]=1.2+r()*7; n.p[1]=r()<.3?1:0; break;
      case T_PITCH:{ let k=RATES[(r()*RATES.length)|0]; if(k<.3)k=.5;
        n.p[0]=k; n.p[1]=1024+(r()*3000|0); break; }
      case T_HOLD: n.p[0]=clamp(this.gridHz(r,rootHz)*(1+(r()*8|0)),300,16000)/SR;
        n.p[1]=r()<.4?(2+(r()*10|0)):0; break;
      case T_MOD: n.p[0]=(.03+r()*2.6)/SR; n.p[1]=.3+r()*.7; n.p[2]=r()<.35?1:0;
        n.p[3]=0; n.q[1]=(r()*DIVS.length)|0; break;
      case T_VERB: n.p[0]=.6+r()*1.7; n.p[1]=.70+r()*.25; n.p[2]=.15+r()*.5; break;
      // низкий возбудитель и почти без шума: высокий и шумный удар слышится
      // хэтом, а не киком
      case T_FLNG:                       // гребёнка с ведомой задержкой
        // узкая задержка с сильной связью — это «джет». Уводим в хорусный
        // диапазон, связь слабее, качание медленнее.
        n.p[0]=SR*(.004+r()*.026); n.p[1]=.12+r()*.32;
        n.p[2]=(.015+r()*.5)/SR; n.p[3]=.1+r()*.35; break;
      case T_DIFF:                       // цепочка всепропускающих: рассеивание
        n.p[0]=120+(r()*900|0); n.p[1]=220+(r()*1500|0);
        n.p[2]=.5+r()*.42; break;
      case T_GRAIN:                      // разброс зёрен по памяти
        // 8-60 мс — это бульканье; ниже 25 мс не опускаемся
        n.p[0]=SR*(.028+r()*.30); n.p[1]=RATES[(r()*RATES.length)|0];
        n.p[2]=-1; n.p[3]=0; break;
      case T_FOLD:                       // волновая складка с ведомой глубиной
        n.p[0]=.5+r()*6; n.p[1]=.2+r()*.8; break;
      case T_HIT: n.p[0]=(34+r()*105)/SR; n.p[1]=.03+r()*.22;
        n.p[2]=Math.exp(-1/(SR*(.006+r()*.10))); n.p[3]=.5+r()*3.2; break;
    }
  }
  capFeedback(r){ let seen=0;
    for(let i=0;i<NN;i++){ const n=this.N[i];
      if(n.in1>=i){ if(seen<MAXFB)seen++; else n.in1=i>0?(r()*i)|0:-1; }
      if(n.in2>=i){ if(seen<MAXFB)seen++; else n.in2=i>0?(r()*i)|0:-1; } } }
  markSmear(){ for(let i=0;i<NN;i++) this.N[i].smear=SMEARY[this.N[i].t];
    for(let p=0;p<NN;p++) for(let i=0;i<NN;i++){ const n=this.N[i]; if(n.smear) continue;
      if((n.in1>=0&&this.N[n.in1].smear)||(n.in2>=0&&this.N[n.in2].smear)) n.smear=1; } }
  // Узел «живой», если до него доходит сигнал: он сам источник, либо принимает
  // голос, либо принимает живой узел. Без этой проверки выходы графа могут
  // попасть на глухие ветки, и пресет окажется полностью беззвучным.
  markLive(){
    for(let i=0;i<NN;i++){ const n=this.N[i];
      n.live = (n.t===T_LOOP||n.t===T_HIT||n.in1===-1||n.in2===-1) ? 1 : 0; }
    for(let p=0;p<NN;p++) for(let i=0;i<NN;i++){ const n=this.N[i]; if(n.live) continue;
      if((n.in1>=0&&this.N[n.in1].live)||(n.in2>=0&&this.N[n.in2].live)) n.live=1; }
  }
  describe(){ return this.N.map((q,i)=>({ i,t:TNAME[q.t],in1:q.in1,in2:q.in2,
    tap:+q.tap.toFixed(2), fb:(q.in1>=i||q.in2>=i)?1:0 })); }

  run(e,v,x,ready,yS,fbScale,barLen,sync){
    const N=this.N,out=this.out,pre=this.pre;
    let mix=0;
    for(let i=0;i<NN;i++){
      const q=N[i];
      let fbIn=0;
      const a1=q.in1===-1?v:q.in1===-2?0:(q.in1<i?out[q.in1]:(fbIn+=pre[q.in1],0));
      const a2=q.in2===-1?v:q.in2===-2?0:(q.in2<i?out[q.in2]:(fbIn+=pre[q.in2],0));
      this.fbLp[i]+=(fbIn-this.fbLp[i])*.28;   // без демпфирования петля звенит
      let z=a1*q.m1+a2*q.m2+this.fbLp[i]*fbScale*(q.in1>=i?q.m1:q.m2);

      // Модуляционная связь: выход другого узла ведёт параметр этого.
      // До сих пор граф был только звуковым — отсюда статичность внутри
      // секции при любой палитре.
      let pm=0;
      if(q.ms>=0){
        q.mLp+=((q.ms<i?out[q.ms]:pre[q.ms])-q.mLp)*.02;
        pm=clamp(q.mLp*q.md,-.9,.9);
      }
      let o=0;
      switch(q.t){
        case T_LOOP:{ if(!ready) break;
          // длинное окно привязано к такту: тогда фактура и ритм в одном темпе
          const L=q.q[0]?clamp(barLen*LDIV[q.q[2]],SR*.2,SR*8):q.p[0];
          if(q.p[2]<0){ const b=e.pickBase(L*1.2,q);
            if(b<0){ if(q.s[3]>0){ q.p[2]=q.s[3]; q.p[3]=0; } else break; }
            else { q.p[2]=b; q.s[3]=b; q.p[3]=0; } }
          let ph=q.p[3]; if(ph>=L) ph=0;
          const u=ph/L, base=q.p[2];
          // равномощное перекрёстное затухание: петля без щелчка на стыке
          o=e.rd(base+ph)*S(u*.5)+e.rd(base+((ph+L*.5)%L))*Math.abs(S(u*.5+.25));
          ph+=q.p[1]; if(ph>=L) ph-=L; q.p[3]=ph; break; }
        case T_DEL:{ const d=clamp((q.q[0]?q.p[0]:q.p[0]*yS)*(1+pm*.35),12,NBUF-8);
          let rp=q.w-d; if(rp<0) rp+=NBUF;
          const j0=rp|0,fr=rp-j0,j1=(j0+1)&NMASK;
          const yv=q.b[j0]*(1-fr)+q.b[j1]*fr;
          q.s[0]+=(yv-q.s[0])*q.p[2];
          let fv=z+q.s[0]*q.p[1]*(.55+.42*x);
          if(fv>2.6)fv=2.6; else if(fv<-2.6)fv=-2.6;
          q.b[q.w]=fv; q.w=(q.w+1)&NMASK; o=yv; break; }
        case T_SVF:{ const fc=clamp(q.p[0]*(1+pm*1.6),.0005,1.4);
          q.s[0]+=fc*q.s[1];
          const hv=z-q.s[0]-q.p[1]*q.s[1]; q.s[1]+=fc*hv;
          o=q.p[2]===0?q.s[0]:q.p[2]===1?q.s[1]:hv;
          if(o>4)o=4; else if(o<-4)o=-4; break; }
        case T_RING: q.ph+=q.p[0]; if(q.ph>=1)q.ph-=1;
          o=z*(1-q.p[1]+q.p[1]*S(q.ph)); break;
        case T_SHAPE: o=q.p[1]?S(z*q.p[0]*.16):Math.tanh(z*q.p[0])*(1/Math.tanh(q.p[0])); break;
        case T_PITCH:{ q.b[q.w]=z; q.w=(q.w+1)&NMASK;
          const W=q.p[1];
          q.ph+=(1-q.p[0]); if(q.ph>=W)q.ph-=W; if(q.ph<0)q.ph+=W;
          const u=q.ph/W;
          o=q.b[(q.w-1-q.ph+NBUF)&NMASK]*S(u*.5)
           +q.b[(q.w-1-((q.ph+W*.5)%W)+NBUF)&NMASK]*Math.abs(S(u*.5+.25)); break; }
        case T_HOLD: q.ph+=q.p[0];
          if(q.ph>=1){ q.ph-=1; q.s[0]=q.p[1]?Math.round(z*q.p[1])/q.p[1]:z; }
          o=q.s[0]; break;
        case T_MOD:{ const rate=(sync&&barLen>0)?1/(barLen*DIVS[q.q[1]]):q.p[0];
          q.ph+=rate; if(q.ph>=1)q.ph-=1;
          if(q.p[2]){ if(q.ph<rate){ q.rs=(Math.imul(q.rs,1664525)+1013904223)|0;
              q.p[3]=clamp(q.p[3]+((q.rs>>>8)/16777216-.5)*.7,-1,1); }
            q.s[0]+=(q.p[3]-q.s[0])*.0002; } else q.s[0]=S(q.ph);
          o=z*(1-q.p[1]*.5+q.p[1]*.5*q.s[0]); break; }
        case T_HIT:{ if(q.s[0]>1e-5){
            q.s[0]*=q.p[2];
            // Возбуждение берётся из САМОЙ ФАКТУРЫ: удар — это её кусок,
            // вырезанный огибающей. Поэтому ударные наследуют тембр дорожки,
            // а не приезжают со своим синтетическим щелчком.
            q.ph+=q.p[0]*(.25+q.s[0]*q.s[0]*q.p[3]); if(q.ph>=1)q.ph-=1;
            const e=q.s[0]*q.s[0];
            const tone=S(q.ph)*e;                 // только чтобы очертить атаку
            o=(v*(2.2+q.p[1]*3.5)*q.s[0] + tone*(.25+q.p[1]*.5));
            if(o>3) o=3; else if(o<-3) o=-3; }
          break; }
        case T_FLNG: {
          // задержка ведётся модуляцией — статичная гребёнка звучит мёртво
          q.ph+=q.p[2]; if(q.ph>=1) q.ph-=1;
          const dd=q.p[0]*(1+q.p[3]*S(q.ph)+pm*.6)+2;
          let rp=q.w-dd; if(rp<0) rp+=NBUF;
          const j0=rp|0, fr=rp-j0;
          const yv=q.b[j0&NMASK]*(1-fr)+q.b[(j0+1)&NMASK]*fr;
          let fv=z+yv*q.p[1]; if(fv>2.6) fv=2.6; else if(fv<-2.6) fv=-2.6;
          q.b[q.w]=fv; q.w=(q.w+1)&NMASK;
          o=yv+z*.4; break; }
        case T_DIFF: {
          // два всепропускающих подряд: плотность без окраски
          const d1=q.p[0]|0, d2=q.p[1]|0, g=q.p[2];
          const r1=q.b[(q.w-d1+NBUF)&NMASK];
          const v1=z-g*r1; q.b[q.w]=v1; const oa=r1+g*v1;
          const r2=q.b[8192+((q.w-d2+8191)&8191)];
          const v2=oa-g*r2; q.b[8192+(q.w&8191)]=v2;
          o=r2+g*v2;
          q.w=(q.w+1)&NMASK; break; }
        case T_GRAIN: {
          if(!ready) break;
          const L=q.p[0];
          if(q.p[2]<0){
            const bb=e.pickBase(L*1.2,q);
            // Если места не нашлось — берём прошлое, а не молчим. Молчание
            // одного узла среди тапов слышно как обвал в ноль.
            if(bb<0){ if(q.s[3]>0){ q.p[2]=q.s[3]; q.p[3]=0; } else break; }
            else { q.p[2]=bb; q.s[3]=bb; q.p[3]=0; }
          }
          const ph=q.p[3];
          o=e.rd(q.p[2]+ph)*(.5-.5*Math.cos(Math.PI*2*ph/L));
          q.p[3]=ph+q.p[1];
          if(q.p[3]>=L){ q.p[3]=0; q.p[2]=-1; }   // каждое зерно из нового места
          break; }
        case T_FOLD: {
          // складка: глубина ведётся входом, поэтому тембр живёт
          o=S(z*(q.p[0]*(1+q.p[1]*Math.abs(z))*(1+pm*1.4))*.16); break; }
        case T_VERB:{ const sc=q.p[0]*(.7+.3*yS), fb=q.p[1]*(.72+.32*x), dp=q.p[2];
          const D0=(1237*sc)|0,D1=(1861*sc)|0,D2=(2503*sc)|0,D3=(3169*sc)|0;
          const w8=q.w&8191;
          const r0=q.b[(w8-D0)&8191],r1=q.b[8192+((w8-D1)&8191)],
                r2=q.b[16384+((w8-D2)&8191)],r3=q.b[24576+((w8-D3)&8191)];
          const acc=(r0+r1+r2+r3)*.5;
          q.s[0]+=(acc-r0-q.s[0])*dp; q.s[1]+=(acc-r1-q.s[1])*dp;
          q.s[2]+=(acc-r2-q.s[2])*dp; q.s[3]+=(acc-r3-q.s[3])*dp;
          let w0=z+q.s[0]*fb,w1=z+q.s[1]*fb,w2=z+q.s[2]*fb,w3=z+q.s[3]*fb;
          if(w0>3)w0=3; else if(w0<-3)w0=-3; if(w1>3)w1=3; else if(w1<-3)w1=-3;
          if(w2>3)w2=3; else if(w2<-3)w2=-3; if(w3>3)w3=3; else if(w3<-3)w3=-3;
          q.b[w8]=w0; q.b[8192+w8]=w1; q.b[16384+w8]=w2; q.b[24576+w8]=w3;
          q.w=(q.w+1)&8191; o=(r0+r1+r2+r3)*.42; break; }
      }
      if(!(o>-12&&o<12)) o=0;
      if(o>3)o=3; else if(o<-3)o=-3;
      out[i]=o;
      if(q.tap){
        // трещотки живут в дроблении и кольце — глушим адресно, а не весь верх
        const rs=(q.t===T_HOLD||q.t===T_RING)
               ?(this.hasCalm?this.rattle:Math.max(this.rattle,.45)):1;
        mix+=o*q.tap*rs;
      }
    }
    for(let i=0;i<NN;i++) pre[i]=out[i];
    if(this.mode===1){ mix*=this.gate; this.gate*=this.gateDec; }
    const a=mix<0?-mix:mix;
    this.pk=a>this.pk?a:this.pk*(this.mode===1?.999995:.99995);
    this.age++;
    const tgt=this.mode===1?.34:.50;
    this.lvl+=(clamp(tgt/Math.max(this.pk,.003),.05,20)-this.lvl)*(this.age<SR*2?.0007:.00006);
    return mix*this.lvl;
  }
}

class Otzvuk extends AudioWorkletProcessor{
  constructor(){
    super();
    this.ring=new Float32Array(RING); this.w=0; this.recorded=0;
    this.energy=new Float32Array(NEB); this.eAcc=0; this.eN=0; this.eIdx=0; this.emax=.02;
    this.hp=0; this.hpx=0; this.ipk=.02; this.irms=.001; this.ig=1; this.holdCd=0;
    this.envF=0; this.envS=0; this.duck=1; this.tSmp=0;
    this.opk=.02; this.og=4; this.dcx=0; this.dcy=0; this.tone=[0,0,0,0];
    this.pd=new Float32Array(1024); this.pdW=0; this.dsAcc=0; this.dsN=0; this.pdCount=0;
    this.pcHist=new Float32Array(12); this.rootHz=110;

    // ДВА НЕЗАВИСИМЫХ СЛОЯ. Один граф — один характер, и всё выходящее из
    // него родственно звучит. Два слоя со своими семенами, ролью в спектре и
    // своей дискретизацией дают сочетания, которых одна цепочка не даёт.
    this.L=[];
    for(let i=0;i<2;i++) this.L.push({
      A:new Bank(), B:new Bank(), cur:null, nxt:null,
      xf:1, xfRate:1/(SR*3.2), queued:null, lvl:i?.65:1,
      // роль: нижний слой чистый, верхний можно крошить — тогда это приём,
      // а не «низкое качество» на всём сразу
      hp:0, hpS:0, lp:0, lpS:0, band:i, sr:1, srT:1, srCd:1, srHold:0
    });
    for(const q of this.L){ q.cur=q.A; q.nxt=q.B; }
    this.xf=1; this.xfRate=1/(SR*3.2); this.queued=null;
    this.master=0; this.masterT=1; this.running=1;
    this.monitor=0; this.loop=0;
    this.yS=1; this.pump=0;

    // ---- всё, что раньше было ручками, теперь выводится из семени ----
    this.x=.4; this.y=.5; this.topC=.45; this.bpm=132;
    this.stepLen=SR*60/132/4; this.stepCd=1; this.step=0; this.bar=0;
    this.pS=new Uint8Array(16); this.pB=new Uint8Array(16);
    this.patLock=0; this.bpmLock=0; this.rhyMul=1;
    this.percLvl=.6; this.bassLvl=.8; this.pumpAmt=.5; this.percOn=1;
    this.texRms=.02; this.percPk=0; this.bassPk=0; this.cEnv=.02;
    this.hitEnv=0; this.hitDec=.9997; this.hLp=0; this.gateDep=.5; this.scLp=0;
    // ---- измеритель громкости по BS.1770 ----
    // Коэффициенты считаются от реальной частоты, а не берутся табличными
    // для 48 кГц: на 44.1 табличные дали бы промах.
    {
      const shf=1681.97, shq=.7071, shg=Math.pow(10,3.999/40);
      let w=2*Math.PI*shf/SR, cs=Math.cos(w), sn=Math.sin(w), al=sn/(2*shq);
      let A=shg, sq=2*Math.sqrt(A)*al;
      let a0=(A+1)-(A-1)*cs+sq;
      this.sh={ b0:(A*((A+1)+(A-1)*cs+sq))/a0, b1:(-2*A*((A-1)+(A+1)*cs))/a0,
                b2:(A*((A+1)+(A-1)*cs-sq))/a0, a1:(2*((A-1)-(A+1)*cs))/a0,
                a2:((A+1)-(A-1)*cs-sq)/a0 };
      const hf=38.13, hq=.5;
      w=2*Math.PI*hf/SR; cs=Math.cos(w); sn=Math.sin(w); al=sn/(2*hq);
      a0=1+al;
      this.hpf={ b0:((1+cs)/2)/a0, b1:(-(1+cs))/a0, b2:((1+cs)/2)/a0,
                 a1:(-2*cs)/a0, a2:(1-al)/a0 };
    }
    // ---- автоэквализация по розовому шуму --------------------------------
    // У розового шума равная энергия на октаву, поэтому в октавных полосах
    // цель — равные уровни. Отклонения от неё и слышны как «непрофессионально
    // сведено». Коррекция медленная и ограничена, чтобы править баланс,
    // а не давить характер.
    this.eqF=[90,180,360,700,1400,2800,5600];
    this.eqA=this.eqF.map(f=>1-Math.exp(-2*Math.PI*f/SR));
    this.eqLp=new Float64Array(7);
    this.eqRms=new Float64Array(8).fill(1e-4);
    this.eqG=new Float64Array(8).fill(1);
    // наклон: жанрам нужно больше низа, чем чистая розовая кривая
    this.eqTilt=new Float64Array([1,1,1,1,1,1,1,1]);
    this.eqRate=1/(SR*3);
    this.kL=new Float64Array(8); this.kR=new Float64Array(8);
    // отвод для записи: несжатые блоки уходят в главный поток
    this.rhyLvl=1; this.rhyLvlT=1; this.rhyOnT=1; this.glide=1/(SR*2);
    this.bpmT=132; this.srTexT=1; this.srRhyT=1; this.srBlend=1;
    this.pendS=null; this.pendB=null; this.qMute=null; this.qBpm=null;
    // ---- жанровая секция ударных: только в рейдже и техно ----
    // Тела по рецепту (без них жанра не бывает), окраска атаки — из середины
    // дорожки, поэтому от пресета к пресету они звучат по-разному.
    this.dr=0;                       // 0 выкл, 1 рейдж, 2 техно
    this.mKick=1; this.mHat=1; this.mClap=1; this.mBass=1; this.mHook=1;
    this.gKick=1; this.gHat=1; this.gClap=1; this.gBass=1; this.gHook=1;
    this.pK=new Uint8Array(16); this.pH=new Uint8Array(16); this.pC=new Uint8Array(16);
    this.kEnv=0; this.kPh=0; this.kDrop=0;
    this.hEnv=0; this.hLp=0; this.hRs=7331;
    this.cEnvD=0; this.cTaps=0; this.cCd=0; this.cRs=99; this.cf0=0; this.cf1=0;
    // Грув: сдвиги от сетки и велосити. Выключен (null) = жёсткая сетка,
    // поведение в точности прежнее. Удар не бьёт на границе шага, а
    // планируется с задержкой в сэмплах; «раньше сетки» существует за счёт
    // общего базового сдвига 0.2 шага — он одинаков для всех, поэтому не
    // слышен как задержка.
    this.grv=null; this.cVel=1;
    this.gDelK=-1; this.gDelH=-1; this.gDelC=-1; this.gDelS=-1; this.gDelB=-1;
    this.gVelK=1; this.gVelH=1; this.gVelC=1; this.gVelS=1;
    this.gWk=0; this.gWh=0; this.gWs=0;     // блуждание, коррелированный ход
    this.gRs=0x9e3779b9|0;                  // посевной LCG: грув воспроизводим
    this.kF=46; this.kSweep=2.6; this.kDec=.9999; this.kDrive=.7; this.kLvl=1;
    this.hDec=.999; this.hLvl=.5; this.cLvl=.6; this.hRoll=0;
    this.rec=0; this.recL=new Float32Array(4096); this.recR=new Float32Array(4096); this.recN=0;
    this.luMs=1e-4; this.luCoef=1/(SR*2.0);      // окно ~2 с, как short-term
    this.luFast=1e-4; this.luFastC=1/(SR*.4); this.luSeen=0;   // мгновенное 400 мс
    this.luDb=0; this.luG=1; this.luLufs=-70;
    this.luTarget=-14; this.luSlew=1/(SR*4);     // движение медленное, без качания
    this.srTex=1; this.srTexCd=1; this.shTex=0;
    this.srRhy=1; this.srRhyCd=1; this.shRhy=0;
    this.srTex=1; this.srTexCd=1; this.shTex=0;
    this.srRhy=1; this.srRhyCd=1; this.shRhy=0;
    // ---- семплер: чоп-н-скрю, всё автоматом кроме питча и темпа ----
    this.srTex=1; this.srTexCd=1; this.shTex=0;
    this.srRhy=1; this.srRhyCd=1; this.shRhy=0;
    this.srTex=1; this.srTexCd=1; this.shTex=0;
    this.srRhy=1; this.srRhyCd=1; this.shRhy=0;
    // ---- семплер: чоп-н-скрю, всё автоматом кроме питча и темпа ----
    this.bsEnv=0; this.bsPunch=0; this.bsPunchDec=.999; this.subLp=0; this.bsDrop=0;
    this.lb0=0; this.lb1=0; this.lb2=0;
    this.kbB=new Float32Array(8192); this.kbW=0; this.kbLp=0;
    this.lbPos=false; this.lbT=0; this.lbPer=SR/45; this.bsDrop=0;
    this.bsDrive=.6; this.bsDec=.9999; this.bsCut=.02; this.bsSweep=.5; this.bsGlide=0;

    this.applySeed(20260818);
    // оба слоя собираются сразу: иначе до первой смены секции звучит один
    for(let i=0;i<this.L.length;i++){
      this.L[i].cur.build(20260818+i*7919,this.rootHz,0);
      this.L[i].cur.rattle=this.rattleAmt;
    }
    this.meter=0; this.mCount=0; this.dirty=1;

    this.port.onmessage=e=>{ const d=e.data;
      if(d.t==='preset') this.goTo(d.seed>>>0);
      else if(d.t==='mon') this.monitor=d.v?1:0;
      else if(d.t==='loop') this.loop=d.v?1:0;
      else if(d.t==='perc') this.percOn=d.v?1:0;
      else if(d.t==='lufs') this.luTarget=d.v;
      else if(d.t==='tilt'){ for(let i=0;i<8;i++) this.eqTilt[i]=d.v[i]; }
      else if(d.t==='rec'){ this.rec=d.v?1:0; }
      else if(d.t==='run'){ this.masterT=d.v?1:0; this.running=d.v?1:0;
        if(!d.v){ this.kEnv=0; this.hEnv=0; this.cEnvD=0; this.cTaps=0;
                  this.bsEnv=0; this.bsPunch=0; this.hitEnv=0; } }
      else if(d.t==='mute'){
        // Композитор срабатывает по отчётам раз в семьдесят миллисекунд,
        // то есть его «граница такта» опаздывает и попадает в середину доли.
        // Поэтому кладём в очередь и применяем на границе такта.
        if(d.now){ this.applyMute(d); } else this.qMute=d;
      }
      else if(d.t==='drums'){
        this.dr=d.mode|0;
        if(d.pK){ this.pK.set(d.pK); this.pH.set(d.pH); this.pC.set(d.pC); }
        if(d.kF) this.kF=d.kF;
        if(d.kDec) this.kDec=Math.exp(-1/(SR*d.kDec));
        if(d.kSweep!==undefined) this.kSweep=d.kSweep;
        if(d.kDrive!==undefined) this.kDrive=d.kDrive;
        if(d.kLvl!==undefined) this.kLvl=d.kLvl;
        if(d.hDec) this.hDec=Math.exp(-1/(SR*d.hDec));
        if(d.hLvl!==undefined) this.hLvl=d.hLvl;
        if(d.cLvl!==undefined) this.cLvl=d.cLvl;
        if(d.hRoll!==undefined) this.hRoll=d.hRoll;
      }
      else if(d.t==='rhy'){ this.rhyOnT=d.v?1:0;
        if(d.lvl!==undefined) this.rhyLvlT=d.lvl; }
      else if(d.t==='xf'){ const sec=Math.max(.15,d.sec);
        this.xfRate=1/(SR*sec);
        if(d.layer!==undefined) this.L[d.layer].xfRate=1/(SR*sec);
        else for(const q of this.L) q.xfRate=1/(SR*sec);
        // всё остальное едет с тем же временем, что и граф
        this.glide=1/(SR*Math.max(.25,sec*.8));
        this.srGlide=sec; }
      else if(d.t==='lofi'){ if(d.tex) this.srTexT=d.tex|0;
        if(d.rhy) this.srRhyT=d.rhy|0;
        // дискретизация по слоям: низ можно оставить чистым
        if(d.l0!==undefined) this.L[0].srT=d.l0|0;
        if(d.l1!==undefined) this.L[1].srT=d.l1|0;
        if(d.lvl0!==undefined) this.L[0].lvl=d.lvl0;
        if(d.lvl1!==undefined) this.L[1].lvl=d.lvl1; }
      else if(d.t==='groove'){ this.grv=d.g||null; }
      else if(d.t==='bpm'){ this.bpmLock=d.lock?1:0;
        // Скользящий темп под ударными плывёт и слышен как аритмия.
        // В жанрах ставим сразу, в авангарде оставляем плавным.
        if(d.v){ if(d.hard) this.qBpm=d.v; else this.bpmT=d.v; }              // темп не прыгает, а съезжает
        if(d.mul!==undefined && d.mul>0) this.rhyMul=d.mul; }
      else if(d.t==='pat'){ this.patLock=d.lock?1:0;
        // рисунок подменяется на границе такта, а не посреди доли
        if(d.pS){ this.pendS=Uint8Array.from(d.pS); this.pendB=Uint8Array.from(d.pB); } }
    };
  }

  // Одно семя -> фактура, ударные, темп, рисунок, басовая партия и пропорции.
  // Поэтому всё это складывается друг с другом по построению.
  applySeed(seed){
    const r=mulberry32((seed^0x9E3779B9)>>>0);
    this.x=.18+r()*.72; this.y=.18+r()*.7;
    this.topC=1-Math.exp(-2*Math.PI*(5200+r()*9000)/SR);  // не мешаем эквалайзеру
    this.rattleAmt=.25+r()*.75;
    if(!this.bpmLock) this.bpm=Math.round(120+r()*52);
    this.stepLen=SR*60/this.bpm/4/this.rhyMul;
    // в режиме фактуры ритм — приправа, а не основа
    this.percLvl=.3+r()*.35; this.bassLvl=.34+r()*.26; this.pumpAmt=.4+r()*.28;

    // рисунок: евклидов остов плюс подбивки. Если рисунок задан человеком
    // или взят из жанра — семя его не трогает.
    const k=3+(r()*4|0), rot=(r()*16)|0;
    const kb=2+(r()*3|0), rb=(r()*16)|0;
    for(let i=0;i<16;i++){
      if(!this.patLock){
        this.pS[i]=(((i+rot)%16)*k)%16<k ? 1:0;
        this.pB[i]=(((i+rb)%16)*kb)%16<kb ? 1:0;
      }
    }
    if(!this.patLock) this.pB[0]=0;
    this.bsCut=1-Math.exp(-2*Math.PI*(55+r()*70)/SR);   // куда падает срез
    this.bsSweep=.35+r()*.55;                           // глубина обвала высоты
    this.bsGlide=r()<.5 ? .25+r()*.45 : 0;              // скольжение между ударами
    this.bsDrive=.5+r()*.5;
    this.bsDec=Math.exp(-1/(SR*(.38+r()*.95)));          // хвост
    this.bsPunchDec=Math.exp(-1/(SR*(.012+r()*.045)));   // удар
    // Жёсткая крышка на ударных: что бы граф ни собрал, выше этого не выйдет.
    // Это гарантия «никаких высоких», а не пожелание.
    // Крышка не ниже: фактура живёт выше 250 Гц, и слишком низкий срез
    // съедает её характер целиком — удар остаётся, тембр пропадает.
  }

  goTo(seed,layer){
    const q=this.L[layer||0];
    if(q.xf<.995){ q.queued=seed; return; }
    if(!layer) this.applySeed(seed);      // общие параметры ведёт нижний слой
    q.nxt.build(seed,this.rootHz,0);
    q.nxt.rattle=this.rattleAmt;
    q.xf=0;
  }
  // один слой: перекрёстное затухание банков плюс своя роль в спектре
  runLayer(q,v,x,ready,fbScale,barLen){
    let o;
    if(q.xf>=1) o=q.cur.run(this,v,x,ready,this.yS,fbScale,barLen,1);
    else{
      q.xf+=q.xfRate; if(q.xf>1) q.xf=1;
      const gN=S(Math.min(1,q.xf/.6)*.25);
      const gC=q.xf<.35?1:Math.abs(S(((q.xf-.35)/.65)*.25+.25));
      o=q.cur.run(this,v,x,ready,this.yS,fbScale,barLen,1)*gC
       +q.nxt.run(this,v,x,ready,this.yS,fbScale,barLen,1)*gN;
      if(q.xf>=1){ const t=q.cur; q.cur=q.nxt; q.nxt=t; this.dirty=1;
        if(q.queued!==null){ const z=q.queued; q.queued=null;
          this.goTo(z, this.L.indexOf(q)); } }
    }
    // своя дискретизация: крошим верхний слой, низ оставляем чистым
    if(q.srT>1){
      if(--q.srCd<=0){ q.srCd=q.srT; q.srHold=o; }
      o=q.srHold;
    }
    // роль в спектре: слои не наезжают друг на друга, склейка без грязи
    if(q.band){ q.hp+=(o-q.hp)*.010; o=(o-q.hp)*1.15; }
    else { q.lp+=(o-q.lp)*.55; q.lpS+=(q.lp-q.lpS)*.55; o=q.lpS*1.1; }
    return o*q.lvl;
  }
  rd(p){ let i0=Math.floor(p); const fr=p-i0; i0=((i0%RING)+RING)%RING;
    return this.ring[i0]*(1-fr)+this.ring[(i0+1)%RING]*fr; }
  pickBase(maxLen,q){
    const back=Math.ceil(maxLen/EBLK)+4;
    const avail=Math.min(NEB-4,(this.recorded/EBLK|0)-4);
    if(avail<=back+8) return -1;
    for(let a=0;a<14;a++){
      const thr=Math.max(.004,this.emax*(.24-a*.014));
      q.rs=(Math.imul(q.rs,1664525)+1013904223)|0;
      const idx=back+(((q.rs>>>8)/16777216)*(avail-back)|0);
      const ei=((this.eIdx-1-idx)%NEB+NEB)%NEB;
      if(this.energy[ei]>thr) return ((this.w-idx*EBLK)%RING+RING)%RING;
    }
    return -1;
  }

  // Хватаем из памяти ровно два такта: длина сама выравнивается по темпу,
  // подгонять руками нечего.
  applyMute(d){
    if(d.kick!==undefined) this.mKick=d.kick;
    if(d.hat!==undefined) this.mHat=d.hat;
    if(d.clap!==undefined) this.mClap=d.clap;
    if(d.bass!==undefined) this.mBass=d.bass;
    if(d.hook!==undefined) this.mHook=d.hook;
  }
  grn(){ this.gRs=(Math.imul(this.gRs,1664525)+1013904223)|0;
    return ((this.gRs>>>9)/4194304)-1; }        // −1…1, посевной
  onStep(){
    const st=this.step, g=this.grv;
    let dK=0,dH=0,dC=0,vK=1,vH=1,vC=1,vS=1;
    if(g){
      // Блуждание: медленный коррелированный ход, не дрожание. Датасет живых
      // барабанщиков: корреляция соседних сдвигов ≈ 0.5.
      const wf=g.wander;
      this.gWk=this.gWk*wf+this.grn()*(1-wf);
      this.gWh=this.gWh*wf+this.grn()*(1-wf);
      this.gWs=this.gWs*wf+this.grn()*(1-wf);
      const sw=(st&1)?(g.swing-.5)*2:0;         // свинг двигает чётные 16-е
      dK=.2+sw+g.late.kick +this.gWk*g.jit.kick;
      dH=.2+sw+g.late.hat  +this.gWh*g.jit.hat;
      dC=.2+sw+g.late.clap +this.gWs*g.jit.snare;
      const hm=g.human, p=st&3;
      const acc=a=>a?(1-hm)+hm*a[p]*(1+this.grn()*.12):1;
      vK=acc(g.acc.kick); vH=acc(g.acc.hat); vC=acc(g.acc.clap); vS=acc(g.acc.snare);
    }
    const D=f=>Math.round(clamp(f,0,.94)*this.stepLen);
    if(this.dr){
      if(this.pK[st]){
        if(g){ this.gDelK=D(dK); this.gVelK=vK; }
        else { this.kEnv=1; this.kDrop=1; this.kPh=0; this.pump=1; } }
      if(this.pH[st]){
        if(g){ this.gDelH=D(dH); this.gVelH=vH; }
        else this.hEnv=1; }
      // раскат хэтов: то, без чего рейдж не рейдж
      if(this.hRoll>0 && this.pH[st] && (this.grn()*.5+.5)<this.hRoll)
        this.hRollN=3+((this.grn()*.5+.5)*5|0);
      if(this.pC[st]){
        if(g){ this.gDelC=D(dC); this.gVelC=vC; }
        else { this.cTaps=3; this.cCd=0; } }
    }
    // ворота фактуры и бас едут карманом бочки — иначе бит расслаивается
    if(g){
      if(this.pS[st]||this.pB[st]){
        this.gDelS=D(.2+((st&1)?(g.swing-.5)*2:0)+g.late.kick+this.gWk*g.jit.kick);
        this.gVelS=(this.pS[st]?1:.45)*vS;
        this.gDelB=(this.pS[st]||(this.pB[st]&&(st&3)===0))?this.gDelS:-1;
      }
    } else {
      if(this.pS[st]) this.hitEnv=1;
      else if(this.pB[st]) this.hitEnv=.45;
      if(this.pS[st] || (this.pB[st]&&(st&3)===0)){
        // бас идёт по сильным долям и получает ноту из партии семени
        this.bsEnv=1; this.bsPunch=1; this.pump=1;
        // если удары идут подряд — высота не сбрасывается целиком, а скользит
        this.bsDrop=this.bsGlide>0 ? Math.max(this.bsDrop*this.bsGlide,.55) : 1;
      }
    }
    this.step=(this.step+1)&15;
    if(this.step===0){ this.bar++;
      if(this.pendS){ this.pS.set(this.pendS); this.pB.set(this.pendB);
        this.pendS=null; this.pendB=null; this.qMute=null; this.qBpm=null; }
      if(this.qMute){ this.applyMute(this.qMute); this.qMute=null; }
      if(this.qBpm){ this.bpm=this.bpmT=this.qBpm;
        this.stepLen=SR*60/this.bpm/4/this.rhyMul; this.qBpm=null; } }
  }

  process(inputs,outputs){
    const inp=(inputs[0]&&inputs[0][0])?inputs[0][0]:null;
    const oL=outputs[0][0], oR=outputs[0][1], n=oL.length;
    const x=this.x, fbScale=.30+.70*x, ySt=.35+1.7*this.y;
    const ready=this.recorded>SR*1.2;
    const barLen=SR*60/this.bpm/4*16;
    const dropDec=Math.exp(-1/(SR*.030));

    for(let s=0;s<n;s++){
      const raw=inp?inp[s]:0;
      this.hp=.995*(this.hp+raw-this.hpx); this.hpx=raw;
      const hpa=this.hp<0?-this.hp:this.hp;
      this.tSmp++;
      if(hpa>Math.max(.0018,this.ipk*.045)) this.holdCd=SR*.4;
      // Выравнивание по СРЕДНЕЙ энергии, а не по пику: у драм-лупа пики
      // высокие при низкой средней, у голоса наоборот, и по пику они приходили
      // в граф с разной энергией — отсюда «на голосе слабо, на лупе рвёт».
      if(this.holdCd>0){
        this.irms+=(this.hp*this.hp-this.irms)*.00002;
        this.ipk = hpa>this.ipk ? hpa : this.ipk*.999988;
        // Берём меньшее из двух ограничений. По одной средней разреженный
        // материал (щелчки, драм-луп) получал усиление в десятки раз и рвал
        // граф; по одному пику плотный материал приходил слишком тихим.
        const gR=.11/Math.sqrt(Math.max(this.irms,1e-7));
        const gP=.46/Math.max(this.ipk,.0025);
        this.ig+=(clamp(Math.min(gR,gP),1,45)-this.ig)*.00004;
      }
      let v=this.hp*this.ig;
      // мягкий ограничитель пиков: транзиенты лупа больше не рвут сатураторы
      if(v>1.6||v<-1.6) v=Math.tanh(v*.625)*1.6;
      const av=v<0?-v:v;
      this.envF+=(av-this.envF)*.004; this.envS+=(av-this.envS)*.00022;

      // Тишина в память не пишется. При зацикливании не пишется ничего:
      // память становится лупом и звучит одинаково сколько угодно.
      if(this.running && this.holdCd>0 && !this.loop){
        this.holdCd--;
        this.ring[this.w]=v; this.w=(this.w+1)%RING;
        if(this.recorded<RING) this.recorded++;
        this.eAcc+=v*v;
        if(++this.eN>=EBLK){ this.energy[this.eIdx]=Math.sqrt(this.eAcc/EBLK);
          this.eIdx=(this.eIdx+1)%NEB; this.eAcc=0; this.eN=0; }
      }
      this.dsAcc+=v;
      if(++this.dsN>=4){ this.pd[this.pdW]=this.dsAcc*.25; this.pdW=(this.pdW+1)&1023;
        this.dsAcc=0; this.dsN=0;
        if(++this.pdCount>=512){ this.pdCount=0; if(this.envF>.012) this.trackPitch(); } }

      // на паузе гаснем быстро: по .00009 хвост тянулся секунд десять
      this.master+=(this.masterT-this.master)*(this.masterT?.00009:.0006);
      // элементы включаются и гаснут плавно — вычитание не должно щёлкать
      const mg=.00009;   // ~250 мс: на 60 мс вычитание резало
      this.gKick+=(this.mKick-this.gKick)*mg; this.gHat+=(this.mHat-this.gHat)*mg;
      this.gClap+=(this.mClap-this.gClap)*mg; this.gBass+=(this.mBass-this.gBass)*mg;
      this.gHook+=(this.mHook-this.gHook)*mg;
      // Всё ведётся к цели, а не переключается: скачок темпа или уровня
      // слышен поверх любого, самого длинного перехода графа.
      this.rhyLvl+=((this.rhyOnT?this.rhyLvlT:0)-this.rhyLvl)*this.glide;
      if(this.rhyLvl<.004 && !this.rhyOnT) this.rhyOn=0; else if(this.rhyOnT) this.rhyOn=1;
      if(this.bpmT!==this.bpm){
        this.bpm+=(this.bpmT-this.bpm)*this.glide*4;
        if(Math.abs(this.bpmT-this.bpm)<.05) this.bpm=this.bpmT;
      }
      this.stepLen=SR*60/this.bpm/4/this.rhyMul;
      // частота дискретизации переходит перекрёстным затуханием
      // смена частоты — на границе такта, чтобы не рвать посреди доли
      if(this.srTexT!==this.srTex||this.srRhyT!==this.srRhy){
        if(this.step===0 && this.stepCd>this.stepLen-64){
          this.srTex=this.srTexT; this.srRhy=this.srRhyT; }
      }
      this.yS+=(ySt-this.yS)*.00008;
      if(this.running && --this.stepCd<=0){ this.stepCd=Math.round(this.stepLen); this.onStep();
        // нажали до наполнения памяти — дозахватим сами
      }
      // Отложенные удары грува: onStep только назначает время, срабатывание
      // происходит здесь, с точностью до сэмпла.
      if(this.gDelK>=0 && --this.gDelK<0){
        this.kEnv=this.gVelK; this.kDrop=1; this.kPh=0; this.pump=1; }
      if(this.gDelH>=0 && --this.gDelH<0) this.hEnv=this.gVelH;
      if(this.gDelC>=0 && --this.gDelC<0){ this.cTaps=3; this.cCd=0; this.cVel=this.gVelC; }
      if(this.gDelS>=0 && --this.gDelS<0) this.hitEnv=this.gVelS;
      if(this.gDelB>=0 && --this.gDelB<0){
        this.bsEnv=1; this.bsPunch=1; this.pump=1;
        this.bsDrop=this.bsGlide>0 ? Math.max(this.bsDrop*this.bsGlide,.55) : 1; }

      // ---- фактура -----------------------------------------------------------
      let mix=0;
      for(let i=0;i<this.L.length;i++) mix+=this.runLayer(this.L[i],v,x,ready,fbScale,barLen);
      mix*=this.gHook;

      this.dcy=mix-this.dcx+.9995*this.dcy; this.dcx=mix;
      let m=this.dcy;
      this.tone[0]+=(m-this.tone[0])*this.topC;
      this.tone[1]+=(this.tone[0]-this.tone[1])*this.topC;
      this.tone[2]+=(this.tone[1]-this.tone[2])*this.topC;
      this.tone[3]+=(this.tone[2]-this.tone[3])*.0055;
      m=this.tone[2]-this.tone[3];

      // ---- коррекция к розовой кривой --------------------------------------
      {
        let prev=m, sum=0, tot=0;
        const b=this.eqTmp||(this.eqTmp=new Float64Array(8));
        for(let i=0;i<7;i++){
          this.eqLp[i]+=(prev-this.eqLp[i])*this.eqA[i];
          b[i]=prev-this.eqLp[i];        // полоса = разность соседних срезов
          prev=this.eqLp[i];
        }
        b[7]=prev;                       // самый низ
        for(let i=0;i<8;i++){
          this.eqRms[i]+=(b[i]*b[i]-this.eqRms[i])*this.eqRate;
          tot+=this.eqRms[i];
        }
        if(tot>1e-10){
          for(let i=0;i<8;i++){
            const want=tot/8*this.eqTilt[i];
            const g=Math.sqrt(want/Math.max(this.eqRms[i],1e-10));
            // ±12 дБ: при ±6 горб в середине на 15 дБ просто не выбирался
            this.eqG[i]+=(clamp(g,.25,4)-this.eqG[i])*this.eqRate*2;
            sum+=b[i]*this.eqG[i];
          }
          m=sum;
        }
      }

      // прижимает медленно, восстанавливает быстро
      const mp=m<0?-m:m;
      this.opk=mp>this.opk?mp:this.opk*.999975;
      const ogT=clamp(.55/Math.max(this.opk,.004),.03,26);
      this.og+=(ogT-this.og)*(ogT>this.og?.00011:.00003);
      m*=this.og;

      const dT=1-.70*Math.min(1,this.envS*14);
      this.duck+=(dT-this.duck)*.0012;
      m*=this.duck;

      // Громкость ритма привязана к громкости фактуры: иначе он глушит трек.
      this.texRms+=((m*m)-this.texRms)*.00004;
      const texL=clamp(Math.sqrt(this.texRms)/.16,.3,1.25);

      // ---- низ: вытянут из дорожки и раскачан её же периодом --------------
      // Ноты нет нигде. Нижняя полоса дорожки заводится в короткую петлю с
      // насыщением, длина петли — период самого материала (по переходам через
      // ноль). Петля сама себя раскачивает на той высоте, что в звуке есть,
      // и даёт вес, которого простым фильтром не получить.
      let bs=0;
      if(this.percOn && this.rhyOn){
        this.bsDrop*=dropDec;
        const cut=this.bsCut*(1+this.bsDrop*this.bsDrop*7);
        const a=clamp(cut,.004,.35);
        this.lb0+=(m-this.lb0)*a; this.lb1+=(this.lb0-this.lb1)*a; this.lb2+=(this.lb1-this.lb2)*a;
        const lowBand=this.lb2;

        // период материала: считаем переходы через ноль нижней полосы
        if((lowBand>0)!==(this.lbPos)){ this.lbPos=lowBand>0;
          const dt=this.tSmp-this.lbT; this.lbT=this.tSmp;
          if(dt>SR/160 && dt<SR/22) this.lbPer+=(dt*2-this.lbPer)*.06; }
        const per=clamp(this.lbPer,SR/70,SR/26);

        // петля с насыщением: самоподхват на найденном периоде
        let rp=this.kbW-per; if(rp<0) rp+=8192;
        const j0=rp|0, fr=rp-j0;
        const ring=this.kbB[j0&8191]*(1-fr)+this.kbB[(j0+1)&8191]*fr;
        this.kbLp+=(ring-this.kbLp)*.34;
        // Обратная связь идёт за огибающей доли: на ударе петля раскачана,
        // между ударами почти разомкнута. Иначе она звучит непрерывным
        // дроном, и удар в нём не читается.
        // Держим петлю по всей длине ноты и отпускаем в конце. По квадрату
        // огибающей она гасла за сотню миллисекунд — от перегруза,
        // который и давал вес, не оставалось ничего.
        const kfb=.26+.68*this.bsEnv;
        let fbv=lowBand*2.4+this.kbLp*kfb;
        fbv=Math.tanh(fbv*1.6)*.9;
        this.kbB[this.kbW&8191]=fbv; this.kbW=(this.kbW+1)&8191;

        if(this.bsEnv>1e-5){
          this.bsEnv*=this.bsDec; this.bsPunch*=this.bsPunchDec;
          const env=this.bsEnv*.55+this.bsPunch*.85;


          let body=ring*1.9+lowBand*.7
                  +(m-this.lb0)*this.bsPunch*this.bsPunch*1.6;
          if(body>4) body=4; else if(body<-4) body=-4;
          const dr=this.bsDrive;
          const d1=Math.tanh(body*(1+dr*10));
          let d2=d1*(1+dr*3); if(d2>1) d2=1; else if(d2<-1) d2=-1;
          const d3=S(d1*(.09+dr*.20));
          this.subLp+=(body-this.subLp)*.012;
          bs=(d2*.36+d3*.20+this.subLp*1.5)*env*this.bassLvl*this.rhyLvl*1.05;
        }
      }

      // ---- жанровые ударные -----------------------------------------------
      let drm=0;
      if(this.dr){
        if(this.kEnv>1e-5){
          this.kDrop*=dropDec;
          const f=this.kF*(1+this.kDrop*this.kDrop*this.kSweep);
          this.kPh+=f/SR; if(this.kPh>=1) this.kPh-=1;
          // цвет атаки — транзиент самой дорожки, поэтому бочка не одинаковая
          let x=S(this.kPh)+(m-this.lb0)*this.kEnv*this.kEnv*.9;
          x=Math.tanh(x*(1+this.kDrive*9));
          this.kEnv*=this.kDec;
          drm+=x*this.kEnv*this.kLvl*.85*this.gKick;
        }
        if(this.hEnv>1e-5){
          this.hRs=(Math.imul(this.hRs,1664525)+1013904223)|0;
          const nz=((this.hRs>>>9)/4194304)-1;
          this.hLp+=(nz-this.hLp)*.62;
          this.hEnv*=this.hDec;
          drm+=(nz-this.hLp)*this.hEnv*this.hLvl*.5*this.gHat;
        }
        if(this.cTaps>0 && --this.cCd<=0){ this.cEnvD=1; this.cTaps--; this.cCd=Math.round(SR*.009); }
        if(this.cEnvD>1e-5){
          this.cRs=(Math.imul(this.cRs,1664525)+1013904223)|0;
          const nz=((this.cRs>>>9)/4194304)-1;
          this.cf0+=.19*this.cf1; this.cf1+=.19*(nz-this.cf0-.7*this.cf1);
          this.cEnvD*= this.cTaps>0 ? .997 : .9997;
          drm+=this.cf1*this.cEnvD*this.cVel*this.cLvl*.7*this.gClap;
        }
      }

      // ---- удар: ворота на самой дорожке, а не добавленный слой ----------
      // Сложение всегда слышится как приклеенный сэмпл. Поэтому умножение:
      // дорожка сама вспыхивает на доле и притухает между ударами.
      if(this.percOn && this.rhyOn){
        const e=this.hitEnv*this.hitEnv, dep=this.gateDep*this.rhyLvl;
        m *= (1-dep) + dep*(.25+1.9*e);
      }
      this.hitEnv*=this.hitDec;
      let pr=0;

      // фактура приседает под басом — от этого всё встаёт в ритм
      this.pump*=.99993;
      // Частота дискретизации фактуры. Сглаживающего фильтра нет намеренно:
      // весь алиасинг остаётся, ради него это и делается.
      if(this.srTex>1){
        if(--this.srTexCd<=0){ this.srTexCd=this.srTex; this.shTex=m; }
        m=this.shTex;
      }

      // Сайдчейн-эквализация: под кик садится ТОЛЬКО низ дорожки. Верх и
      // середина остаются на месте, поэтому минусовка не проваливается
      // целиком, а место освобождается там, где его занимает бас.
      const sc=Math.max(this.pump*this.pump, this.bsEnv);
      this.scLp+=(m-this.scLp)*.011;
      const scLow=this.scLp, scHi=m-this.scLp;
      m=(scLow*(1-this.pumpAmt*sc) + scHi*(1-this.pumpAmt*.22*sc))*.62;

      let rhyRaw=bs+pr;
      if(this.srRhy>1){
        if(--this.srRhyCd<=0){ this.srRhyCd=this.srRhy; this.shRhy=rhyRaw; }
        rhyRaw=this.shRhy;
      }
      const rhy=rhyRaw*texL*(.45+.55*this.duck)*this.gBass;
      { const a=pr<0?-pr:pr; if(a>this.percPk) this.percPk=a;
        const b=bs<0?-bs:bs; if(b>this.bassPk) this.bassPk=b; }
      if(this.monitor) m+=v*.6;

      // ---- параллельная компрессия на весь выход ---------------------------
      // Сжатая копия подмешивается к сухой: тихое подтягивается, атаки живут.
      let sum=m+rhy+drm*(.55+.45*this.duck);
      const sa=sum<0?-sum:sum;
      this.cEnv += (sa-this.cEnv)*(sa>this.cEnv ? .004 : .00022);
      const over=this.cEnv/.055;
      const gr = over>1 ? Math.pow(over,-.82) : 1;      // около 6:1
      const wet=sum*gr*4.4;
      sum = sum*.66 + wet*.4;

      let o1=Math.tanh(sum*.92)*.94;
      let o2=Math.tanh((sum*.97+this.dcy*this.og*.05*.62)*.92)*.94;

      // ---- нормализация по LUFS (BS.1770) ---------------------------------
      // Петля замкнута по ФАКТИЧЕСКОМУ выходу, после ограничителя: если мерить
      // до него, цель не достигается и после нормализации звук поедет.
      o1*=this.luG; o2*=this.luG;
      o1=Math.tanh(o1*1.08)*.93; o2=Math.tanh(o2*1.08)*.93;
      {
        // K-взвешивание: полочный подъём верха плюс срез инфраниза
        const kw=(x,st)=>{
          const y1=this.sh.b0*x+this.sh.b1*st[0]+this.sh.b2*st[1]-this.sh.a1*st[2]-this.sh.a2*st[3];
          st[1]=st[0]; st[0]=x; st[3]=st[2]; st[2]=y1;
          const y2=this.hpf.b0*y1+this.hpf.b1*st[4]+this.hpf.b2*st[5]-this.hpf.a1*st[6]-this.hpf.a2*st[7];
          st[5]=st[4]; st[4]=y1; st[7]=st[6]; st[6]=y2;
          return y2;
        };
        const kL=kw(o1,this.kL), kR=kw(o2,this.kR);
        const ms=kL*kL+kR*kR;
        // Мгновенное окно 400 мс — по нему решаем, считать ли этот кусок.
        this.luFast+=(ms-this.luFast)*this.luFastC;
        // ГЕЙТИНГ по BS.1770: тихие куски в счёт не идут. Без него у
        // разреженного материала паузы тянут измерение вниз, усиление
        // задирается, и профили расходятся по громкости на десяток децибел.
        const mom=this.luFast>1e-12 ? -0.691+10*Math.log10(this.luFast) : -99;
        const gate=Math.max(-60, this.luLufs-10);
        if(mom>gate){ this.luMs+=(ms-this.luMs)*this.luCoef; this.luSeen=1; }
        if(this.running && this.luSeen && this.luMs>1e-9){
          const lufs=-0.691+10*Math.log10(this.luMs);
          this.luLufs=lufs;
          const want=clamp(this.luTarget-lufs,-24,24);
          this.luDb+=(want-this.luDb)*this.luSlew;
          this.luG=Math.pow(10,this.luDb/20);
        }
      }
      // Выключение — последней ступенью, ПОСЛЕ нормализации. Иначе петля
      // LUFS видит затухание как падение громкости и вытягивает хвост обратно,
      // добавляя до двадцати четырёх децибел: звук не умирает.
      o1*=this.master; o2*=this.master;
      oL[s]=o1; oR[s]=o2;
      if(this.rec){
        this.recL[this.recN]=o1; this.recR[this.recN]=o2;
        if(++this.recN>=4096){
          this.port.postMessage({rec:1,l:this.recL.slice(),r:this.recR.slice()});
          this.recN=0;
        }
      }
      const ab=o1<0?-o1:o1; if(ab>this.meter) this.meter=ab;
    }

    if((this.mCount+=n)>=SR*.07){
      this.mCount=0;
      let mx=.008; for(let i=0;i<NEB;i++) if(this.energy[i]>mx) mx=this.energy[i];
      this.emax=mx;
      const bins=new Float32Array(180);
      const avail=Math.min(NEB,(this.recorded/EBLK)|0);
      for(let i=0;i<180;i++){
        const f=(i*avail/180)|0,t=Math.max(f+1,((i+1)*avail/180)|0);
        let b=0; for(let j=f;j<t;j++){ const ei=((this.eIdx-avail+j)%NEB+NEB)%NEB;
          if(this.energy[ei]>b) b=this.energy[ei]; }
        bins[i]=b;
      }
      // где именно сейчас читают петли — чтобы было видно, что играет
      const heads=[];
      for(const bk of [this.L[0].cur,this.L[1].cur]){
        for(let i=0;i<NN;i++){ const q=bk.N[i];
          if(q.t===T_LOOP && q.p[2]>=0 && q.tap>0){
            const back=((this.w-q.p[2])%RING+RING)%RING;
            heads.push(1-back/Math.max(1,this.recorded));
          } }
      }
      const msg={ meter:this.meter, sec:this.recorded/SR, root:this.rootHz, bins, heads,
        xf:this.L[0].xf, step:this.step, bar:this.bar, bpm:this.bpm,
        gate:this.gateDep, bassPk:this.bassPk, mul:this.rhyMul,
        lufs:+this.luLufs.toFixed(1), luG:+this.luDb.toFixed(1),
        stepMs:+(this.stepLen/SR*1000).toFixed(1),
        pS:Array.from(this.pS), pB:Array.from(this.pB) };
      this.percPk*=.45; this.bassPk*=.45;   // удары реже отчётов — держим пик
      if(this.dirty){ this.dirty=0; msg.graph=this.L[0].cur.describe();
        msg.seed=this.L[0].cur.seed; msg.sig=this.L[0].cur.sig; }
      this.port.postMessage(msg);
      this.meter=0;
    }
    return true;
  }

  trackPitch(){
    const B=this.pd,W=this.pdW,L=600;
    let e0=0; for(let i=0;i<L;i++){ const s=B[(W-1-i)&1023]; e0+=s*s; }
    if(e0<1e-6) return;
    let best=0,bl=0;
    for(let lag=24;lag<=171;lag++){ let acc=0;
      for(let i=0;i<L;i++) acc+=B[(W-1-i)&1023]*B[(W-1-i-lag)&1023];
      const nr=acc/e0; if(nr>best){ best=nr; bl=lag; } }
    if(best<.42||!bl) return;
    const f=SR/4/bl;
    const pc=((Math.round(69+12*Math.log2(f/440))%12)+12)%12;
    this.pcHist[pc]+=1;
    let bi=0,bv=-1; for(let i=0;i<12;i++) if(this.pcHist[i]>bv){ bv=this.pcHist[i]; bi=i; }
    if(bv>3){ let hz=440*Math.pow(2,(bi-9)/12);
      while(hz>130) hz/=2; while(hz<65) hz*=2;
      this.rootHz+=(hz-this.rootHz)*.02; }
    if(bv>240) for(let i=0;i<12;i++) this.pcHist[i]*=.5;
  }
}
registerProcessor('otzvuk',Otzvuk);
