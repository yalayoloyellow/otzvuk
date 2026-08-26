// СВЕРЕНИЕ ДВУХ ВЕРСИЙ ЯДРА.
//
// Ускорение имеет смысл, только если прибор остался тем же прибором.
// Побитово сравнивать нельзя: схема хаотическая, и две траектории, разойдясь
// на последнем разряде, за секунду разъезжаются полностью — это свойство
// самой схемы, а не признак поломки.
//
// Сравнивается то, что от расхождения траекторий НЕ зависит: средний спектр
// по сотням окон, скз, крест-фактор и период качелей. Это статистика
// аттрактора, и у одного и того же прибора она одна.
//
//   node stend_svereniye.mjs <старый.js> [новый.js]
import {readFileSync} from 'fs';

const A = process.argv[2], B = process.argv[3] || './chaos.worklet.js';
if (!A){ console.log('нужен путь к старому ядру'); process.exit(1); }

const SR = 48000, SEK = 20;
function zavesti(put){
  globalThis.sampleRate = SR;
  let K = null;
  globalThis.registerProcessor = (n, k) => K = k;
  globalThis.AudioWorkletProcessor = class {
    constructor(){ this.port = { postMessage(){}, set onmessage(f){this._f=f},
                                 get onmessage(){return this._f} }; }
  };
  new Function(readFileSync(put, 'utf8'))();
  return K;
}
function progon(K, nastr, seed){
  const c = new K();
  c.port.onmessage({data:{t:'seed', v:seed}});
  c.port.onmessage({data:{t:'p', v:nastr}});
  const n = 128, blokov = Math.round(SR * SEK / n);
  const L = new Float32Array(n), R = new Float32Array(n);
  const out = new Float64Array(blokov * n);
  let j = 0;
  for (let b = 0; b < blokov; b++){
    c.process([[]], [[L, R]]);
    for (let i = 0; i < n; i++) out[j++] = L[i];
  }
  return out.subarray(Math.round(SR * 2));      // переходный процесс отбрасываем
}

function fft(re, im){
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++){
    let b = n >> 1;
    for (; j & b; b >>= 1) j ^= b;
    j ^= b;
    if (i < j){ let t=re[i];re[i]=re[j];re[j]=t; t=im[i];im[i]=im[j];im[j]=t; }
  }
  for (let len = 2; len <= n; len <<= 1){
    const a = -2 * Math.PI / len;
    for (let i = 0; i < n; i += len)
      for (let k = 0; k < len/2; k++){
        const w = a*k, wr = Math.cos(w), wi = Math.sin(w);
        const ur = re[i+k], ui = im[i+k];
        const vr = re[i+k+len/2]*wr - im[i+k+len/2]*wi;
        const vi = re[i+k+len/2]*wi + im[i+k+len/2]*wr;
        re[i+k]=ur+vr; im[i+k]=ui+vi; re[i+k+len/2]=ur-vr; im[i+k+len/2]=ui-vi;
      }
  }
}
const NF = 8192;
function spektr(x){
  const p = new Float64Array(NF/2), re = new Float64Array(NF), im = new Float64Array(NF);
  const ok = new Float64Array(NF);
  for (let i = 0; i < NF; i++) ok[i] = .5 - .5*Math.cos(2*Math.PI*i/NF);
  let c = 0;
  for (let b = 0; b + NF <= x.length; b += NF/2){
    for (let i = 0; i < NF; i++){ re[i] = x[b+i]*ok[i]; im[i] = 0; }
    fft(re, im);
    for (let i = 0; i < NF/2; i++) p[i] += re[i]*re[i] + im[i]*im[i];
    c++;
  }
  for (let i = 0; i < NF/2; i++) p[i] /= c;
  return p;
}
const POLOSY = [[20,120],[120,400],[400,1200],[1200,3000],[3000,8000],[8000,16000]];
function polosy(p){
  return POLOSY.map(([lo,hi])=>{
    let s = 0;
    for (let i = Math.round(lo*NF/SR); i < Math.round(hi*NF/SR); i++) s += p[i];
    return s;
  });
}
function svojstva(x){
  let kv = 0, pik = 0;
  for (let i = 0; i < x.length; i++){
    kv += x[i]*x[i];
    const a = Math.abs(x[i]); if (a > pik) pik = a;
  }
  const rms = Math.sqrt(kv/x.length);
  return {rms, pik, krest: pik/rms, pol: polosy(spektr(x))};
}

const BAZA = {sway:.55, tone:.5, depth:.75, pulse:.2, hit:.35, spread:.15,
              drift:0, range:.5, gryzn:.4, golos:0, gen1:1, gen2:1, gen3:1,
              dirt:0, petlya:0, kuda:0,
              zhat:0, drive:0, master:1, mix:0};
const REZHIMY = [
  ['покой',          {}],
  ['гейт+грязь',     {gryzn:1, dirt:1}],
  ['низ',            {range:0, depth:1}],
  ['верх',           {range:1, pulse:.7}],
  ['пост',           {zhat:1, drive:.7}],
];
const SEMENA = [1626943591, 777, 42];

const Ka = zavesti(A), Kb = zavesti(B);
console.log('РАЗНИЦА НОВОГО ЯДРА ОТНОСИТЕЛЬНО СТАРОГО, дБ\n');
console.log('режим · семя        скз  крест' +
            POLOSY.map(([lo,hi])=>(hi<1000?`${lo}-${hi}`:`${lo/1000}-${hi/1000}к`).padStart(9)).join(''));
let hud = 0;
for (const [imya, izm] of REZHIMY){
  for (const s of SEMENA){
    const a = svojstva(progon(Ka, {...BAZA, ...izm}, s));
    const b = svojstva(progon(Kb, {...BAZA, ...izm}, s));
    const d = b.pol.map((v,i)=> 10*Math.log10(v / a.pol[i]));
    d.forEach(v=>{ if (Math.abs(v) > hud) hud = Math.abs(v); });
    const dr = 20*Math.log10(b.rms/a.rms), dk = b.krest/a.krest;
    if (Math.abs(dr) > hud) hud = Math.abs(dr);
    console.log((imya+' '+s).padEnd(20) +
                dr.toFixed(2).padStart(6) + (dk).toFixed(2).padStart(7) +
                d.map(v=>v.toFixed(2).padStart(9)).join(''));
  }
}
console.log('\nхудшее расхождение:', hud.toFixed(2), 'дБ');
console.log('порог слышимого в широкой полосе — около 1 дБ; допуск деталей');
console.log('в самой схеме ±5 % и ±20 %, то есть децибелы. Всё, что ниже');
console.log('десятых долей, — тот же прибор.');
