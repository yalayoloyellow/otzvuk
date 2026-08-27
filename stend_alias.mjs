// ЗАМЕР АЛИАСИНГА — честный.
//
// Прошлый замер был негоден, и это важно помнить: там сравнивались два
// ЗАПУСКА с разной передискретизацией. В хаотической схеме два запуска
// расходятся сами по себе за доли секунды, и мерилось расхождение
// траекторий, а не заворот частот. Оттого однократная и выходила «лучше»
// четырёхкратной — чего быть не может.
//
// Здесь ОДНА траектория. Прибор считается раз, при восьмикратной, и сырой
// сигнал снимается ДО сведения. Дальше из этой одной записи получаются все
// варианты: точки берутся реже — ровно так, как их брал бы прибор, считай он
// с меньшей частотой, — и прогоняются через тот самый фильтр сведения.
// Расходиться нечему: материал один и тот же.
//
// Эталон — тот же сигнал, сведённый к 48 кГц крутым фильтром, который не
// заворачивает ничего. Разница с ним и есть та грязь, которой в звуке быть
// не должно.
import {readFileSync} from 'fs';

const SEK = 20, SR = 48000, VERH = 8;   // считаем при 384 кГц
globalThis.sampleRate = SR;
let K = null;
globalThis.registerProcessor = (n, k) => K = k;
globalThis.AudioWorkletProcessor = class {
  constructor(){ this.port = { postMessage(){}, set onmessage(f){this._f=f},
                               get onmessage(){return this._f} }; }
};

// --- снимаем сырой сигнал до сведения ---------------------------------------
let SRC = readFileSync('./chaos.worklet.js', 'utf8');
SRC = SRC.replace('const OVER = 4;', 'const OVER = ' + VERH + ';');
// Якорь по ОДНОЙ строке начала вызова, а не по всему вызову: сигнатура
// prа растёт, и полный якорь дважды молча устаревал.
const met = 'y = this.svod.step(this.pr.step(';
if (!SRC.includes(met)) throw new Error('не нашёл точку съёма сырого сигнала');
{
  const i = SRC.indexOf(met);
  // Конец вызова — закрывающая скобка со «;» той же вложенности.
  let j = SRC.indexOf('(', i + met.length - 1), gl = 1;
  j = i + met.length;
  gl = 2;                                  // открыты svod.step( и pr.step(
  while (gl > 0) { const c = SRC[j++]; if (c === '(') gl++; else if (c === ')') gl--; }
  const vyzov = SRC.slice(i, j);           // y = this.svod.step(this.pr.step(...))
  const vnutri = vyzov.slice(vyzov.indexOf('this.pr.step'), -1);
  SRC = SRC.slice(0, i) +
    'const syr = ' + vnutri + ';\n' +
    '        globalThis.SYR[globalThis.SYRN++] = syr;\n' +
    '        y = this.svod.step(syr)' + SRC.slice(j);
}
new Function(SRC)();

const NSYR = SR * VERH * SEK;
globalThis.SYR = new Float64Array(NSYR + SR * VERH);
globalThis.SYRN = 0;

const BAZA = {sway:.55, tone:.5, depth:.75, range:.5, gryzn:.4, golos:0, gen1:1, gen2:1, gen3:1,
              dirt:0, petlya:0, kuda:0,
              zhat:0, drive:0, master:1, mix:0};

const c = new K();
c.port.onmessage({data:{t:'seed', v:1626943591}});
c.port.onmessage({data:{t:'p', v:BAZA}});
{
  const n = 128, L = new Float32Array(n), R = new Float32Array(n);
  while (globalThis.SYRN < NSYR) c.process([[]], [[L, R]]);
}
const syr = globalThis.SYR.subarray(0, NSYR);
console.log('сырой сигнал снят:', (NSYR/1e6).toFixed(2), 'млн отсчётов при',
            SR*VERH/1000, 'кГц\n');

