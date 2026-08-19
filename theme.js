// ============================================================================
//  ОТБОР ТЕМЫ
//  В жанре тема живёт сотню тактов, поэтому брать первое попавшееся семя —
//  расточительство: половина тем никакая. Здесь кандидаты рендерятся
//  беззвучно и оцениваются, играет лучший.
//
//  Критерии взяты не с потолка: исследование Hooked (ISMIR) связывает
//  «цепкость» с повторяемостью, ясностью ведущего голоса и его выделенностью.
//  Наши измеримые аналоги — тональная определённость, ритмическая
//  повторяемость, резкость атак и яркость. Веса калибруются ушами yala:
//  средние по чужим слушателям нам не указ.
// ============================================================================

// Тональная определённость: максимум нормированной автокорреляции в
// диапазоне 45–450 Гц. Шум и каша дают низкое значение, ясная высота — высокое.
export function tonality(x,sr){
  const n=Math.min(x.length,sr*2);
  const lo=Math.floor(sr/450), hi=Math.floor(sr/45);
  let e0=0; for(let i=0;i<n;i++) e0+=x[i]*x[i];
  if(e0<1e-9) return 0;
  let best=0;
  for(let lag=lo;lag<=hi;lag+=2){
    let s=0,e1=0;
    for(let i=0;i+lag<n;i+=4){ s+=x[i]*x[i+lag]; e1+=x[i+lag]*x[i+lag]; }
    let e2=0; for(let i=0;i+lag<n;i+=4) e2+=x[i]*x[i];
    const d=Math.sqrt(e1*e2);
    if(d>1e-12){ const c=s/d; if(c>best) best=c; }
  }
  return Math.max(0,best);
}

// Огибающая по окнам 10 мс — общая основа для ритмических метрик.
function envelope(x,sr){
  const W=Math.round(sr*.01), K=Math.floor(x.length/W), e=new Float32Array(K);
  for(let k=0;k<K;k++){ let s=0;
    for(let i=k*W;i<(k+1)*W;i++) s+=x[i]*x[i];
    e[k]=Math.sqrt(s/W); }
  return e;
}

// Резкость атак — изрезанность огибающей: разброс приращений к среднему
// уровню. Первая версия считала долю нарастаний в общем движении и всегда
// давала половину: у любого сигнала, который возвращается к нулю, сумма
// подъёмов равна сумме спадов. Метрика ничего не различала.
export function attack(x,sr){
  const e=envelope(x,sr), K=e.length;
  if(K<4) return 0;
  let m=0; for(let k=0;k<K;k++) m+=e[k]; m/=K;
  if(m<1e-9) return 0;
  let s=0,c=0;
  for(let k=1;k<K;k++){ const d=e[k]-e[k-1]; s+=d*d; c++; }
  const rough=Math.sqrt(s/c)/m;      // 0 — ровный гул, >1 — сплошные удары
  return Math.max(0,Math.min(1,rough*.9));
}

// Ритмическая повторяемость: автокорреляция огибающей на масштабе 0.2–2.5 с.
// Тема с внутренним рисунком даёт выраженный пик, ровный гул — нет.
export function repetition(x,sr){
  const e=envelope(x,sr), K=e.length;
  let m=0; for(let k=0;k<K;k++) m+=e[k]; m/=K||1;
  const d=new Float32Array(K);
  for(let k=0;k<K;k++) d[k]=e[k]-m;
  let e0=0; for(let k=0;k<K;k++) e0+=d[k]*d[k];
  if(e0<1e-12) return 0;
  const lo=Math.round(.2/.01), hi=Math.min(K-4,Math.round(2.5/.01));
  let best=0;
  for(let lag=lo;lag<hi;lag++){
    let s=0; for(let k=0;k+lag<K;k++) s+=d[k]*d[k+lag];
    const c=s/e0; if(c>best) best=c;
  }
  return Math.max(0,Math.min(1,best));
}

// Яркость: доля энергии выше ~1.5 кГц. Слишком тёмная тема тонет под битом,
// слишком яркая режет — обе крайности штрафуются при оценке.
export function brightness(x,sr){
  const a=1-Math.exp(-2*Math.PI*1500/sr);
  let lp=0, eLo=0, eAll=0;
  for(let i=0;i<x.length;i++){ lp+=(x[i]-lp)*a; eLo+=lp*lp; eAll+=x[i]*x[i]; }
  return eAll>1e-12 ? Math.max(0,1-eLo/eAll) : 0;
}

export function features(buf){
  const sr=buf.sampleRate, L=buf.getChannelData(0), R=buf.getChannelData(1);
  const n=L.length, x=new Float32Array(n);
  for(let i=0;i<n;i++) x[i]=(L[i]+R[i])*.5;
  return { tonality:tonality(x,sr), attack:attack(x,sr),
           repetition:repetition(x,sr), brightness:brightness(x,sr) };
}

// Веса по умолчанию — из тех же исследований; калибровка ушами их подвинет.
export const DEFAULT_W={ tonality:1, attack:.7, repetition:1.2, brightness:.5 };

export function score(f,w){
  w=w||DEFAULT_W;
  // яркость оценивается по близости к середине: крайности одинаково плохи
  const bri=1-Math.abs(f.brightness-.42)*2;
  return f.tonality*w.tonality + f.attack*w.attack +
         f.repetition*w.repetition + Math.max(0,bri)*w.brightness;
}

// ---- калибровка весов по парным выборам --------------------------------------
// Задача ранжирования: если yala выбрал А против Б, вес признака двигается в
// сторону того, чем А превосходит Б. Простое правило перцептрона: медленно,
// понятно и не требует ничего, кроме десятка пар.
export function learnPair(w,winner,loser,rate){
  const k=rate||.35, out={...w};
  for(const key of Object.keys(out)){
    const a=key==='brightness'?briTerm(winner):winner[key];
    const b=key==='brightness'?briTerm(loser):loser[key];
    out[key]=Math.max(.05,Math.min(3,out[key]+k*(a-b)));
  }
  return out;
}
// «Обе мимо»: признаки, выраженные у обеих, теряют вес — раз такие темы
// не нравятся, то и цениться они должны меньше.
export function learnBothBad(w,a,b,rate){
  const k=rate||.12, out={...w};
  for(const key of Object.keys(out)){
    const va=key==='brightness'?briTerm(a):a[key];
    const vb=key==='brightness'?briTerm(b):b[key];
    const m=(va+vb)/2;
    if(m>.5) out[key]=Math.max(.05,out[key]-k*(m-.5)*2);
  }
  return out;
}
function briTerm(f){ return Math.max(0,1-Math.abs(f.brightness-.42)*2); }
