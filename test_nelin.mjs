// Генератор алиасинга почти не даёт (проверено): переключаясь по границам
// сэмплов, он всегда имеет период в целое число отсчётов, и зеркала ложатся
// на гармоники. Зато у него другая беда — ЧАСТОТА КВАНТУЕТСЯ: доступны
// только SR/n. Здесь проверены обе вещи и отдельно нелинейности, которые
// зеркалят по-настоящему.
const PI = Math.PI, exp = Math.exp;

function fft(re, im){
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++){
    let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b;
    if (i < j){ let t=re[i];re[i]=re[j];re[j]=t; t=im[i];im[i]=im[j];im[j]=t; }
  }
  for (let len = 2; len <= n; len <<= 1){
    const ang = -2*PI/len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len){
      let cr = 1, ci = 0;
      for (let k = 0; k < len/2; k++){
        const ur=re[i+k],ui=im[i+k];
        const vr=re[i+k+len/2]*cr-im[i+k+len/2]*ci, vi=re[i+k+len/2]*ci+im[i+k+len/2]*cr;
        re[i+k]=ur+vr; im[i+k]=ui+vi; re[i+k+len/2]=ur-vr; im[i+k+len/2]=ui-vi;
        const t=cr*wr-ci*wi; ci=cr*wi+ci*wr; cr=t;
      }
    }
  }
}
// доля энергии НЕ на гармониках заданной частоты
function вне(x, SR, f0){
  const N = 16384, re = new Float32Array(N), im = new Float32Array(N);
  for (let i = 0; i < N; i++) re[i] = (x[i]||0)*(.5-.5*Math.cos(2*PI*i/N));
  fft(re, im);
  const Δ = SR/N; let гарм = 0, чужое = 0;
  for (let k = 2; k < N/2; k++){
    const f = k*Δ, p = re[k]*re[k]+im[k]*im[k];
    const бл = Math.round(f/f0);
    (бл >= 1 && Math.abs(f - бл*f0) < 2.5*Δ) ? (гарм += p) : (чужое += p);
  }
  return чужое/(гарм+чужое);
}

console.log('1. КВАНТОВАНИЕ ЧАСТОТЫ генератора: что реально звучит вместо заданного\n');
function реальная(f0, SR, OS){
  const RC = 1/(1.2*f0), dt = 1/(SR*OS);
  let v = .33, q = 1, первый = -1, последний = -1, n = 0;
  const k = 1 - exp(-dt/RC);
  for (let i = 0; i < SR*OS*.5; i++){
    const цель = q?1:0; v += (цель-v)*k;
    if (q ? v > 2/3 : v < 1/3){ if (q){ if (первый<0) первый=i; последний=i; n++; } q ^= 1; }
  }
  return n > 1 ? (n-1)*SR*OS/(последний-первый) : 0;
}
for (const f0 of [300, 1200, 3000, 6000, 9000]){
  const без = реальная(f0, 48000, 1), с = реальная(f0, 48000, 8);
  console.log(`  задано ${String(f0).padStart(5)} Гц → на 48 кГц ${без.toFixed(0).padStart(6)} Гц (${((без/f0-1)*100).toFixed(1)}%)`
            + `   при ×8 ${с.toFixed(0).padStart(6)} Гц (${((с/f0-1)*100).toFixed(1)}%)`);
}

console.log('\n2. НЕЛИНЕЙНОСТИ: зеркала от насыщения и сворачивания\n');
const SR = 48000, N = 40960;      // нецелые отношения к SR — нарочно
function прогнать(нелин, OS){
  const x = new Float32Array(N*OS);
  for (let i = 0; i < N*OS; i++) x[i] = нелин(Math.sin(2*PI*ЧАСТ*i/(SR*OS))*.9);
  if (OS === 1) return x;
  // децимация с фильтром: иначе сама децимация внесёт мусор
  const отв = 129, h = new Float32Array(отв), c = (отв-1)/2; let s0 = 0;
  for (let i = 0; i < отв; i++){ const n = i-c, fc = .45/OS;
    h[i] = (n===0?2*fc:Math.sin(2*PI*fc*n)/(PI*n))*(.54-.46*Math.cos(2*PI*i/(отв-1))); s0 += h[i]; }
  for (let i = 0; i < отв; i++) h[i] /= s0;
  const y = new Float32Array(N);
  for (let i = 0; i < N; i++){ let s = 0;
    for (let j = 0; j < отв; j++){ const k = i*OS - j + c; if (k>=0 && k<x.length) s += h[j]*x[k]; }
    y[i] = s; }
  return y;
}
const нелинейности = {
  'насыщение tanh×8':   v => Math.tanh(v*8),
  'сворачивание sin×5': v => Math.sin(v*5),
  'сворачивание sin×9': v => Math.sin(v*9)
};
globalThis.ЧАСТ = 1109;
for (const ЧАСТОТА of [1109, 3457, 6211]){
  globalThis.ЧАСТ = ЧАСТОТА;
  console.log(`  основная ${ЧАСТОТА} Гц:`);
  for (const [имя, fn] of Object.entries(нелинейности)){
    const п = вне(прогнать(fn, 1), SR, ЧАСТОТА);
    const о = вне(прогнать(fn, 8), SR, ЧАСТОТА);
    console.log(`    ${имя.padEnd(20)} без ${(п*100).toFixed(1).padStart(5)}%   ×8 ${(о*100).toFixed(1).padStart(5)}%   выигрыш ${((п-о)*100).toFixed(1)} п.п.`);
  }
}
