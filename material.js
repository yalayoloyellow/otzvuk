// ============================================================================
//  МАТЕРИАЛ — генерация исходного звука из семени.
//  Движок преобразует то, что лежит в памяти, поэтому потолок задан материалом.
//  Метод синтеза разыгрывается из семени, с уклоном по профилю: голос, ноты,
//  щипки, дрон, металл, воздух, импульсы. Всё процедурно, файлов рядом нет.
//  Никаких скрытых глобалей: контекст, профиль и вкус приходят параметрами.
//  Math.random здесь запрещён — семя определяет каждый сэмпл, иначе пресет
//  не воспроизводится и стенд не может сравнивать «до/после».
// ============================================================================
const TAU=Math.PI*2;

export function mul32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0;
  let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t;
  return ((t^t>>>14)>>>0)/4294967296; }; }

// ---- голос из семени --------------------------------------------------------
// Не выбор из списка, а разыгрывание параметров: высота, длина тракта, длина
// гласных, плотность согласных, паузы, вибрато, жёсткость, число голосов,
// полоса. Поэтому материал у каждой секции свой и неповторимый.
export function voiceFromSeed(seed){
  const r=mul32(seed>>>0), R=(a,b)=>a+r()*(b-a);
  const lo=R(38,240), hi=lo*R(1.15,2.6);
  const long=r()<.4;
  return { f0:[lo,hi], fm:R(.6,1.6),
           vlen: long?[R(.3,.7),R(.8,1.8)]:[R(.03,.10),R(.10,.45)],
           cons:R(.05,.9), gap:[R(.005,.08),R(.05,.9)],
           vib:r()<.45?R(.005,.06):0, harsh:r()<.5?R(.05,.8):0,
           n:1+((r()*r()*4)|0), band:r()<.25?[R(300,900),R(1600,4200)]:0 };
}

export function genVoice(ctx,v,rnd){
  const sr=ctx.sampleRate, dur=12, b=ctx.createBuffer(1,sr*dur,sr), d=b.getChannelData(0);
  const R=(a,c)=>a+rnd()*(c-a);
  const F1=R(380,560)*v.fm, F2=R(950,1700)*v.fm, F3=R(2200,3100)*v.fm;
  for(let voice=0;voice<v.n;voice++){
    const shift=v.n>1?[1,1.5,2,1.25][voice%4]:1;
    let t=.15+rnd()*.3;
    while(t<dur-.7){
      if(rnd()<v.cons){
        const L=sr*R(.015,.055), s0=t*sr|0;
        for(let i=0;i<L&&s0+i<d.length;i++)
          d[s0+i]+=(rnd()*2-1)*.2*Math.exp(-i/(L*.35))/v.n;
        t+=L/sr;
      }
      const L=sr*R(v.vlen[0],v.vlen[1]), s0=t*sr|0;
      const f0=R(v.f0[0],v.f0[1])*shift, gl=(rnd()-.5)*16, vr=R(4,7);
      for(let i=0;i<L;i++){
        if(s0+i>=d.length) break;
        const ph=i/sr;
        const f=f0+gl*(i/L)+(v.vib?f0*v.vib*Math.sin(TAU*vr*ph):0);
        let x=0;
        for(let h=1;h<=26;h++){
          const fh=f*h; if(fh>sr/2.3) break;
          x+=Math.sin(TAU*fh*ph)*(Math.exp(-Math.pow((fh-F1)/380,2))
            +.6*Math.exp(-Math.pow((fh-F2)/520,2))
            +.35*Math.exp(-Math.pow((fh-F3)/700,2)))/h;
        }
        if(v.harsh) x=Math.tanh(x*(1+v.harsh*7))*(1-v.harsh*.35);
        d[s0+i]+=x*.11*Math.min(1,i/(sr*.012))*Math.min(1,(L-i)/(sr*.05))/Math.sqrt(v.n);
      }
      t+=L/sr+R(v.gap[0],v.gap[1]);
    }
  }
  if(v.band){ const [lo,hi]=v.band;
    const a1=1-Math.exp(-2*Math.PI*hi/sr), a2=1-Math.exp(-2*Math.PI*lo/sr);
    let p1=0,p2=0;
    for(let i=0;i<d.length;i++){ p1+=(d[i]-p1)*a1; p2+=(p1-p2)*a2; d[i]=(p1-p2)*1.7; }
  }
  return b;
}

