// Каждая ручка обязана быть слышна и делать СВОЁ. Мерю то, что называю:
// петля — тембр, дребезг — джиттер фронтов, удар — низ и ударность.
import {readFileSync} from 'fs';
globalThis.sampleRate = 48000;
let K = null;
globalThis.registerProcessor = (n,k) => K = k;
globalThis.AudioWorkletProcessor = class { constructor(){ this.port = {
  postMessage(){}, set onmessage(f){this._f=f}, get onmessage(){return this._f} }; } };
new Function(readFileSync('./хаос.worklet.js','utf8'))();
const SR = 48000;
function прогон(p, сек, семя){
  const пр = new K();
  if (семя !== undefined) пр.port._f({data:{t:'семя', v:семя}});
  пр.port._f({data:{t:'p', v:p}});
  const n = Math.round(SR*сек), L = new Float32Array(n), b = 128;
  for (let i = 0; i < n; i += b){
    const oL = new Float32Array(b), oR = new Float32Array(b);
    пр.process([], [[oL,oR]]);
    L.set(oL.subarray(0, Math.min(b, n-i)), i);
  }
  return L;
}
// спектральный центроид — «яркость»
function центроид(L){
  const N = 4096; let сум = 0, вес = 0;
  for (let ф = 40; ф < 8000; ф *= 1.09){
    const ω = 2*Math.PI*ф/SR; let re = 0, im = 0;
    for (let i = 0; i < N; i++){ const s = L[L.length-N+i]; re += s*Math.cos(ω*i); im += s*Math.sin(ω*i); }
    const a = Math.sqrt(re*re+im*im)/N;
    сум += a*ф; вес += a;
  }
  return вес > 0 ? сум/вес : 0;
}
// джиттер: разброс соседних периодов колебания
function джиттер(L){
  const пер = []; let пред = -1, вверху = false;
  for (let s = 1; s < L.length; s++){
    if (!вверху && L[s] > .02){ вверху = true;
      if (пред >= 0){ const T = (s-пред)/SR; if (T > 1/6000 && T < 1/20) пер.push(T); }
      пред = s;
    } else if (вверху && L[s] < -.006) вверху = false;
  }
  if (пер.length < 20) return 0;
  let сум = 0, n = 0;
  for (let i = 1; i < пер.length; i++){
    const о = (пер[i]-пер[i-1])/((пер[i]+пер[i-1])/2);
    if (Math.abs(о) < .5){ сум += Math.abs(о); n++; }
  }
  return n ? сум/n : 0;
}
function низ(L, гр){
  let lp = 0, э = 0, вс = 0;
  const k = 2*Math.PI*гр/SR;
  for (let i = 0; i < L.length; i++){ lp += (L[i]-lp)*k; э += lp*lp; вс += L[i]*L[i]; }
  return э/Math.max(1e-9, вс);
}
function пикфактор(L){
  let п = 0, э = 0;
  for (const v of L){ const a = Math.abs(v); if (a > п) п = a; э += v*v; }
  return п/Math.sqrt(э/L.length || 1e-9);
}
const баз = {пульс:.6, частота:.5, размах:.75, скважность:.2, дребезг:0, удар:0,
             гуляние:0, фильтр:.75, батарея:.12};
function строка(имя, L){
  return '  ' + имя.padEnd(14) +
    'яркость ' + центроид(L).toFixed(0).padStart(5) + ' Гц' +
    '   джиттер ' + (джиттер(L)*100).toFixed(1).padStart(5) + '%' +
    '   низ<100 ' + (низ(L,100)*100).toFixed(0).padStart(3) + '%' +
    '   пик/скз ' + пикфактор(L).toFixed(2).padStart(5);
}
console.log('СКВАЖНОСТЬ (полый → резкий)');
for (const v of [0,.35,.7,1]) console.log(строка('скваж '+v, прогон({...баз, скважность:v}, 5)));
console.log('\nДРЕБЕЗГ');
for (const v of [0,.2,.5,1]) console.log(строка('дребезг '+v, прогон({...баз, дребезг:v}, 5)));
console.log('\nУДАР');
for (const v of [0,.3,.6,1]) console.log(строка('удар '+v, прогон({...баз, удар:v}, 5)));
console.log('\nПЕРЕСБОРКА (Tab) — четыре разные сборки, ручки одинаковые');
for (const с of [1, 12345, 777777, 4242424]) console.log(строка('семя '+с, прогон(баз, 5, с)));
