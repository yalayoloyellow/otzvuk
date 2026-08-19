// АУДИТ физической модели: меряю то, чего в железе быть НЕ МОЖЕТ.
import {readFileSync} from 'fs';
globalThis.sampleRate = 48000;
let K = null;
globalThis.registerProcessor = (n,k) => K = k;
globalThis.AudioWorkletProcessor = class { constructor(){ this.port = {
  postMessage(){}, set onmessage(f){this._f=f}, get onmessage(){return this._f} }; } };
const ИСХ = readFileSync('./хаос.worklet.js','utf8');
new Function(ИСХ)();
const мод = new Function(ИСХ + '\nreturn {Узел, Сборка, Шум, ЧД, dt};')();
const SR = 48000;

// ---- 1. ГЛАДКОСТЬ ЧАСТОТЫ ------------------------------------------------
// Крутим сопротивление мелкими шагами и смотрим, как идёт частота. В схеме
// зависимость идеально гладкая: f = 1/(K·R·C). Ступеньки означают, что
// период липнет к сетке отсчётов.
function голый(R, сек){
  const сб = new мод.Сборка(1);
  const ш = new мод.Шум();
  const у = new мод.Узел(сб, 10e-9, {вверх:.58, вниз:.40}, ш);
  const n = Math.round(1/мод.dt * сек);
  let пер = 0, посл = -1, сум = 0, t = 0;
  for (let i = 0; i < n; i++){
    у.шаг(R, 0, 1e12, 0, 9, 0, 0);
    t += мод.dt;
    if (у.f > 0 && у.тзар === 0 && у.тразр > 0 && посл !== i-1){}
    if (у.щелчок > 0){ if (посл >= 0){ сум += t - посл; пер++; } посл = t; }
  }
  return пер > 0 ? пер / сум : 0;
}
function развёртка(имя, R0, шаг, шт){
  const вт = {вверх:.58, вниз:.40};
  const K = Math.log((1-вт.вниз)/(1-вт.вверх)) + Math.log(вт.вверх/вт.вниз);
  let макс = 0, скачки = 0, прошл = null, стр = [];
  for (let i = 0; i < шт; i++){
    const R = R0 * Math.pow(шаг, i);
    const ждём = 1/(K * R * 10e-9);
    const факт = голый(R, Math.max(.25, 60/ждём));
    const ош = (факт/ждём - 1)*100;
    if (Math.abs(ош) > макс) макс = Math.abs(ош);
    if (прошл !== null && Math.abs(ош - прошл) > .12) скачки++;
    прошл = ош;
    стр.push(`${ждём.toFixed(0)}→${ош>=0?'+':''}${ош.toFixed(2)}%`);
  }
  console.log(`   ${имя}: ${стр.join(' ')}`);
  console.log(`   макс отклонение ${макс.toFixed(2)}%, скачков ${скачки} из ${шт-1}`);
}
console.log('1. ГЛАДКОСТЬ ЧАСТОТЫ (отклонение от 1/(K·R·C), должно быть ровным)');
развёртка('низ ', 1.6e6, .985, 12);
развёртка('верх', 33e3, .985, 12);

// ---- полный прибор -------------------------------------------------------
function прогон(p, сек, семя){
  const пр = new K();
  if (семя) пр.port._f({data:{t:'семя', v:семя}});
  пр.port._f({data:{t:'p', v:p}});
  const n = Math.round(SR*сек), L = new Float32Array(n), b = 128;
  for (let i = 0; i < n; i += b){
    const oL = new Float32Array(b), oR = new Float32Array(b);
    пр.process([], [[oL,oR]]);
    L.set(oL.subarray(0, Math.min(b, n-i)), i);
  }
  return {L, пр};
}
const РОВНО = {качание:.55, характер:.5, размах:0, импульс:.2, дребезг:0,
               удар:.35, развод:0, гуляние:0};
// Порог берётся от самого сигнала: на тихих настройках фиксированный порог
// ловил шум и выдавал тысячи процентов «живости».
function периоды(L, доля){
  let э = 0; for (const v of L) э += v*v;
  const скз = Math.sqrt(э/L.length);
  const п = []; let посл = -1, вверху = false;
  const пг = Math.max(1e-5, скз * (доля || .8));
  for (let s = 1; s < L.length; s++){
    if (!вверху && L[s] > пг){ вверху = true;
      if (посл >= 0){ const T = (s-посл)/SR; if (T > 1/6000 && T < 1/20) п.push(T); }
      посл = s;
    } else if (вверху && L[s] < -пг*.3) вверху = false;
  }
  return п;
}
console.log('\n2. ЖИВОСТЬ (дребезг ВЫКЛЮЧЕН — но схема всё равно не машина)');
const {L: L2} = прогон(РОВНО, 4);
const п2 = периоды(L2);
let отл = 0;
for (let i = 1; i < п2.length; i++) отл += Math.abs(п2[i]-п2[i-1])/п2[i-1];
console.log(`   соседние периоды отличаются на ${(отл/Math.max(1,п2.length-1)*100).toFixed(4)}%`);

console.log('\n3. ДРЕЙФ ОТ НАГРЕВА за 20 секунд');
const {L: L3, пр} = прогон(РОВНО, 20);
function срВыс(L, от, до){
  const п = периоды(L.subarray(Math.round(от*SR), Math.round(до*SR)));
  return п.length ? 1/(п.reduce((a,b)=>a+b,0)/п.length) : 0;
}
const в1 = срВыс(L3, .5, 2), в2 = срВыс(L3, 18, 19.5);
console.log(`   ${в1.toFixed(2)} Гц → ${в2.toFixed(2)} Гц  (${((в2/в1-1)*100).toFixed(3)}%)`);
console.log(`   плата нагрелась на ${пр.пр.темп.toFixed(2)} К, шина ${пр.пр.бат.V.toFixed(2)} В`);

console.log('\n4. УРОВЕНЬ ПО КРАЯМ');
let худш = 0;
for (const [имя,p,с] of [['база',{...РОВНО,размах:.75}],['удар 1',{...РОВНО,размах:.75,удар:1}],
                         ['всё макс',{качание:.55,характер:1,размах:1,импульс:1,дребезг:1,удар:1,развод:1,гуляние:1}],
                         ['характер 0',{...РОВНО,характер:0,размах:1,удар:1}],
                         ['сборка B',{...РОВНО,размах:.75},777777],
                         ['сборка C',{...РОВНО,размах:.75},4242424]]){
  const {L} = прогон(p, 4, с);
  let п = 0, э = 0;
  for (const v of L){ const a = Math.abs(v); if (a > п) п = a; э += v*v; }
  худш = Math.max(худш, п);
  console.log(`   ${имя.padEnd(12)} пик ${п.toFixed(3)}  скз ${Math.sqrt(э/L.length).toFixed(3)}`);
}
console.log(худш < .97 ? '   клиппинга нет' : '   КЛИППИТ');