// ---- остальные методы -------------------------------------------------------
export const MATBIAS={
  'авангард':{голос:5,ноты:4,щипки:4,дрон:1,металл:3,воздух:2,импульсы:2},
  'хип-хоп': {голос:4,ноты:4,щипки:3,дрон:2,металл:2,воздух:1,импульсы:3},
  'техно':   {голос:2,ноты:4,щипки:2,дрон:4,металл:3,воздух:2,импульсы:3}
};
export const SCALES_M=[[0,2,3,5,7,8,10],[0,2,4,7,9],[0,1,3,5,7,8,10],[0,3,5,7,10],[0,2,3,7,9]];

export function pickMethod(seed,profile,tasteW){
  const w=MATBIAS[profile], r=mul32(seed^0x51ed2701);
  const ks=Object.keys(w);
  const wt=ks.map(k=>w[k]*tasteW('mat',k));      // вкус смещает вероятности
  let tot=0; for(const x of wt) tot+=x;
  let v=r()*tot;
  for(let i=0;i<ks.length;i++){ v-=wt[i]; if(v<=0) return ks[i]; }
  return 'голос';
}

export function genMaterial(ctx,seed,profile,tasteW){
  const m=pickMethod(seed,profile,tasteW);
  if(m==='голос') return {buf:genVoice(ctx,voiceFromSeed(seed),mul32(seed^0x9e3779b9)),name:m};
  const r=mul32(seed>>>0), R=(a,b)=>a+r()*(b-a), sr=ctx.sampleRate;
  const dur=12, b=ctx.createBuffer(1,sr*dur,sr), d=b.getChannelData(0);
  const root=R(48,150), sc=SCALES_M[(r()*SCALES_M.length)|0];
  const note=()=>root*Math.pow(2,(sc[(r()*sc.length)|0]+12*((r()*3|0)-1))/12);

  if(m==='ноты'){                       // тональные события с огибающей
    let t=R(.05,.4);
    const sust=r()<.45;
    while(t<dur-.6){
      const f=note(), L=sr*(sust?R(.8,3):R(.06,.5)), s0=t*sr|0;
      const nh=2+(r()*6|0), det=R(0,.012), amp=R(.10,.22);
      for(let i=0;i<L&&s0+i<d.length;i++){
        const ph=i/sr; let x=0;
        for(let h=1;h<=nh;h++) x+=Math.sin(TAU*f*h*(1+det*h)*ph)/h;
        const env=Math.min(1,i/(sr*(sust?.25:.004)))*Math.exp(-i/(L*R(.3,.9)));
        d[s0+i]+=x*amp*env;
      }
      t+=L/sr*R(.25,1)+R(.01,.5);
    }
  } else if(m==='щипки'){               // Карплюс-Стронг
    let t=R(.05,.3);
    while(t<dur-.8){
      const f=note(), N=Math.max(8,Math.round(sr/f)), buf=new Float32Array(N);
      for(let i=0;i<N;i++) buf[i]=r()*2-1;
      const s0=t*sr|0, L=Math.min(d.length-s0,sr*R(.7,3)), amp=R(.22,.4);
      const damp=R(.35,.6), dec=R(.994,.9985);
      let w=0,lp=0;
      for(let i=0;i<L;i++){ const y=buf[w]; lp=lp*(1-damp)+y*damp; buf[w]=lp*dec; w=(w+1)%N;
        d[s0+i]+=y*amp*Math.exp(-i/(sr*R(.8,2.6))); }
      t+=R(.08,1.1);
    }
  } else if(m==='дрон'){                // стоячий гармонический стек с биениями
    const f=note()*.5, parts=[];
    for(let k=1;k<=8;k++) if(r()<.75) parts.push({k,a:R(.2,1)/k,det:R(-.004,.004),p:r()});
    for(let i=0;i<d.length;i++){ const t=i/sr; let x=0;
      for(const q of parts) x+=Math.sin(TAU*f*q.k*(1+q.det)*t+q.p*TAU)*q.a;
      d[i]=x*.14*(.7+.3*Math.sin(TAU*R(.02,.12)*t));
    }
  } else if(m==='металл'){              // негармонические колокола
    let t=R(.05,.5);
    while(t<dur-.9){
      const f=note()*R(1,3), rat=R(1.4,3.7), s0=t*sr|0, L=sr*R(.6,3.2);
      const amp=R(.08,.18), idx=R(2,9);
      for(let i=0;i<L&&s0+i<d.length;i++){
        const ph=i/sr, e=Math.exp(-i/(sr*R(.4,1.6)));
        d[s0+i]+=Math.sin(TAU*f*ph+idx*e*Math.sin(TAU*f*rat*ph))*amp*e;
      }
      t+=R(.2,1.6);
    }
  } else if(m==='воздух'){              // шумовые набухания в полосе
    const fc=R(300,3000), q=R(.05,.3);
    let lp=0,bp=0,t=0;
    const env=[]; let e=0;
    while(t<dur){ const L=sr*R(.4,2.5); const up=r()<.6;
      for(let i=0;i<L;i++) env.push(up?Math.sin(Math.PI*i/L):Math.exp(-i/(L*.4)));
      t+=L/sr; }
    const f=2*Math.sin(Math.PI*fc/sr);
    for(let i=0;i<d.length;i++){
      const nz=r()*2-1;
      lp+=f*bp; const hp=nz-lp-q*bp; bp+=f*hp;
      d[i]=bp*.5*(env[i]||0);
    }
  } else {                              // импульсы: чистый транзиентный материал
    let t=R(.02,.3);
    while(t<dur-.2){
      const s0=t*sr|0, L=sr*R(.003,.09), f=R(60,3000), dec=R(.12,.7);
      const tone=r()<.5;
      for(let i=0;i<L&&s0+i<d.length;i++){
        const e=Math.exp(-i/(L*dec));
        d[s0+i]+=((tone?Math.sin(TAU*f*i/sr):(r()*2-1)))*e*R(.25,.5);
      }
      t+=R(.03,.9);
    }
  }
  // выравниваем: любой метод приходит в память с одинаковым весом
  let pk=0; for(let i=0;i<d.length;i++){ const a=Math.abs(d[i]); if(a>pk)pk=a; }
  if(pk>1e-6){ const g=.2/pk; for(let i=0;i<d.length;i++) d[i]*=g; }
  return {buf:b,name:m};
}