// --- ФИЛЬТРЫ ----------------------------------------------------------------
// Окно Блэкмана на синке: обычный оконный НЧ, честный и предсказуемый.
function sinkFIR(taps, otn){
  const h = new Float64Array(taps), c0 = (taps - 1) / 2;
  let s = 0;
  for (let i = 0; i < taps; i++){
    const x = i - c0;
    const sy = x === 0 ? 2 * otn : Math.sin(2 * Math.PI * otn * x) / (Math.PI * x);
    const w = .42 - .5*Math.cos(2*Math.PI*i/(taps-1)) + .08*Math.cos(4*Math.PI*i/(taps-1));
    h[i] = sy * w; s += h[i];
  }
  for (let i = 0; i < taps; i++) h[i] /= s;
  return h;
}
// Свёртка с прореживанием: считаем только те отсчёты, что оставляем.
function svernut(x, h, shag){
  const n = Math.floor((x.length - h.length) / shag);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++){
    let a = 0; const b = i * shag;
    for (let k = 0; k < h.length; k++) a += h[k] * x[b + k];
    y[i] = a;
  }
  return y;
}
// Фильтр сведения ровно такой, какой стоит в приборе, — но для своей частоты.
function svod(fs){
  const fc = SR * .43, Kt = Math.tan(Math.PI * fc / fs), b = [];
  for (const Q of [.5412, 1.3066]){
    const n = 1 / (1 + Kt/Q + Kt*Kt);
    b.push([Kt*Kt*n, 2*Kt*Kt*n, Kt*Kt*n, 2*(Kt*Kt-1)*n, (1 - Kt/Q + Kt*Kt)*n]);
  }
  const z = [[0,0,0,0],[0,0,0,0]];
  return x => {
    for (let i = 0; i < 2; i++){
      const [b0,b1,b2,a1,a2] = b[i], q = z[i];
      const y = b0*x + b1*q[0] + b2*q[1] - a1*q[2] - a2*q[3];
      q[1] = q[0]; q[0] = x; q[3] = q[2]; q[2] = y;
      x = y;
    }
    return x;
  };
}

// --- ПРЯМОЙ УЧЁТ ЗАВОРОТА ---------------------------------------------------
// Вычитать волны нельзя: у фильтра сведения фаза своя на каждой частоте, и
// разница двух путей вышла бы больше самого сигнала. Считаем иначе, без
// всякого выравнивания.
//
// Точка на частоте f, взятая с частотой fs, неотличима от точки на частоте
// |f − k·fs| — она ЗАВОРАЧИВАЕТСЯ. Значит в готовом отсчёте на частоте g
// лежит сумма всего, что заворачивается в g: своё (f = g) и чужое. Спектр
// сырого сигнала у нас есть, ход фильтра сведения известен — остаётся
// сложить.
//
// Это и есть определение алиасинга, взятое буквально.

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
    for (let i = 0; i < n; i += len){
      for (let k = 0; k < len/2; k++){
        const w = a*k, wr = Math.cos(w), wi = Math.sin(w);
        const ur = re[i+k], ui = im[i+k];
        const vr = re[i+k+len/2]*wr - im[i+k+len/2]*wi;
        const vi = re[i+k+len/2]*wi + im[i+k+len/2]*wr;
        re[i+k]=ur+vr; im[i+k]=ui+vi;
        re[i+k+len/2]=ur-vr; im[i+k+len/2]=ui-vi;
      }
    }
  }
}
// Средний спектр по многим окнам: одиночное окно в хаосе ничего не значит,
// а средний по сотням — устойчивая величина, и расхождению траекторий в нём
// уже нечего портить.
const NF = 8192;
function spektr(x){
  const p = new Float64Array(NF/2), re = new Float64Array(NF), im = new Float64Array(NF);
  const okno = new Float64Array(NF);
  for (let i = 0; i < NF; i++) okno[i] = .5 - .5*Math.cos(2*Math.PI*i/NF);
  let ok = 0;
  for (let b = 0; b + NF <= x.length; b += NF/2){
    for (let i = 0; i < NF; i++){ re[i] = x[b+i]*okno[i]; im[i] = 0; }
    fft(re, im);
    for (let i = 0; i < NF/2; i++) p[i] += re[i]*re[i] + im[i]*im[i];
    ok++;
  }
  for (let i = 0; i < NF/2; i++) p[i] /= ok;
  return p;
}

// Добротности звеньев Баттерворта порядка 2m: Q = 1/(2cos(π(2k+1)/4m)).
function butter(m){
  const Q = [];
  for (let k = 0; k < m; k++) Q.push(1 / (2 * Math.cos(Math.PI * (2*k+1) / (4*m))));
  return Q;
}
const SVOD4 = butter(2), SVOD8 = butter(4);

