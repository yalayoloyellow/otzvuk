// ============================================================================
//  МОДЕЛЬ ВКУСА
//  Два разных вопроса, поэтому две модели.
//  1. ГОДНОСТЬ. «Мимо или не мимо» — восемь из десяти были мимо, значит
//     главный выигрыш здесь: отсеять негодное ДО того, как оно прозвучит.
//     Логистическая регрессия на всех признаках.
//  2. ПРЕДПОЧТЕНИЕ. Из двух годных — какая лучше. Парное ранжирование.
//  Итоговая оценка — произведение: годное и притом любимое.
//  Обе учатся на одном журнале кликов, поэтому три сотни пар действительно
//  дадут закономерность, а не просто подвинут четыре ползунка.
// ============================================================================
import {KEYS} from './feat.js';

export function emptyModel(){
  const w={}, r={};
  for(const k of KEYS){ w[k]=0; r[k]=0; }
  return {w, b:0, r, n:0};
}

const dot=(w,f,b)=>{ let s=b||0; for(const k of KEYS) s+=w[k]*(f[k]||0); return s; };
const sig=z=>1/(1+Math.exp(-z));

export function fitness(m,f){ return sig(dot(m.w,f,m.b)); }
export function preference(m,f){ return dot(m.r,f,0); }
export function score(m,f){
  // Годность решает: тема, которую отвергнут, не должна выигрывать
  // ни за какие красивые числа.
  return fitness(m,f)*(1+.35*Math.tanh(preference(m,f)));
}

// Журнал: {f, ok} — годна ли; и пары {a,b,win} — кто кого.
export function train(model,log,opts){
  const o=opts||{}, epochs=o.epochs||60, lr=o.lr||.12, reg=o.reg||.004;
  const m={w:{...model.w}, b:model.b, r:{...model.r}, n:log.length};
  const marks=[], pairs=[];
  for(const e of log){
    if(e.a&&e.b){
      if(e.win==='a'){ marks.push([e.a,1]); marks.push([e.b,0]); pairs.push([e.a,e.b]); }
      else if(e.win==='b'){ marks.push([e.b,1]); marks.push([e.a,0]); pairs.push([e.b,e.a]); }
      else { marks.push([e.a,0]); marks.push([e.b,0]); }   // обе мимо
    }
  }
  // 1. годность — логистическая регрессия
  for(let ep=0;ep<epochs;ep++){
    for(const [f,y] of shuffle(marks,ep)){
      const p=sig(dot(m.w,f,m.b)), g=(y-p)*lr;
      for(const k of KEYS) m.w[k]+=g*(f[k]||0)-lr*reg*m.w[k];
      m.b+=g;
    }
  }
  // 2. предпочтение — парное ранжирование с зазором
  for(let ep=0;ep<epochs;ep++){
    for(const [win,lose] of shuffle(pairs,ep+7)){
      const diff=dot(m.r,win,0)-dot(m.r,lose,0);
      if(diff<1){
        for(const k of KEYS)
          m.r[k]+=lr*.6*(((win[k]||0)-(lose[k]||0))-reg*m.r[k]);
      }
    }
  }
  return m;
}

// Перемешивание без Math.random: порядок должен быть воспроизводим,
// иначе одна и та же выборка даёт разные модели и сравнивать нечего.
function shuffle(arr,seed){
  const a=[...arr]; let s=(seed*2654435761)>>>0;
  for(let i=a.length-1;i>0;i--){
    s=(Math.imul(s,1664525)+1013904223)>>>0;
    const j=s%(i+1); const t=a[i]; a[i]=a[j]; a[j]=t;
  }
  return a;
}

// Что модель поняла: признаки, сильнее всего толкающие оценку.
export function explain(m,top){
  const rows=KEYS.map(k=>({k, годность:m.w[k], вкус:m.r[k],
    сила:Math.abs(m.w[k])+Math.abs(m.r[k])}));
  rows.sort((a,b)=>b.сила-a.сила);
  return rows.slice(0,top||8);
}