// ---- исток: материал, порождённый по описанию ---------------------------------
// Порождённый звук — это ВХОД, наравне с микрофоном и файлом (решение yala от
// 2026-08-19). Движок по-прежнему только модулирует то, что пришло в память.
// Отбор внутри истока делает CLAP: он согласуется с живыми слушателями лучше,
// чем любая модель, которую мы могли бы выучить на сотне кликов.
export async function истокСписок(){
  try{ const d=await fetch('/исток',{cache:'no-store'}).then(r=>r.json());
    return d.файлы||[]; }catch(e){ return []; }
}
export async function истокЗагрузи(ctx,имя){
  const r=await fetch('/исток/'+encodeURIComponent(имя));
  if(!r.ok) throw new Error('нет файла');
  const buf=await r.arrayBuffer();
  return await ctx.decodeAudioData(buf);
}
export async function истокЗакажи(текст,вариантов,секунд,bpm,тактов){
  await fetch('/заказ',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({t:Date.now(),текст,вариантов:вариантов||3,секунд:секунд||8,
      bpm:bpm||null,тактов:тактов||2})});
}
export async function истокМета(){
  try{ const d=await fetch('/исток/мета',{cache:'no-store'}).then(r=>r.json());
    return d.rows||[]; }catch(e){ return []; }
}