// Ход фильтра сведения по мощности, на частоте f при частоте счёта fs.
function hodSvoda(f, fs, zvenya = SVOD4, otn = .43){
  const fc = SR * otn, Kt = Math.tan(Math.PI * fc / fs);
  const w = 2 * Math.PI * f / fs, cr = Math.cos(w), sr = Math.sin(w);
  let g = 1;
  for (const Q of zvenya){
    const n = 1 / (1 + Kt/Q + Kt*Kt);
    const b0 = Kt*Kt*n, b1 = 2*Kt*Kt*n, b2 = Kt*Kt*n;
    const a1 = 2*(Kt*Kt-1)*n, a2 = (1 - Kt/Q + Kt*Kt)*n;
    // |b0 + b1e^-jw + b2e^-2jw|² / |1 + a1e^-jw + a2e^-2jw|²
    const c2 = Math.cos(2*w), s2 = Math.sin(2*w);
    const chR = b0 + b1*cr + b2*c2, chI = -(b1*sr + b2*s2);
    const znR = 1  + a1*cr + a2*c2, znI = -(a1*sr + a2*s2);
    g *= (chR*chR + chI*chI) / (znR*znR + znI*znI);
  }
  return g;
}

const P = spektr(syr);                      // спектр сырого при 384 кГц
const DF = SR * VERH / NF;                  // ширина ячейки, Гц
const GRAN = Math.round(SR / 2 / DF);       // ячейка на 24 кГц
// Сетка подобрана так, что 24 и 48 кГц попадают в границы ячеек ровно,
// иначе заворот размазался бы между соседними и число потеряло смысл.
if (Math.abs(SR / DF - Math.round(SR / DF)) > 1e-9) throw new Error('сетка не делится');

function zavernut(N, zvenya = SVOD4, otn = .43){
  const fs = SR * N;
  const svoy = new Float64Array(GRAN), chuzhoy = new Float64Array(GRAN);
  for (let i = 1; i < P.length; i++){
    const f = i * DF;
    // куда заворачивается при съёме с частотой fs — там и работает фильтр
    let m = f % fs; const f1 = m <= fs/2 ? m : fs - m;
    // куда заворачивается в готовые 48 кГц
    m = f % SR; const g = m <= SR/2 ? m : SR - m;
    const gi = Math.min(GRAN - 1, Math.round(g / DF));
    const e = P[i] * hodSvoda(f1, fs, zvenya, otn);
    if (f < SR/2) svoy[gi] += e; else chuzhoy[gi] += e;
  }
  return {svoy, chuzhoy};
}

const POLOSY = [[20,200],[200,1000],[1000,3000],[3000,6000],[6000,10000],
                [10000,14000],[14000,18000],[18000,23000]];
function poPolosam(a){
  return POLOSY.map(([lo,hi])=>{
    let s = 0;
    for (let i = Math.round(lo/DF); i < Math.round(hi/DF) && i < GRAN; i++) s += a[i];
    return s;
  });
}

console.log('ЗАВЁРНУТОЕ ОТНОСИТЕЛЬНО СВОЕГО, дБ');
const KOL = [1,2,'2к','2к-',4,8];
const SHAP = {1:'×1',2:'×2','2к':'×2 8п','2к-':'×2 8п↓',4:'×4',8:'×8'};
console.log('полоса, Гц     ' + KOL.map(n=>SHAP[n].padStart(9)).join(''));
const rez = {};
for (const N of [1,2,4,8]) rez[N] = zavernut(N);
// Вдвое реже считать, но крутле сводить: восемь полюсов при 96 кГц стоят
// ровно столько же, сколько четыре при 192 — а вся схема при этом вдвое
// дешевле. Вопрос только в том, хватает ли крутизны.
rez['2к'] = zavernut(2, SVOD8);
rez['2к-'] = zavernut(2, SVOD8, .40);
POLOSY.forEach(([lo,hi],k)=>{
  const stroka = [`${lo}–${hi}`.padEnd(15)];
  for (const N of KOL){
    const sv = poPolosam(rez[N].svoy)[k], ch = poPolosam(rez[N].chuzhoy)[k];
    stroka.push((10*Math.log10(ch/sv + 1e-30)).toFixed(1).padStart(9));
  }
  console.log(stroka.join(''));
});

// Итог по всей слышимой полосе — одно число, по которому и решаем.
console.log('');
for (const N of KOL){
  let sv = 0, ch = 0;
  for (let i = 1; i < GRAN; i++){ sv += rez[N].svoy[i]; ch += rez[N].chuzhoy[i]; }
  console.log(SHAP[N].padEnd(7), 'завёрнутого', (10*Math.log10(ch/sv)).toFixed(1).padStart(6),
              'дБ  = ' + (100*Math.sqrt(ch/sv)).toFixed(2) + '% по напряжению');
}
console.log('\n−60 дБ за пределом слышимого · −40 дБ процент грязи · −20 дБ призвук');
