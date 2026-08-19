// ЧЕСТНЫЙ ТЕСТ АЛИАСИНГА.
//
// Прошлый тест искал гармоники на номинальной частоте и промахивался мимо
// всех, потому что реальная частота из-за квантования другая — он показывал
// 100% мусора при любых условиях и не различал ничего.
//
// Правильный метод: посчитать то же самое на восьмикратной частоте (там
// зеркала уезжают далеко вверх), опустить вниз качественным фильтром — это
// эталон. Разница между ним и прямым расчётом и есть алиасинг, без всяких
// предположений о том, где должны стоять гармоники.
const exp = Math.exp, PI = Math.PI;

function генератор(RC, SR, N, суб){
  const out = new Float32Array(N);
  let v = .33, q = 1;
  const dt = 1/SR, k = 1 - exp(-dt/RC);
  for (let i = 0; i < N; i++){
    const цель = q ? 1 : 0, было = v;
    v += (цель - v) * k;
    let y = q ? 1 : -1;
    const порог = q ? 2/3 : 1/3;
    if (q ? v > порог : v < порог){
      if (суб){
        // доля шага до пересечения — из точного решения экспоненты
        const d = Math.max(1e-9, Math.abs(было - цель));
        const τ = -Math.log(Math.abs(порог - цель)/d) * RC;
        const доля = Math.max(0, Math.min(1, τ/dt));
        y = (q?1:-1)*доля + (q?-1:1)*(1-доля);   // ступенька в правильной точке
      }
      q ^= 1;
    }
    out[i] = y;
  }
  return out;
}

// ФНЧ окном Кайзера, срез .45·SR/OS — чтобы децимация не вносила своего мусора
function фнч(x, OS, отводов=257){
  const fc = .45/OS, h = new Float32Array(отводов), c = (отводов-1)/2;
  let сум = 0;
  for (let i = 0; i < отводов; i++){
    const n = i - c;
    const sinc = n === 0 ? 2*fc : Math.sin(2*PI*fc*n)/(PI*n);
    const w = .54 - .46*Math.cos(2*PI*i/(отводов-1));
    h[i] = sinc*w; сум += h[i];
  }
  for (let i = 0; i < отводов; i++) h[i] /= сум;
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++){
    let s = 0;
    for (let j = 0; j < отводов; j++){ const k = i - j + c;
      if (k >= 0 && k < x.length) s += h[j]*x[k]; }
    y[i] = s;
  }
  return y;
}

function fft(re, im){
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++){
    let b = n >> 1;
    for (; j & b; b >>= 1) j ^= b;
    j ^= b;
    if (i < j){ let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1){
    const ang = -2*PI/len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len){
      let cr = 1, ci = 0;
      for (let k = 0; k < len/2; k++){
        const ur = re[i+k], ui = im[i+k];
        const vr = re[i+k+len/2]*cr - im[i+k+len/2]*ci;
        const vi = re[i+k+len/2]*ci + im[i+k+len/2]*cr;
        re[i+k] = ur+vr; im[i+k] = ui+vi;
        re[i+k+len/2] = ur-vr; im[i+k+len/2] = ui-vi;
        const t = cr*wr - ci*wi; ci = cr*wi + ci*wr; cr = t;
      }
    }
  }
}

// Реальную частоту меряем по сигналу, а не берём номинальную: из-за
// квантования переключений она уезжает, и прошлый тест из-за этого
// промахивался мимо ВСЕХ гармоник и показывал 100% мусора всегда.
function основная(x, SR){
  let e0 = 0; for (const v of x) e0 += v*v;
  let лучш = 0, лучшая = -1;
  for (let lag = Math.floor(SR/8000); lag < Math.floor(SR/60); lag++){
    let s = 0;
    for (let i = 0; i + lag < x.length; i++) s += x[i]*x[i+lag];
    const c = s/e0;
    if (c > лучшая){ лучшая = c; лучш = lag; }
  }
  return SR/лучш;
}

// Доля энергии, НЕ попавшая в окрестности гармоник реальной основной.
// Это и есть алиасинг плюс шум квантования — всё, чего в аналоге нет.
function внеполосная(x, SR){
  const N = 16384;
  const re = new Float32Array(N), im = new Float32Array(N);
  for (let i = 0; i < N; i++) re[i] = (x[i + 4000] || 0) * (.5 - .5*Math.cos(2*PI*i/N));
  fft(re, im);
  const f0 = основная(x.subarray(4000, 4000+8192), SR);
  const Δ = SR/N;
  let гарм = 0, чужое = 0;
  for (let k = 2; k < N/2; k++){
    const f = k*Δ, p = re[k]*re[k] + im[k]*im[k];
    const бл = Math.round(f/f0);
    const рядом = бл >= 1 && Math.abs(f - бл*f0) < Math.max(3*Δ, f0*.01);
    рядом ? (гарм += p) : (чужое += p);
  }
  return {доля: чужое/(гарм+чужое), f0};
}

function энергия(x){ let s = 0; for (const v of x) s += v*v; return s; }

function артефакт(f0, SR, OS, суб){
  const RC = 1/(1.2*f0), N = 40960;   // с запасом под окно БПФ и отступ
  const прямо = генератор(RC, SR, N, суб);
  const густо = генератор(RC, SR*OS, N*OS, суб);
  const сглаж = фнч(густо, OS);
  const эталон = new Float32Array(N);
  for (let i = 0; i < N; i++) эталон[i] = сглаж[i*OS];
  // Сравниваем СПЕКТРЫ, а не сигналы во времени: из-за разного квантования
  // фазы неизбежно разъезжаются, и разность двух правильных сигналов даёт
  // двойную энергию — прошлая версия так и намерила 232%.
  const A = внеполосная(прямо, SR), B = внеполосная(эталон, SR);
  return {прямо: A.доля, эталон: B.доля, f0: A.f0, f0э: B.f0};
}

console.log('АЛИАСИНГ: доля энергии ВНЕ гармоник реальной основной частоты\n');
console.log('задано   прямой расчёт          эталон ×8            субсэмпл');
for (const f0 of [200, 800, 2000, 5000]){
  const без = артефакт(f0, 48000, 8, false);
  const с   = артефакт(f0, 48000, 8, true);
  console.log(`${String(f0).padStart(5)} Гц  вне гармоник ${(без.прямо*100).toFixed(1).padStart(5)}%   эталон ${(без.эталон*100).toFixed(1).padStart(5)}%   с субсэмплом ${(с.прямо*100).toFixed(1).padStart(5)}%`);
}
